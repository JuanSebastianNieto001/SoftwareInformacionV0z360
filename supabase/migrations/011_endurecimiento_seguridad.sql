-- =====================================================================
-- ENDURECIMIENTO DE SEGURIDAD
-- =====================================================================
-- Cierra tres vías de escalada de privilegios comprobadas contra la base
-- en producción, y añade freno a la fuerza bruta en el inicio de sesión.
-- =====================================================================

-- ---------- 1. EL ROL YA NO VIENE DEL CLIENTE ----------
-- El trigger leía el rol de raw_user_meta_data, que es el campo `data` del
-- registro y lo escribe quien llama. Con el registro público abierto,
-- cualquiera en internet podía pedir:
--
--     POST /auth/v1/signup  { email, password, data: { rol: "admin" } }
--
-- y quedaba como administrador del sistema: todos los documentos, todas
-- las PQR, la auditoría y la gestión de usuarios. Comprobado y reproducido.
--
-- A partir de aquí el perfil nace siempre como lector y DESACTIVADO. Quien
-- lo eleve tiene que ser un administrador ya autenticado, pasando por la
-- política perfiles_admin_all. El alta desde el panel lo hace en el paso
-- siguiente de la misma petición.
--
-- El nombre sí se sigue leyendo del metadata: es texto para mostrar y no
-- concede nada.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol, activo)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      split_part(new.email, '@', 1)
    ),
    'lector',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.crear_perfil_nuevo_usuario() is
  'Crea el perfil al registrarse. Rol y estado NO se leen del metadata del cliente: nace lector e inactivo.';

-- ---------- 2. NADIE SE CONCEDE EL BUZÓN A SÍ MISMO ----------
-- perfiles_update_propio fijaba `rol` y `activo`, pero `gestiona_buzon` se
-- añadió después (migración 003) y quedó fuera. Cualquiera con sesión podía
-- hacerse gestor del buzón con un PATCH y leer todas las quejas y no
-- conformidades. Reproducido con una cuenta de asesor real.
--
-- `cargo` entra también en la lista: decide el segmento al que pertenece la
-- persona, así que es dato administrativo, no del interesado.
drop policy if exists perfiles_update_propio on perfiles;
create policy perfiles_update_propio on perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and rol            = (select rol            from perfiles where id = auth.uid())
    and activo         = (select activo         from perfiles where id = auth.uid())
    and gestiona_buzon = (select gestiona_buzon from perfiles where id = auth.uid())
    and cargo is not distinct from (select cargo from perfiles where id = auth.uid())
  );

-- ---------- 3. UNA CUENTA INERTE NO ESCRIBE EN EL BUZÓN ----------
-- Aunque el registro siga abierto, quien se dé de alta por su cuenta queda
-- inactivo. Sin esto podría seguir metiendo PQR por la API: registros que
-- el 7.5 obliga a conservar y que nadie puede borrar después.
drop policy if exists sugerencias_insert_propia on sugerencias;
create policy sugerencias_insert_propia on sugerencias
  for insert to authenticated
  with check (emisor_id = auth.uid() and public.mi_rol() is not null);

-- ---------- 4. FRENO A LA FUERZA BRUTA ----------
-- Doce intentos fallidos seguidos contra la misma cuenta no encontraban
-- ningún freno. Con contraseñas temporales repetidas y usuarios de Poliedro
-- correlativos, adivinar una cuenta era cuestión de segundos.
create table intentos_login (
  id         bigint generated always as identity primary key,
  correo     text not null,
  ip         text,
  ocurrio_en timestamptz not null default now()
);

create index idx_intentos_correo on intentos_login (correo, ocurrio_en desc);
create index idx_intentos_ip     on intentos_login (ip, ocurrio_en desc);

-- Sin una sola política: nadie llega a esta tabla por la API. Solo entran
-- las funciones de abajo, que son SECURITY DEFINER.
alter table intentos_login enable row level security;

comment on table intentos_login is
  'Intentos de inicio de sesión fallidos, para frenar la fuerza bruta. Se limpian solos al entrar bien.';

/**
 * ¿Está frenado este intento?
 *
 * El freno por cuenta se cuenta junto con la IP a propósito. Bloquear una
 * cuenta por su correo y nada más deja servido un ataque de denegación:
 * basta con fallar ocho veces contra el correo del jefe para dejarlo fuera.
 * Atado a la IP, el atacante solo se bloquea a sí mismo, y el contador por
 * IP a secas corta el barrido de muchas cuentas desde el mismo sitio.
 */
create or replace function public.login_frenado(p_correo text, p_ip text)
returns boolean language sql security definer stable set search_path = public as $$
  select
    (
      select count(*) >= 8
        from intentos_login
       where correo = lower(trim(p_correo))
         and ip is not distinct from p_ip
         and ocurrio_en > now() - interval '15 minutes'
    )
    or (
      p_ip is not null and (
        select count(*) >= 40
          from intentos_login
         where ip = p_ip
           and ocurrio_en > now() - interval '15 minutes'
      )
    );
$$;

create or replace function public.anotar_intento_login(p_correo text, p_ip text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into intentos_login (correo, ip) values (lower(trim(p_correo)), p_ip);
  -- Poda oportunista: la tabla no debe crecer sin fin y nadie va a mirar
  -- un intento de hace una hora.
  delete from intentos_login where ocurrio_en < now() - interval '1 day';
end;
$$;

create or replace function public.olvidar_intentos_login(p_correo text, p_ip text)
returns void language sql security definer set search_path = public as $$
  delete from intentos_login
   where correo = lower(trim(p_correo)) and ip is not distinct from p_ip;
$$;

-- Las llama el servidor de la aplicación con la clave pública, porque en
-- ese momento todavía no hay sesión.
grant execute on function public.login_frenado(text, text)        to anon, authenticated;
grant execute on function public.anotar_intento_login(text, text) to anon, authenticated;
grant execute on function public.olvidar_intentos_login(text, text) to anon, authenticated;
