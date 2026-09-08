-- =====================================================================
-- GESTOR DOCUMENTAL INTERNO — Migración inicial
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 1. TIPOS ----------
create type rol_global   as enum ('admin', 'editor', 'lector');
create type nivel_acceso as enum ('lectura', 'edicion');
-- 'admin'  : administra usuarios, áreas y permisos; ve todo y ve la auditoría
-- 'editor' : sube y edita, solo en las áreas asignadas
-- 'lector' : solo lectura, solo en las áreas asignadas
-- El rol global es el techo; el acceso real depende de permisos_area.

-- ---------- 2. PERFILES ----------
create table perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nombre         text        not null default '',
  cargo          text,
  rol            rol_global  not null default 'lector',
  activo         boolean     not null default true,
  ultimo_login   timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on column perfiles.activo is
  'Desactivar en lugar de borrar: preserva la trazabilidad histórica.';

create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'rol')::rol_global, 'lector')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ---------- 3. ÁREAS Y PERMISOS ----------
create table areas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  slug        text not null unique,
  descripcion text,
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table permisos_area (
  usuario_id   uuid         not null references perfiles (id) on delete cascade,
  area_id      uuid         not null references areas (id)    on delete cascade,
  nivel        nivel_acceso not null default 'lectura',
  otorgado_por uuid         references perfiles (id) on delete set null,
  otorgado_en  timestamptz  not null default now(),
  primary key (usuario_id, area_id)
);

create index idx_permisos_area_usuario on permisos_area (usuario_id);
create index idx_permisos_area_area    on permisos_area (area_id);

-- ---------- 4. FUNCIONES DE AUTORIZACIÓN ----------
-- SECURITY DEFINER para que las políticas consulten perfiles y
-- permisos_area sin recursión infinita de RLS.

create or replace function public.mi_rol()
returns rol_global language sql security definer stable set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo;
$$;

create or replace function public.soy_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(public.mi_rol() = 'admin', false);
$$;

create or replace function public.nivel_en_area(a uuid)
returns nivel_acceso language sql security definer stable set search_path = public as $$
  select case
    when a is null then null
    when not exists (select 1 from areas where id = a and activa) then null
    when public.soy_admin() then 'edicion'::nivel_acceso
    when public.mi_rol() is null then null
    else (
      select case
               when public.mi_rol() = 'lector' then 'lectura'::nivel_acceso
               else pa.nivel
             end
      from permisos_area pa
      where pa.usuario_id = auth.uid() and pa.area_id = a
    )
  end;
$$;

create or replace function public.uuid_seguro(t text)
returns uuid language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- ---------- 5. DOCUMENTOS ----------
create table documentos (
  id              uuid primary key default gen_random_uuid(),
  area_id         uuid not null references areas (id) on delete restrict,
  titulo          text not null,
  descripcion     text,
  etiquetas       text[] not null default '{}',

  -- CONVENCIÓN OBLIGATORIA: '<area_id>/<documento_id>/<archivo>'
  storage_path    text not null unique,
  nombre_archivo  text not null,
  mime            text,
  tamano_bytes    bigint check (tamano_bytes >= 0),
  version         integer not null default 1,

  vigente_desde   timestamptz not null default now(),
  vigente_hasta   timestamptz,          -- NULL = sin vencimiento

  subido_por      uuid references perfiles (id) on delete set null,
  actualizado_por uuid references perfiles (id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  purgado_en      timestamptz,

  constraint vigencia_coherente check (
    vigente_hasta is null or vigente_hasta > vigente_desde
  )
);

create index idx_documentos_area     on documentos (area_id, creado_en desc);
create index idx_documentos_vigencia on documentos (vigente_hasta)
  where vigente_hasta is not null and purgado_en is null;
create index idx_documentos_titulo   on documentos
  using gin (to_tsvector('spanish', titulo || ' ' || coalesce(descripcion, '')));

create or replace function public.estado_documento(d documentos)
returns text language sql stable as $$
  select case
    when d.purgado_en is not null                              then 'purgado'
    when d.vigente_desde > now()                               then 'programado'
    when d.vigente_hasta is not null and d.vigente_hasta <= now() then 'vencido'
    else 'vigente'
  end;
$$;

create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger trg_documentos_actualizado
  before update on documentos
  for each row execute function public.tocar_actualizado_en();

create trigger trg_perfiles_actualizado
  before update on perfiles
  for each row execute function public.tocar_actualizado_en();

-- ---------- 6. AUDITORÍA ----------
-- El email y el título se DUPLICAN a propósito: cuando el documento se
-- purgue o el usuario se elimine, el registro sigue siendo legible.
create table accesos (
  id             bigint generated always as identity primary key,
  usuario_id     uuid references perfiles (id) on delete set null,
  usuario_email  text not null,
  usuario_nombre text not null default '',
  documento_id   uuid references documentos (id) on delete set null,
  doc_titulo     text not null,
  area_nombre    text not null default '',
  accion         text not null check (accion in
                   ('listar','abrir','descargar','subir','editar','eliminar','login')),
  ip             inet,
  user_agent     text,
  ocurrio_en     timestamptz not null default now()
);

create index idx_accesos_documento on accesos (documento_id, ocurrio_en desc);
create index idx_accesos_usuario   on accesos (usuario_id, ocurrio_en desc);
create index idx_accesos_fecha     on accesos (ocurrio_en desc);

-- ---------- 7. RLS: PERFILES ----------
alter table perfiles enable row level security;

create policy perfiles_select on perfiles
  for select to authenticated using (true);

create policy perfiles_update_propio on perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and rol    = (select rol    from perfiles where id = auth.uid())
    and activo = (select activo from perfiles where id = auth.uid())
  );

