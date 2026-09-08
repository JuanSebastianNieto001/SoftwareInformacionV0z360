# Gestor Documental Interno

Aplicación web interna que reemplaza Google Drive y las carpetas compartidas: los asesores
inician sesión, ven solo los documentos de las áreas que tienen asignadas, cada documento
tiene una ventana de vigencia, al vencer desaparece de la vista (y a los 7 días se borra del
almacenamiento) y el administrador ve quién consultó cada documento.

**Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Auth, Postgres con RLS, Storage,
Edge Functions) · Tailwind CSS 4 + shadcn/ui · Zod · desplegable en Vercel.

> Nota sobre Next.js 16: el archivo `middleware.ts` pasó a llamarse `proxy.ts` (misma función,
> exportada como `proxy`). Todo lo demás de la estructura pedida se conserva.

---

## Índice

1. [Cómo funciona la seguridad](#1-cómo-funciona-la-seguridad)
2. [Puesta en marcha paso a paso](#2-puesta-en-marcha-paso-a-paso)
3. [Despliegue en Vercel](#3-despliegue-en-vercel)
4. [Purga automática (Edge Function + cron)](#4-purga-automática-edge-function--cron)
5. [Verificación de seguridad](#5-verificación-de-seguridad)
6. [Estructura del proyecto](#6-estructura-del-proyecto)
7. [Operación diaria](#7-operación-diaria)
8. [Solución de problemas](#8-solución-de-problemas)

---

## 1. Cómo funciona la seguridad

Cinco reglas sostienen el sistema (no las cambies sin revisar todo lo demás):

1. **La autorización vive en RLS, no en el código.** La app consulta con la sesión del
   usuario y Postgres devuelve solo lo permitido. Los helpers de `lib/permisos.ts` deciden qué
   botones pintar, nunca qué datos entregar.
2. **La ruta de Storage es un contrato:** `<area_id>/<documento_id>/<archivo>`. Las políticas
   del bucket leen el primer segmento para saber el área; la tabla `documentos` exige el prefijo.
3. **El bucket `documentos` es privado.** Ningún archivo se abre con una URL de Storage
   directa: todo pasa por `GET /api/documentos/[id]/abrir`, que registra el acceso y redirige a
   una URL firmada de 60 segundos.
4. **La `service_role` key nunca sale del servidor.** Solo se usa en `app/api/admin/usuarios`
   (crear usuarios y restablecer claves), en la limpieza de archivos huérfanos, en
   `app/api/cron/purgar` y en la Edge Function. `lib/supabase/admin.ts` importa `server-only`:
   el build falla si alguien lo importa desde un componente cliente.
5. **La auditoría se escribe explícitamente** en cada endpoint (abrir, descargar, subir,
   editar, eliminar, login). La tabla `accesos` no tiene políticas de update ni delete: es
   inmutable incluso para el administrador.

Roles: `admin` (todo + auditoría), `editor` (sube/edita en las áreas con nivel *edición*),
`lector` (solo lectura en sus áreas). El rol es el techo: a un lector nunca se le aplica
edición aunque se le marque.

---

## 2. Puesta en marcha paso a paso

### 2.1 Requisitos

- Node.js 20.9 o superior (probado con Node 24).
- Una cuenta en [Supabase](https://supabase.com) y otra en [Vercel](https://vercel.com).
- Opcional: la CLI de Supabase se usa vía `npx supabase …` (no hace falta instalarla global).

### 2.2 Crear el proyecto en Supabase

1. Crea un proyecto nuevo (región cercana, p. ej. `us-east-1`). Guarda la contraseña de la
   base de datos.
2. En **Project Settings → API** copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (solo servidor)

   Si tu proyecto muestra las claves nuevas (`sb_publishable_…` / `sb_secret_…`), úsalas en
   las mismas variables: el código acepta ambos formatos.

### 2.3 Aplicar la migración

Opción A — SQL Editor (más simple): abre **SQL Editor → New query**, pega el contenido
completo de `supabase/migrations/001_esquema_inicial.sql` y ejecútalo. Debe terminar sin
errores (crea tipos, tablas, funciones, políticas RLS y vistas).

Opción B — CLI:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

### 2.4 Crear el bucket privado

En el SQL Editor ejecuta `supabase/scripts/01_crear_bucket.sql`, que hace:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 52428800,
        array['application/pdf','image/png','image/jpeg',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation']);
```

Verifica en **Storage** que el bucket `documentos` aparece como *Private*.

### 2.5 Desactivar el registro público

**Authentication → Sign In / Providers → Email**: deja activo *Enable Email provider* y
**desactiva** *Allow new users to sign up*. Desactiva también *Confirm email* si quieres que
los usuarios creados por el admin entren de inmediato (la app ya los crea confirmados).

Recomendado además, en **Authentication → Attack protection**: activa la comprobación de
contraseñas filtradas (HaveIBeenPwned) y una longitud mínima de 8.

### 2.6 Crear el primer administrador

1. **Authentication → Users → Add user → Create new user**: correo, contraseña y marca
   *Auto Confirm User*. El trigger crea automáticamente su fila en `perfiles` como `lector`.
2. Copia el UUID del usuario y ejecuta (o usa `supabase/scripts/02_promover_admin.sql`):

   ```sql
   update perfiles set rol = 'admin', nombre = 'Nombre Apellido' where id = '<UUID>';
   ```

A partir de aquí todos los demás usuarios se crean desde la app (**Administración → Usuarios**),
con contraseña temporal que deben cambiar al primer ingreso.

### 2.7 Ejecutar en local

```bash
cp .env.example .env.local     # y completa las tres variables de Supabase
npm install
npm run dev                    # http://localhost:3000
```

Inicia sesión con el administrador, crea un área en **Administración → Áreas**, sube un
documento y ábrelo. En **Administración → Auditoría** debe aparecer el registro.

---

## 3. Despliegue en Vercel

1. Sube el repositorio a GitHub/GitLab/Bitbucket.
2. En Vercel: **Add New → Project → Import**. Framework: Next.js (se detecta solo).
3. **Environment Variables** (Production y Preview):

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key (**sin** `NEXT_PUBLIC_`) |
   | `CRON_SECRET` | cadena aleatoria larga (`openssl rand -hex 32`) — solo si usas Vercel Cron |
   | `NEXT_PUBLIC_APP_URL` | `https://tu-dominio.vercel.app` |

4. **Deploy**. Vercel ejecuta `next build` (incluye la comprobación de tipos).
5. En Supabase, **Authentication → URL Configuration**: pon la URL de Vercel en *Site URL* y
   añádela a *Redirect URLs*.
6. Abre la URL en el celular y usa "Añadir a pantalla de inicio": la app es una PWA
   (manifiesto, íconos y service worker mínimo que solo muestra una página de "sin conexión").

Los redeploys automáticos ocurren con cada push a la rama principal.

---

## 4. Purga automática (Edge Function + cron)

La Edge Function `supabase/functions/purgar/index.ts` llama a `docs_por_purgar(7)`, borra los
archivos con `storage.remove()`, comprueba en `storage.objects` cuáles dejaron de existir y
solo esos los pasa por `marcar_purgados()`. Es idempotente: ejecutarla dos veces el mismo día
devuelve ceros la segunda vez. Los 7 días de gracia cubren el "se venció ayer y lo necesito".

### 4.1 Desplegar la función

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase functions deploy purgar
# opcional: secreto propio para invocarla sin exponer la service_role key
npx supabase secrets set PURGA_SECRET=$(openssl rand -hex 32)
```

`supabase/config.toml` fija `verify_jwt = false` para esa función: la propia función exige
`Authorization: Bearer <service_role_key>` **o** el header `x-purga-secret`.

Prueba manual:

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/purgar \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
# → {"candidatos":0,"borrados":0,"marcados":0,"pendientes":0,"ms":…}
```

### 4.2 Programarla (elige una opción)

**Opción A — pg_cron + pg_net con el secreto en Vault** (todo dentro de Supabase): ejecuta
`supabase/scripts/03_cron_pg_cron.sql` en el SQL Editor tras reemplazar `<PROJECT_REF>` y el
secreto. Corre a diario a las 03:00 de Bogotá.

**Opción B — Vercel Cron**: `vercel.json` ya declara el cron `0 8 * * *` hacia
`/api/cron/purgar`. Esa ruta valida `Authorization: Bearer <CRON_SECRET>` (Vercel lo envía
automáticamente si la variable existe) y reenvía la orden a la Edge Function. Solo necesitas
definir `CRON_SECRET` en Vercel. En el plan Hobby los crons se ejecutan una vez al día, que
es justo lo que se necesita.

---

## 5. Verificación de seguridad

### 5.1 Pruebas automáticas de RLS (sin Docker)

```bash
npm run prueba:rls
```

Levanta un Postgres embebido (PGlite), recrea los stubs de Supabase (`auth.uid()`,
`storage.foldername()`, roles), aplica **la migración tal cual** y ejecuta 39 comprobaciones
que cubren los puntos 1 a 6 de la lista de verificación y las políticas restantes (Storage,
perfiles, permisos, purga). Cada comprobación corre como `set local role authenticated` con
el claim `sub` del usuario simulado: lo mismo que hace PostgREST.

### 5.2 La service_role key no está en el cliente

```bash
npm run build
npm run prueba:bundle
```

Recorre `.next/static` buscando el valor de la clave (si hay `.env.local`), JWT con
`role=service_role`, claves `sb_secret_` y referencias al nombre de la variable.

### 5.3 Contra la base real

`supabase/scripts/04_verificar_rls_en_produccion.sql` contiene los mismos seis bloques para
ejecutar en el SQL Editor con UUID reales (cada bloque termina en `rollback`).

### 5.4 URL firmada expirada (punto 8)

Requiere Storage real: abre un documento, copia la URL a la que redirige
`/api/documentos/[id]/abrir`, espera más de 60 segundos y vuelve a abrirla. Supabase responde
`400 {"error":"InvalidJWT"...}` / *expired*. La app nunca muestra esa URL; solo el 302.

---

## 6. Estructura del proyecto

```
app/
  (auth)/login/                       login (Server Action + formulario)
  (auth)/cambiar-contrasena/          cambio de clave (obligatorio en el primer ingreso)
  (app)/layout.tsx                    exige sesión + perfil activo + clave cambiada
  (app)/page.tsx                      áreas del usuario + "vencen en 7 días" (editores)
  (app)/areas/[slug]/page.tsx         documentos del área, búsqueda y filtro por estado
  (app)/documentos/[id]/page.tsx      detalle, abrir/descargar, consultas y pendientes (admin)
  (app)/documentos/[id]/editar/       metadatos, vigencia y reemplazo de archivo (versión+1)
  (app)/subir/page.tsx                subida con ventana de vigencia y atajos
  (admin)/layout.tsx                  guardia de UI para admin
  (admin)/admin/{usuarios,areas,permisos,auditoria,documentos}/
  api/documentos/[id]/abrir/route.ts  ← pieza crítica: RLS + auditoría + URL firmada 60 s
  api/documentos/subir/route.ts       valida, verifica el objeto en Storage, inserta, audita
  api/documentos/[id]/route.ts        PATCH metadatos · DELETE (admin)
  api/documentos/[id]/reemplazar/     nueva versión del archivo
  api/admin/usuarios/route.ts         service_role, solo servidor (GET/POST/PATCH)
  api/admin/auditoria/csv/route.ts    exportación CSV
  api/cron/purgar/route.ts            disparador para Vercel Cron
  api/auth/salir/route.ts             cierre de sesión forzado (perfil desactivado)
  manifest.ts · offline/page.tsx      PWA
lib/
  supabase/{server,client,admin,proxy,env,tipos}.ts
  auditoria.ts                        registrarAcceso()
  permisos.ts                         helpers de UI (no de seguridad)
  validaciones.ts                     esquemas Zod y constantes (MIME, 50 MB)
  archivos.ts · formato.ts · subida-cliente.ts · limpieza-storage.ts · sesion.ts
components/                           shell, listas, formularios, admin/, ui/ (shadcn)
supabase/
  migrations/001_esquema_inicial.sql  esquema completo (tal cual el prompt)
  functions/purgar/index.ts           Edge Function (Deno)
  scripts/*.sql                       bucket, promover admin, pg_cron, verificación
proxy.ts                              refresco de sesión y redirección a /login
pruebas/                              rls.test.mjs · bundle-sin-secretos.mjs
vercel.json                           cron diario
```

---

## 7. Operación diaria

- **Crear usuarios:** Administración → Usuarios → Nuevo usuario. Se muestra una contraseña
  temporal una sola vez; la persona debe cambiarla al entrar.
- **Dar acceso:** Administración → Permisos → elige la persona → marca Lectura/Edición por
  área. Un `lector` siempre queda en lectura; un `admin` no necesita asignaciones.
- **Desactivar a alguien:** Usuarios → Desactivar. Bloquea el login, cierra sus sesiones y
  RLS deja de devolverle datos. No se borra: la auditoría conserva su historial.
- **Renovar un documento vencido:** el editor entra al documento → Editar → cambia la
  vigencia. Mientras no pasen 7 días desde el vencimiento el archivo sigue existiendo.
- **Reemplazar un archivo:** Editar → Reemplazar archivo. La versión sube en 1 y el binario
  anterior se elimina.
- **Auditoría:** filtra por persona, acción, documento y fechas; exporta CSV (separador `;`,
  compatible con Excel en español). En el detalle de cada documento el admin ve quién lo abrió
  y quién, teniendo permiso, aún no lo ha consultado.

---

## 8. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Al subir: "No tienes permiso de edición en esta área" | El usuario es `lector` o su permiso es *lectura* | Administración → Permisos |
| Al subir: "El bucket 'documentos' no existe" | Falta el paso 2.4 | Ejecuta `01_crear_bucket.sql` |
| Al subir: "Tipo de archivo no permitido por el almacenamiento" | MIME fuera de la lista del bucket | Revisa `allowed_mime_types` y `lib/validaciones.ts` (deben coincidir) |
| Un usuario nuevo entra y ve "No tienes áreas asignadas" | Sin permisos | Asígnale áreas |
| Todo el mundo ve listas vacías | Migración no aplicada o RLS sin políticas | Revisa que la migración terminó sin errores |
| `/api/cron/purgar` responde 401 | `CRON_SECRET` no coincide | Define la variable en Vercel y redepliega |
| La Edge Function responde 401 | Falta `Authorization: Bearer <service_role>` o `x-purga-secret` | Revisa la cabecera del cron |
| Aparecen archivos sin documento en Storage | Falló un insert y la limpieza no alcanzó a correr | Compara `storage.objects.name` con `documentos.storage_path` y borra los sobrantes |

Comandos útiles:

```bash
npm run dev          # desarrollo
npm run typecheck    # tipos de rutas + TypeScript
npm run build        # build de producción (igual que Vercel)
npm run prueba:rls   # pruebas de RLS en Postgres embebido
npm run prueba:bundle# confirma que la clave secreta no está en el cliente
```
