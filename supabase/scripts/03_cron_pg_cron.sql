-- Paso manual 4 (opción A): programar la purga con pg_cron + pg_net,
-- guardando el secreto en Vault. Alternativa B: Vercel Cron (vercel.json
-- ya incluye el cron que llama a /api/cron/purgar). Elige UNA de las dos.
--
-- Requisitos previos:
--   1. Edge Function desplegada:  npx supabase functions deploy purgar
--   2. (Opcional) secreto propio:  npx supabase secrets set PURGA_SECRET=<valor>
--
-- Ejecutar en el SQL Editor. Reemplaza <PROJECT_REF> y el secreto.

create extension if not exists pg_cron  with schema pg_catalog;
create extension if not exists pg_net   with schema extensions;

-- Guardamos la URL de la función y el secreto en Vault (no en texto plano).
select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/purgar', 'purgar_url');
select vault.create_secret('<TU_PURGA_SECRET_O_SERVICE_ROLE_KEY>',                 'purgar_secreto');

-- Todos los días a las 03:00 hora de Bogotá (08:00 UTC).
select cron.schedule(
  'purgar-documentos-vencidos',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'purgar_url'),
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 -- Si guardaste la service_role key, usa Authorization; si
                 -- guardaste PURGA_SECRET, usa el header x-purga-secret.
                 'x-purga-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purgar_secreto')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Ver el cron y sus últimas ejecuciones:
select jobid, jobname, schedule, active from cron.job;
select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;

-- Para eliminarlo:
-- select cron.unschedule('purgar-documentos-vencidos');
