-- Paso manual 1: crear el bucket PRIVADO `documentos`.
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- Límite 50 MB y lista blanca de tipos: debe coincidir con lib/validaciones.ts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 52428800,
        array['application/pdf','image/png','image/jpeg',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Comprobación:
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'documentos';
