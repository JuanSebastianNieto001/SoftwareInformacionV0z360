-- =====================================================================
-- GESTIÓN DEL BUZÓN: permiso propio y evidencia obligatoria
-- =====================================================================
-- Quien responde las PQR no tiene por qué administrar usuarios, áreas ni
-- auditoría. Meterla en el rol `admin` para que pueda contestar le daría
-- de paso la gestión de usuarios: el permiso se separa en su propia
-- bandera en lugar de estirar un rol que significa otra cosa.
--
-- Y la respuesta no se da por hecha: se cierra un caso solo con la prueba
-- de que se contestó al emisor por correo. Esa prueba es un archivo, así
-- que vive en Storage y la base exige su presencia para permitir el
-- cierre. Un requisito que solo viviera en el formulario se saltaría con
-- una petición manipulada o con el próximo rediseño de la pantalla.
-- =====================================================================

-- ---------- 1. PERMISO DE GESTIÓN ----------

alter table perfiles
  add column gestiona_buzon boolean not null default false;

comment on column perfiles.gestiona_buzon is
  'Puede leer y responder todas las PQR sin ser administrador.';

-- Nombre en primera persona como mi_rol() y soy_admin(), y distinto de la
-- columna para que nunca se confundan en una política.
create or replace function public.gestiono_buzon()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(
    public.soy_admin()
    or exists (
      select 1 from perfiles
      where id = auth.uid() and activo and gestiona_buzon
    ),
    false
  );
$$;

-- ---------- 2. EVIDENCIA DE LA RESPUESTA ----------

alter table sugerencias
  add column evidencia_path       text,
  add column evidencia_nombre     text,
  add column evidencia_subida_en  timestamptz;

comment on column sugerencias.evidencia_path is
  'Ruta en el bucket privado `evidencias`: <sugerencia_id>/<archivo>.';

-- El cierre exige decir qué se hizo y probar que se comunicó.
alter table sugerencias drop constraint cierre_documentado;

alter table sugerencias add constraint cierre_documentado check (
  estado <> 'cerrada'
  or (accion_tomada is not null and evidencia_path is not null)
);

-- El análisis de causa solo se exige donde el 10.2 lo pide: cuando hubo un
-- incumplimiento. Obligarlo ante una felicitación empujaría a rellenar el
-- campo con cualquier cosa, y un campo así no sirve de evidencia.
alter table sugerencias add constraint causa_en_incumplimientos check (
  estado <> 'cerrada'
  or tipo not in ('queja', 'no_conformidad')
  or analisis_causa is not null
);

-- ---------- 3. RLS: DE soy_admin() A gestiono_buzon() ----------

drop policy sugerencias_select_propia_o_admin on sugerencias;
drop policy sugerencias_update_admin          on sugerencias;

create policy sugerencias_select_propia_o_gestor on sugerencias
  for select to authenticated
  using (emisor_id = auth.uid() or public.gestiono_buzon());

create policy sugerencias_update_gestor on sugerencias
  for update to authenticated
  using (public.gestiono_buzon())
  with check (public.gestiono_buzon());

-- ---------- 4. BUCKET PRIVADO DE EVIDENCIAS ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Un pantallazo puede contener datos de un tercero, así que no lo ve ni
-- quien envió la PQR: solo quien gestiona el buzón.
create policy storage_select_evidencias on storage.objects
  for select to authenticated
  using (bucket_id = 'evidencias' and public.gestiono_buzon());

create policy storage_insert_evidencias on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidencias' and public.gestiono_buzon());

-- Sin update: una evidencia se reemplaza borrando y subiendo de nuevo, lo
-- que deja rastro en la propia fila (evidencia_subida_en).
create policy storage_delete_evidencias on storage.objects
  for delete to authenticated
  using (bucket_id = 'evidencias' and public.gestiono_buzon());
