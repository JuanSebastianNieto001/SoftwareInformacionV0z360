-- Paso manual 3: promover el primer usuario a administrador.
-- Antes: crea el usuario en Authentication > Users > Add user (con
-- "Auto Confirm User" activado). El trigger ya habrá creado su perfil
-- como 'lector'. Copia su UUID y reemplázalo abajo.

update public.perfiles
   set rol    = 'admin',
       nombre = 'Nombre Apellido'          -- ← cámbialo
 where id = '00000000-0000-0000-0000-000000000000';  -- ← UUID del usuario

-- Comprobación:
select p.id, u.email, p.nombre, p.rol, p.activo
  from public.perfiles p
  join auth.users u on u.id = p.id
 order by p.creado_en;