create policy perfiles_admin_all on perfiles
  for all to authenticated
  using (public.soy_admin()) with check (public.soy_admin());

-- ---------- 8. RLS: ÁREAS Y PERMISOS ----------
alter table areas enable row level security;

create policy areas_select on areas
  for select to authenticated
  using (public.soy_admin() or public.nivel_en_area(id) is not null);

create policy areas_admin_all on areas
  for all to authenticated
  using (public.soy_admin()) with check (public.soy_admin());

alter table permisos_area enable row level security;

create policy permisos_select_propio on permisos_area
  for select to authenticated
  using (usuario_id = auth.uid() or public.soy_admin());

create policy permisos_admin_all on permisos_area
  for all to authenticated
  using (public.soy_admin()) with check (public.soy_admin());

-- ---------- 9. RLS: DOCUMENTOS ----------
alter table documentos enable row level security;

-- Un lector ve el documento solo dentro de su ventana de vigencia.
-- Quien tiene edición (y el admin) lo ve siempre, para programar y renovar.
create policy documentos_select on documentos
  for select to authenticated
  using (
    case public.nivel_en_area(area_id)
      when 'edicion' then true
      when 'lectura' then
        purgado_en is null
        and vigente_desde <= now()
        and (vigente_hasta is null or vigente_hasta > now())
      else false
    end
  );

create policy documentos_insert on documentos
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) = 'edicion'
    and subido_por = auth.uid()
    and storage_path like (area_id::text || '/%')
  );

create policy documentos_update on documentos
  for update to authenticated
  using (public.nivel_en_area(area_id) = 'edicion')
  with check (
    public.nivel_en_area(area_id) = 'edicion'
    and storage_path like (area_id::text || '/%')
  );

create policy documentos_delete on documentos
  for delete to authenticated using (public.soy_admin());

-- ---------- 10. RLS: ACCESOS ----------
alter table accesos enable row level security;

create policy accesos_insert_propio on accesos
  for insert to authenticated with check (usuario_id = auth.uid());

-- Solo el admin lee la auditoría. No existen políticas de update ni
-- delete a propósito: el registro es inmutable.
create policy accesos_select_admin on accesos
  for select to authenticated using (public.soy_admin());

-- ---------- 11. STORAGE ----------
create policy storage_select_documentos on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos'
    and public.nivel_en_area(public.uuid_seguro((storage.foldername(name))[1])) is not null
  );

create policy storage_insert_documentos on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and public.nivel_en_area(public.uuid_seguro((storage.foldername(name))[1])) = 'edicion'
  );

create policy storage_update_documentos on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documentos'
    and public.nivel_en_area(public.uuid_seguro((storage.foldername(name))[1])) = 'edicion'
  );

create policy storage_delete_documentos on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and public.soy_admin());

-- ---------- 12. PURGA ----------
-- Borrar la fila de storage.objects por SQL NO libera el binario. Hay que
-- llamar a la API de Storage. Flujo: cron -> Edge Function ->
-- storage.remove([...]) -> marcar_purgados().

create or replace function public.docs_por_purgar(dias_gracia integer default 7)
returns table (id uuid, storage_path text)
language sql security definer set search_path = public as $$
  select d.id, d.storage_path
  from documentos d
  where d.purgado_en is null
    and d.vigente_hasta is not null
    and d.vigente_hasta < now() - make_interval(days => dias_gracia)
  order by d.vigente_hasta
  limit 500;
$$;

revoke execute on function public.docs_por_purgar(integer) from public, anon, authenticated;

create or replace function public.marcar_purgados(ids uuid[])
returns integer language sql security definer set search_path = public as $$
  with actualizados as (
    update documentos
       set purgado_en   = now(),
           storage_path = 'purgado/' || id::text,
           tamano_bytes = 0
     where id = any(ids) and purgado_en is null
    returning 1
  )
  select count(*)::integer from actualizados;
$$;

revoke execute on function public.marcar_purgados(uuid[]) from public, anon, authenticated;

-- ---------- 13. VISTAS DE REPORTE ----------
create or replace view v_documentos_estado with (security_invoker = true) as
select d.*,
       public.estado_documento(d) as estado,
       a.nombre as area_nombre,
       p.nombre as subido_por_nombre,
       (select count(*) from accesos ac
         where ac.documento_id = d.id and ac.accion in ('abrir','descargar')) as veces_consultado,
       (select count(distinct ac.usuario_id) from accesos ac
         where ac.documento_id = d.id and ac.accion in ('abrir','descargar')) as usuarios_distintos
from documentos d
join areas a on a.id = d.area_id
left join perfiles p on p.id = d.subido_por;

create or replace view v_auditoria with (security_invoker = true) as
select ac.ocurrio_en, ac.usuario_nombre, ac.usuario_email, ac.accion,
       ac.doc_titulo, ac.area_nombre, ac.ip, ac.documento_id
from accesos ac
order by ac.ocurrio_en desc;

create or replace function public.pendientes_de_leer(doc uuid)
returns table (usuario_id uuid, nombre text, email text)
language sql security definer set search_path = public as $$
  select p.id, p.nombre, u.email
  from documentos d
  join permisos_area pa on pa.area_id = d.area_id
  join perfiles p       on p.id = pa.usuario_id and p.activo
  join auth.users u     on u.id = p.id
  where d.id = doc
    and public.soy_admin()
    and not exists (
      select 1 from accesos ac
       where ac.documento_id = d.id
         and ac.usuario_id = p.id
         and ac.accion in ('abrir','descargar')
    );
$$;
