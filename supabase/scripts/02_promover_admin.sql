-- Paso manual 3: promover el primer usuario a administrador.
--
-- Antes: crea el usuario en Authentication > Users > Add user (con
-- "Auto Confirm User" activado). El disparador crea su perfil como
-- 'lector' y DESACTIVADO, así que hay que activarlo aquí además de
-- darle el rol; sin `activo = true` no podría entrar.
--
-- Que nazca inerte es deliberado, no un descuido: desde la migración 011
-- el rol no se lee de los metadatos del registro, porque ese campo lo
-- escribe quien llama y era la vía para que cualquiera se hiciera
-- administrador desde internet. Ver docs/seguridad.md.
--
-- Este script es solo para el PRIMER administrador, cuando todavía no hay
-- ninguno que pueda usar el panel. A partir de ahí, las altas se hacen
-- desde Administración → Usuarios.

update public.perfiles
   set rol    = 'admin',
       activo = true,
       nombre = 'Nombre Apellido'          -- ← cámbialo
 where id = '00000000-0000-0000-0000-000000000000';  -- ← UUID del usuario

-- Comprobación:
select p.id, u.email, p.nombre, p.rol, p.activo
  from public.perfiles p
  join auth.users u on u.id = p.id
 order by p.creado_en;
