-- Verificación de RLS contra la base REAL, desde el SQL Editor de Supabase.
-- El editor ejecuta como `postgres` (salta RLS); dentro de una transacción
-- podemos "ponernos" el rol authenticated y el claim sub de un usuario, que
-- es exactamente lo que hace PostgREST con el JWT.
--
-- Reemplaza los UUID por usuarios/documentos reales y ejecuta bloque a bloque.
-- Cada bloque termina en ROLLBACK: no cambia nada.

-- [1] Un lector no puede insertar en documentos (debe fallar con "row-level security")
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '<UUID_LECTOR>', true);
  insert into documentos (area_id, titulo, storage_path, nombre_archivo, subido_por)
  values ('<UUID_AREA>', 'prueba', '<UUID_AREA>/x/prueba.pdf', 'prueba.pdf', '<UUID_LECTOR>');
rollback;

-- [2] Sin permiso sobre el área no ve el documento ni con el id exacto (0 filas)
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '<UUID_USUARIO_SIN_PERMISO>', true);
  select id, titulo from documentos where id = '<UUID_DOCUMENTO>';
rollback;

-- [3] Vencido: 0 filas para el lector, 1 para el editor del área
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '<UUID_LECTOR>', true);
  select id, titulo, vigente_hasta from documentos where id = '<UUID_DOCUMENTO_VENCIDO>';
rollback;
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '<UUID_EDITOR>', true);
  select id, titulo, vigente_hasta from documentos where id = '<UUID_DOCUMENTO_VENCIDO>';
rollback;

-- [4] Usuario con activo = false: nada visible (0 áreas, 0 documentos)
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '<UUID_USUARIO_INACTIVO>', true);
  select count(*) as areas from areas;
  select count(*) as documentos from documentos;
  select public.mi_rol(), public.nivel_en_area('<UUID_AREA>');
rollback;

-- [5] Solo el admin lee accesos (no-admin: 0 filas)
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '<UUID_EDITOR>', true);
  select count(*) from accesos;
rollback;

-- [6] Nadie modifica ni borra accesos, incluido el admin (0 filas afectadas)
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '<UUID_ADMIN>', true);
  update accesos set accion = 'abrir' where accion = 'descargar';   -- UPDATE 0
  delete from accesos;                                              -- DELETE 0
rollback;

-- [8] URL firmada expirada: genera una con 1 segundo desde la app o con
--     el SDK, espera y abre: Storage responde 400 "InvalidJWT"/"expired".
