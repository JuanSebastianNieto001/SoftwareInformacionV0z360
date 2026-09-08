/**
 * Pruebas de las políticas RLS de supabase/migrations/001_esquema_inicial.sql
 * contra un Postgres embebido (PGlite), sin necesidad de Docker ni de un
 * proyecto de Supabase.
 *
 * Se recrean los "stubs" mínimos que Supabase aporta (esquemas auth y
 * storage, auth.uid(), storage.foldername(), roles anon/authenticated) y
 * luego se aplica la migración TAL CUAL. Cada comprobación se ejecuta en
 * una transacción con `set local role authenticated` y el claim `sub` del
 * usuario simulado, que es exactamente lo que hace PostgREST.
 *
 *   npm run prueba:rls
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const rutaMigracion = join(raiz, "supabase", "migrations", "001_esquema_inicial.sql");

const db = await PGlite.create();

// ---------------------------------------------------------------------------
// Utilidades de prueba
// ---------------------------------------------------------------------------
const resultados = [];
let actualGrupo = "";

function grupo(nombre) {
  actualGrupo = nombre;
}

async function prueba(nombre, fn) {
  try {
    await fn();
    resultados.push({ grupo: actualGrupo, nombre, ok: true });
    console.log(`  ✔ ${nombre}`);
  } catch (e) {
    resultados.push({ grupo: actualGrupo, nombre, ok: false, error: e.message });
    console.log(`  ✘ ${nombre}\n      → ${e.message.split("\n")[0]}`);
  }
}

function igual(real, esperado, msg) {
  if (real !== esperado) throw new Error(`${msg ?? "valor inesperado"}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(real)}`);
}

/** Ejecuta fn como el usuario `uid` (rol authenticated) dentro de una transacción. */
async function como(uid, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated;`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await tx.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);
    return fn(tx);
  });
}

/** Como `como`, pero se espera que falle con un error que cumpla el patrón. */
async function comoDebeFallar(uid, fn, patron = /row-level security|permission denied|violates/i) {
  let error = null;
  try {
    await como(uid, fn);
  } catch (e) {
    error = e;
  }
  if (!error) throw new Error("la operación debía ser rechazada y fue aceptada");
  if (!patron.test(error.message)) throw new Error(`falló por otro motivo: ${error.message}`);
}

async function filas(tx, sql, params = []) {
  const r = await tx.query(sql, params);
  return r.rows;
}

// ---------------------------------------------------------------------------
// 1. Stubs de la plataforma Supabase
// ---------------------------------------------------------------------------
console.log("\nPreparando Postgres embebido con stubs de Supabase…");
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create schema storage;

  create table auth.users (
    id uuid primary key,
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$;

  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text,
    owner uuid,
    metadata jsonb,
    created_at timestamptz not null default now()
  );
  alter table storage.objects enable row level security;

  create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end
  $$;

  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on all tables in schema storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);

// ---------------------------------------------------------------------------
// 2. Migración real
// ---------------------------------------------------------------------------
let sqlMigracion = readFileSync(rutaMigracion, "utf8");
const avisos = [];
try {
  await db.exec(sqlMigracion);
} catch (e) {
  // PGlite no trae pgcrypto (gen_random_uuid es nativo desde PG13) y puede
  // no traer el diccionario 'spanish'. Ninguna de las dos cosas afecta a RLS.
  if (/pgcrypto/i.test(e.message)) {
    sqlMigracion = sqlMigracion.replace(/create extension if not exists pgcrypto;/i, "-- (pgcrypto omitido en PGlite)");
    avisos.push("pgcrypto omitido (gen_random_uuid es nativo en PG13+)");
  }
  if (/text search configuration "spanish"/i.test(e.message)) {
    sqlMigracion = sqlMigracion.replace(/to_tsvector\('spanish'/g, "to_tsvector('simple'");
    avisos.push("índice GIN con configuración 'simple' en lugar de 'spanish'");
  }
  if (avisos.length === 0) throw e;
  // Reiniciamos la base para aplicar la migración corregida desde cero.
  await db.exec(`drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    drop policy if exists storage_select_documentos on storage.objects;
    drop policy if exists storage_insert_documentos on storage.objects;
    drop policy if exists storage_update_documentos on storage.objects;
    drop policy if exists storage_delete_documentos on storage.objects;`);
  try {
    await db.exec(sqlMigracion);
  } catch (e2) {
    if (/text search configuration "spanish"/i.test(e2.message) && !/simple/.test(sqlMigracion)) {
      sqlMigracion = sqlMigracion.replace(/to_tsvector\('spanish'/g, "to_tsvector('simple'");
      avisos.push("índice GIN con configuración 'simple' en lugar de 'spanish'");
      await db.exec(`drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;
        alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
        alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
        drop policy if exists storage_select_documentos on storage.objects;
        drop policy if exists storage_insert_documentos on storage.objects;
        drop policy if exists storage_update_documentos on storage.objects;
        drop policy if exists storage_delete_documentos on storage.objects;`);
      await db.exec(sqlMigracion);
    } else {
      throw e2;
    }
  }
}
console.log("Migración aplicada." + (avisos.length ? ` Ajustes solo para PGlite: ${avisos.join("; ")}.` : ""));

// ---------------------------------------------------------------------------
// 3. Datos de prueba (como superusuario: salta RLS, igual que service_role)
// ---------------------------------------------------------------------------
const U = {
  admin: "00000000-0000-4000-8000-000000000001",
  editor: "00000000-0000-4000-8000-000000000002",
  lector: "00000000-0000-4000-8000-000000000003",
  inactivo: "00000000-0000-4000-8000-000000000004",
  sinPermiso: "00000000-0000-4000-8000-000000000005",
  editorLector: "00000000-0000-4000-8000-000000000006", // rol editor, pero solo lectura en X
};
const AREA = { x: "10000000-0000-4000-8000-000000000001", y: "10000000-0000-4000-8000-000000000002", inactiva: "10000000-0000-4000-8000-000000000003" };
const DOC = {
  vigente: "20000000-0000-4000-8000-000000000001",
  vencidoAyer: "20000000-0000-4000-8000-000000000002",
  programado: "20000000-0000-4000-8000-000000000003",
  purgado: "20000000-0000-4000-8000-000000000004",
  enY: "20000000-0000-4000-8000-000000000005",
  vencidoHace10: "20000000-0000-4000-8000-000000000006",
  sinVencimiento: "20000000-0000-4000-8000-000000000007",
  enAreaInactiva: "20000000-0000-4000-8000-000000000008",
};

await db.exec(`
  insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false);

  insert into auth.users (id, email, raw_user_meta_data) values
    ('${U.admin}',        'admin@empresa.com',   '{"nombre":"Ana Admin","rol":"admin"}'),
    ('${U.editor}',       'editor@empresa.com',  '{"nombre":"Eva Editora","rol":"editor"}'),
    ('${U.lector}',       'lector@empresa.com',  '{"nombre":"Luis Lector"}'),
    ('${U.inactivo}',     'inactivo@empresa.com','{"nombre":"Iván Inactivo"}'),
    ('${U.sinPermiso}',   'nadie@empresa.com',   '{"nombre":"Nora Nadie","rol":"editor"}'),
    ('${U.editorLector}', 'mixto@empresa.com',   '{"nombre":"Mario Mixto","rol":"editor"}');

  update perfiles set activo = false where id = '${U.inactivo}';

  insert into areas (id, nombre, slug, activa) values
    ('${AREA.x}', 'Comercial', 'comercial', true),
    ('${AREA.y}', 'Talento humano', 'talento-humano', true),
    ('${AREA.inactiva}', 'Archivo viejo', 'archivo-viejo', false);

  insert into permisos_area (usuario_id, area_id, nivel) values
    ('${U.editor}',       '${AREA.x}', 'edicion'),
    ('${U.editor}',       '${AREA.y}', 'lectura'),
    ('${U.lector}',       '${AREA.x}', 'lectura'),
    ('${U.lector}',       '${AREA.inactiva}', 'edicion'),
    ('${U.inactivo}',     '${AREA.x}', 'edicion'),
    ('${U.editorLector}', '${AREA.x}', 'lectura');

  insert into documentos (id, area_id, titulo, storage_path, nombre_archivo, mime, tamano_bytes, vigente_desde, vigente_hasta, subido_por) values
    ('${DOC.vigente}',       '${AREA.x}', 'Lista de precios',   '${AREA.x}/${DOC.vigente}/precios.pdf',   'precios.pdf',   'application/pdf', 1000, now() - interval '1 day',  now() + interval '30 days', '${U.editor}'),
    ('${DOC.vencidoAyer}',   '${AREA.x}', 'Promo agosto',       '${AREA.x}/${DOC.vencidoAyer}/promo.pdf', 'promo.pdf',     'application/pdf', 1000, now() - interval '40 days', now() - interval '1 day',   '${U.editor}'),
    ('${DOC.programado}',    '${AREA.x}', 'Promo octubre',      '${AREA.x}/${DOC.programado}/oct.pdf',    'oct.pdf',       'application/pdf', 1000, now() + interval '5 days',  now() + interval '40 days', '${U.editor}'),
    ('${DOC.purgado}',       '${AREA.x}', 'Circular 2024',      'purgado/${DOC.purgado}',                 'circular.pdf',  'application/pdf', 0,    now() - interval '400 days', now() - interval '300 days', '${U.editor}'),
    ('${DOC.enY}',           '${AREA.y}', 'Reglamento interno', '${AREA.y}/${DOC.enY}/reglamento.pdf',    'reglamento.pdf','application/pdf', 1000, now() - interval '1 day',  null, '${U.admin}'),
    ('${DOC.vencidoHace10}', '${AREA.x}', 'Promo julio',        '${AREA.x}/${DOC.vencidoHace10}/jul.pdf', 'jul.pdf',       'application/pdf', 1000, now() - interval '60 days', now() - interval '10 days', '${U.editor}'),
    ('${DOC.sinVencimiento}','${AREA.x}', 'Manual de marca',    '${AREA.x}/${DOC.sinVencimiento}/marca.pdf','marca.pdf',   'application/pdf', 1000, now() - interval '1 day',  null, '${U.editor}'),
    ('${DOC.enAreaInactiva}','${AREA.inactiva}', 'Viejo',       '${AREA.inactiva}/${DOC.enAreaInactiva}/v.pdf','v.pdf',    'application/pdf', 1000, now() - interval '1 day',  null, '${U.admin}');
  update documentos set purgado_en = now() - interval '10 days' where id = '${DOC.purgado}';

  insert into storage.objects (bucket_id, name, owner) values
    ('documentos', '${AREA.x}/${DOC.vigente}/precios.pdf', '${U.editor}'),
    ('documentos', '${AREA.x}/${DOC.vencidoAyer}/promo.pdf', '${U.editor}'),
    ('documentos', '${AREA.x}/${DOC.vencidoHace10}/jul.pdf', '${U.editor}'),
    ('documentos', '${AREA.y}/${DOC.enY}/reglamento.pdf', '${U.admin}');

  insert into accesos (usuario_id, usuario_email, usuario_nombre, documento_id, doc_titulo, area_nombre, accion) values
    ('${U.editor}', 'editor@empresa.com', 'Eva Editora', '${DOC.vigente}', 'Lista de precios', 'Comercial', 'abrir'),
    ('${U.editor}', 'editor@empresa.com', 'Eva Editora', '${DOC.vigente}', 'Lista de precios', 'Comercial', 'abrir'),
    ('${U.admin}',  'admin@empresa.com',  'Ana Admin',   '${DOC.vigente}', 'Lista de precios', 'Comercial', 'descargar');
`);

// ---------------------------------------------------------------------------
// 4. Pruebas
// ---------------------------------------------------------------------------
console.log("\nTrigger de perfiles");
grupo("Trigger de perfiles");
await prueba("crear_perfil_nuevo_usuario copia nombre y rol de raw_user_meta_data", async () => {
  const r = await db.query(`select nombre, rol::text as rol from perfiles where id = $1`, [U.admin]);
  igual(r.rows[0].nombre, "Ana Admin", "nombre");
  igual(r.rows[0].rol, "admin", "rol");
});
await prueba("sin rol en metadata queda como 'lector'", async () => {
  const r = await db.query(`select rol::text as rol from perfiles where id = $1`, [U.lector]);
  igual(r.rows[0].rol, "lector", "rol");
});

console.log("\n[1] Un lector no puede insertar en documentos");
grupo("[1] Lector no inserta");
await prueba("lector: insert directo en documentos → rechazado por RLS", () =>
  comoDebeFallar(U.lector, (tx) =>
    tx.query(
      `insert into documentos (area_id, titulo, storage_path, nombre_archivo, subido_por) values ($1::uuid, 'x', $1::text || '/a/b.pdf', 'b.pdf', $2)`,
      [AREA.x, U.lector],
    ),
  ),
);
await prueba("lector: insert en storage.objects → rechazado", () =>
  comoDebeFallar(U.lector, (tx) =>
    tx.query(`insert into storage.objects (bucket_id, name) values ('documentos', $1 || '/zz/b.pdf')`, [AREA.x]),
  ),
);
await prueba("editor con solo lectura en Y: insert en Y → rechazado", () =>
  comoDebeFallar(U.editor, (tx) =>
    tx.query(
      `insert into documentos (area_id, titulo, storage_path, nombre_archivo, subido_por) values ($1::uuid, 'x', $1::text || '/a/b.pdf', 'b.pdf', $2)`,
      [AREA.y, U.editor],
    ),
  ),
);
await prueba("editor con edición en X: insert en X → aceptado", async () => {
  const r = await como(U.editor, (tx) =>
    tx.query(
      `insert into documentos (id, area_id, titulo, storage_path, nombre_archivo, subido_por)
       values ('20000000-0000-4000-8000-0000000000aa', $1::uuid, 'Nuevo', $1::text || '/20000000-0000-4000-8000-0000000000aa/n.pdf', 'n.pdf', $2) returning id`,
      [AREA.x, U.editor],
    ),
  );
  igual(r.rows.length, 1, "filas insertadas");
});
await prueba("editor: insert con storage_path de otra área → rechazado (contrato de ruta)", () =>
  comoDebeFallar(U.editor, (tx) =>
    tx.query(
      `insert into documentos (area_id, titulo, storage_path, nombre_archivo, subido_por) values ($1, 'x', $2 || '/a/b.pdf', 'b.pdf', $3)`,
      [AREA.x, AREA.y, U.editor],
    ),
  ),
);
await prueba("editor: insert a nombre de otro (subido_por ≠ auth.uid()) → rechazado", () =>
  comoDebeFallar(U.editor, (tx) =>
    tx.query(
      `insert into documentos (area_id, titulo, storage_path, nombre_archivo, subido_por) values ($1::uuid, 'x', $1::text || '/a/c.pdf', 'c.pdf', $2)`,
      [AREA.x, U.admin],
    ),
  ),
);
await prueba("editor: insert en storage.objects bajo X → aceptado; bajo Y → rechazado", async () => {
  await como(U.editor, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documentos', $1 || '/nuevo/n.pdf')`, [AREA.x]));
  await comoDebeFallar(U.editor, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documentos', $1 || '/nuevo/n.pdf')`, [AREA.y]));
});
await prueba("editor: no puede mover un documento a un área donde no edita", () =>
  comoDebeFallar(U.editor, (tx) => tx.query(`update documentos set area_id = $1::uuid, storage_path = $1::text || '/x/y.pdf' where id = $2`, [AREA.y, DOC.vigente])),
);

console.log("\n[2] Sin permiso sobre el área no se ve nada, ni con el id exacto");
grupo("[2] Sin permiso no ve");
await prueba("usuario sin permisos: documento por id → 0 filas", async () => {
  const r = await como(U.sinPermiso, (tx) => filas(tx, `select id from documentos where id = $1`, [DOC.vigente]));
  igual(r.length, 0, "filas");
});
await prueba("usuario sin permisos: no ve áreas ni documentos", async () => {
  const a = await como(U.sinPermiso, (tx) => filas(tx, `select id from areas`));
  const d = await como(U.sinPermiso, (tx) => filas(tx, `select id from documentos`));
  igual(a.length, 0, "áreas");
  igual(d.length, 0, "documentos");
});
await prueba("usuario sin permisos: nivel_en_area(X) es null", async () => {
  const r = await como(U.sinPermiso, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(r[0].n, null, "nivel");
});
await prueba("lector de X: no ve el documento de Y ni con el id exacto", async () => {
  const r = await como(U.lector, (tx) => filas(tx, `select id from documentos where id = $1`, [DOC.enY]));
  igual(r.length, 0, "filas");
});
await prueba("lector de X: no ve objetos de Storage de Y", async () => {
  const r = await como(U.lector, (tx) => filas(tx, `select name from storage.objects where name like $1 || '/%'`, [AREA.y]));
  igual(r.length, 0, "objetos");
});
await prueba("área inactiva: nadie (ni con permiso de edición) la ve ni ve sus documentos", async () => {
  const a = await como(U.lector, (tx) => filas(tx, `select id from areas where id = $1`, [AREA.inactiva]));
  const d = await como(U.lector, (tx) => filas(tx, `select id from documentos where id = $1`, [DOC.enAreaInactiva]));
  igual(a.length, 0, "áreas");
  igual(d.length, 0, "documentos");
});

console.log("\n[3] Vencido: desaparece para el lector, sigue visible para el editor");
grupo("[3] Vigencia");
await prueba("lector: solo ve vigentes (precios, manual y el recién subido por el editor)", async () => {
  const r = await como(U.lector, (tx) => filas(tx, `select titulo from documentos order by titulo`));
  igual(r.map((x) => x.titulo).join("|"), "Lista de precios|Manual de marca|Nuevo", "títulos visibles");
});
await prueba("lector: documento vencido ayer por id → 0 filas", async () => {
  const r = await como(U.lector, (tx) => filas(tx, `select id from documentos where id = $1`, [DOC.vencidoAyer]));
  igual(r.length, 0, "filas");
});
await prueba("lector: documento programado → 0 filas", async () => {
  const r = await como(U.lector, (tx) => filas(tx, `select id from documentos where id = $1`, [DOC.programado]));
  igual(r.length, 0, "filas");
});
await prueba("lector: documento purgado → 0 filas", async () => {
  const r = await como(U.lector, (tx) => filas(tx, `select id from documentos where id = $1`, [DOC.purgado]));
  igual(r.length, 0, "filas");
});
await prueba("editor de X: ve vencido, programado y purgado de X", async () => {
  const r = await como(U.editor, (tx) => filas(tx, `select id from documentos where id in ($1, $2, $3)`, [DOC.vencidoAyer, DOC.programado, DOC.purgado]));
  igual(r.length, 3, "filas");
});
await prueba("editor con lectura en Y: en Y se comporta como lector (ve solo vigentes)", async () => {
  const r = await como(U.editor, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.y]));
  igual(r[0].n, "lectura", "nivel en Y");
});
await prueba("rol lector con permiso 'edicion' en área inactiva / techo: nivel efectivo nunca supera lectura", async () => {
  // Mario tiene rol editor y permiso lectura en X → lectura. Luis (rol lector) jamás obtiene edición.
  const m = await como(U.editorLector, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(m[0].n, "lectura", "Mario en X");
  await db.query(`update permisos_area set nivel = 'edicion' where usuario_id = $1 and area_id = $2`, [U.lector, AREA.x]);
  const l = await como(U.lector, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(l[0].n, "lectura", "Luis con permiso edición pero rol lector");
  await db.query(`update permisos_area set nivel = 'lectura' where usuario_id = $1 and area_id = $2`, [U.lector, AREA.x]);
});
await prueba("v_documentos_estado calcula el estado (security_invoker respeta RLS)", async () => {
  const e = await como(U.editor, (tx) => filas(tx, `select titulo, estado from v_documentos_estado where area_id = $1 order by titulo`, [AREA.x]));
  const porTitulo = Object.fromEntries(e.map((x) => [x.titulo, x.estado]));
  igual(porTitulo["Lista de precios"], "vigente");
  igual(porTitulo["Promo agosto"], "vencido");
  igual(porTitulo["Promo octubre"], "programado");
  igual(porTitulo["Circular 2024"], "purgado");
  const l = await como(U.lector, (tx) => filas(tx, `select estado from v_documentos_estado`));
  igual(l.every((x) => x.estado === "vigente"), true, "lector solo vigentes en la vista");
});

console.log("\n[4] Un usuario con activo = false no consulta nada");
grupo("[4] Inactivo");
await prueba("inactivo (tenía edición en X): mi_rol() es null y nivel_en_area(X) es null", async () => {
  const r = await como(U.inactivo, (tx) => filas(tx, `select public.mi_rol()::text as rol, public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(r[0].rol, null, "mi_rol");
  igual(r[0].n, null, "nivel");
});
await prueba("inactivo: 0 áreas, 0 documentos, 0 objetos de Storage", async () => {
  const a = await como(U.inactivo, (tx) => filas(tx, `select id from areas`));
  const d = await como(U.inactivo, (tx) => filas(tx, `select id from documentos`));
  const o = await como(U.inactivo, (tx) => filas(tx, `select name from storage.objects`));
  igual(a.length + d.length + o.length, 0, "filas visibles");
});
await prueba("inactivo: no puede insertar documentos aunque tuviera permiso de edición", () =>
  comoDebeFallar(U.inactivo, (tx) =>
    tx.query(`insert into documentos (area_id, titulo, storage_path, nombre_archivo, subido_por) values ($1::uuid, 'x', $1::text || '/a/b.pdf', 'b.pdf', $2)`, [AREA.x, U.inactivo]),
  ),
);
await prueba("inactivo: no puede reactivarse a sí mismo", () =>
  comoDebeFallar(U.inactivo, (tx) => tx.query(`update perfiles set activo = true where id = $1`, [U.inactivo])),
);

console.log("\n[5] Solo el admin lee accesos");
grupo("[5] Auditoría solo admin");
await prueba("lector y editor: select accesos → 0 filas (hay 3 en la tabla)", async () => {
  const l = await como(U.lector, (tx) => filas(tx, `select id from accesos`));
  const e = await como(U.editor, (tx) => filas(tx, `select id from accesos`));
  igual(l.length, 0, "lector");
  igual(e.length, 0, "editor");
});
await prueba("admin: select accesos → 3 filas", async () => {
  const r = await como(U.admin, (tx) => filas(tx, `select id from accesos`));
  igual(r.length, 3, "admin");
});
await prueba("v_auditoria y contadores de la vista: vacíos para no-admin, reales para admin", async () => {
  const l = await como(U.lector, (tx) => filas(tx, `select veces_consultado from v_documentos_estado where id = $1`, [DOC.vigente]));
  const a = await como(U.admin, (tx) => filas(tx, `select veces_consultado, usuarios_distintos from v_documentos_estado where id = $1`, [DOC.vigente]));
  igual(Number(l[0].veces_consultado), 0, "lector ve 0 consultas");
  igual(Number(a[0].veces_consultado), 3, "admin ve 3 consultas");
  igual(Number(a[0].usuarios_distintos), 2, "admin ve 2 personas");
  const va = await como(U.editor, (tx) => filas(tx, `select * from v_auditoria`));
  igual(va.length, 0, "v_auditoria para editor");
});
await prueba("pendientes_de_leer: admin obtiene a Luis (lector con permiso que no abrió); no-admin obtiene 0", async () => {
  const a = await como(U.admin, (tx) => filas(tx, `select nombre from public.pendientes_de_leer($1) order by nombre`, [DOC.vigente]));
  igual(a.map((x) => x.nombre).join("|"), "Luis Lector|Mario Mixto", "pendientes (Iván inactivo excluido)");
  const e = await como(U.editor, (tx) => filas(tx, `select nombre from public.pendientes_de_leer($1)`, [DOC.vigente]));
  igual(e.length, 0, "editor");
});
await prueba("cualquier usuario registra su propio acceso; no puede registrar a nombre de otro", async () => {
  await como(U.lector, (tx) =>
    tx.query(`insert into accesos (usuario_id, usuario_email, documento_id, doc_titulo, accion) values ($1, 'lector@empresa.com', $2, 'Lista de precios', 'abrir')`, [U.lector, DOC.vigente]),
  );
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`insert into accesos (usuario_id, usuario_email, documento_id, doc_titulo, accion) values ($1, 'admin@empresa.com', $2, 'Lista de precios', 'abrir')`, [U.admin, DOC.vigente]),
  );
});

console.log("\n[6] Nadie modifica ni borra accesos, ni el admin");
grupo("[6] Auditoría inmutable");
await prueba("admin: update accesos → 0 filas afectadas", async () => {
  const r = await como(U.admin, (tx) => tx.query(`update accesos set accion = 'descargar' where accion = 'abrir'`));
  igual(r.affectedRows ?? 0, 0, "filas actualizadas");
});
await prueba("admin: delete accesos → 0 filas afectadas", async () => {
  const r = await como(U.admin, (tx) => tx.query(`delete from accesos`));
  igual(r.affectedRows ?? 0, 0, "filas borradas");
  const total = await db.query(`select count(*)::int as n from accesos`);
  igual(total.rows[0].n, 4, "siguen las 4 filas");
});
await prueba("lector: update/delete accesos → 0 filas afectadas", async () => {
  const u = await como(U.lector, (tx) => tx.query(`update accesos set accion = 'descargar'`));
  const d = await como(U.lector, (tx) => tx.query(`delete from accesos`));
  igual((u.affectedRows ?? 0) + (d.affectedRows ?? 0), 0, "filas afectadas");
});

console.log("\nOtras políticas");
grupo("Otras políticas");
await prueba("lector: no puede escalar su rol ni activarse (with check en perfiles_update_propio)", async () => {
  await comoDebeFallar(U.lector, (tx) => tx.query(`update perfiles set rol = 'admin' where id = $1`, [U.lector]));
  const r = await como(U.lector, (tx) => tx.query(`update perfiles set nombre = 'Luis L.' where id = $1 returning nombre`, [U.lector]));
  igual(r.rows[0].nombre, "Luis L.", "puede cambiar su nombre");
});
await prueba("lector: no crea áreas ni se otorga permisos; admin sí", async () => {
  await comoDebeFallar(U.lector, (tx) => tx.query(`insert into areas (nombre, slug) values ('Hack', 'hack')`));
  await comoDebeFallar(U.lector, (tx) => tx.query(`insert into permisos_area (usuario_id, area_id, nivel) values ($1, $2, 'edicion')`, [U.lector, AREA.y]));
  await como(U.admin, (tx) => tx.query(`insert into areas (nombre, slug) values ('Operaciones', 'operaciones')`));
  await como(U.admin, (tx) => tx.query(`insert into permisos_area (usuario_id, area_id, nivel, otorgado_por) values ($1, $2, 'lectura', $3)`, [U.lector, AREA.y, U.admin]));
  const r = await como(U.lector, (tx) => filas(tx, `select id from documentos where id = $1`, [DOC.enY]));
  igual(r.length, 1, "tras el permiso, ya ve el documento de Y");
});
await prueba("editor: no puede borrar documentos ni objetos de Storage; admin sí", async () => {
  const d = await como(U.editor, (tx) => tx.query(`delete from documentos where id = $1`, [DOC.vencidoAyer]));
  igual(d.affectedRows ?? 0, 0, "editor borra documentos");
  const o = await como(U.editor, (tx) => tx.query(`delete from storage.objects where name = $1`, [`${AREA.x}/${DOC.vencidoAyer}/promo.pdf`]));
  igual(o.affectedRows ?? 0, 0, "editor borra objetos");
  const oa = await como(U.admin, (tx) => tx.query(`delete from storage.objects where name = $1`, [`${AREA.x}/${DOC.vencidoAyer}/promo.pdf`]));
  igual(oa.affectedRows, 1, "admin borra objeto");
  const da = await como(U.admin, (tx) => tx.query(`delete from documentos where id = $1`, [DOC.vencidoAyer]));
  igual(da.affectedRows, 1, "admin borra documento");
});
await prueba("uuid_seguro devuelve null ante basura (las políticas de Storage no explotan)", async () => {
  const r = await db.query(`select public.uuid_seguro('no-es-uuid') as a, public.uuid_seguro($1)::text as b`, [AREA.x]);
  igual(r.rows[0].a, null);
  igual(r.rows[0].b, AREA.x);
  const o = await como(U.lector, (tx) => filas(tx, `select name from storage.objects where name = 'carpeta-rara/x.pdf'`));
  igual(o.length, 0);
});

console.log("\nPurga");
grupo("Purga");
await prueba("docs_por_purgar y marcar_purgados no son ejecutables por authenticated", async () => {
  await comoDebeFallar(U.admin, (tx) => tx.query(`select * from public.docs_por_purgar(7)`), /permission denied/i);
  await comoDebeFallar(U.admin, (tx) => tx.query(`select public.marcar_purgados(array[]::uuid[])`), /permission denied/i);
});
await prueba("docs_por_purgar(7) devuelve solo lo vencido hace más de 7 días (no lo de ayer)", async () => {
  const r = await db.query(`select id from public.docs_por_purgar(7)`);
  igual(r.rows.map((x) => x.id).join("|"), DOC.vencidoHace10, "candidatos");
});
await prueba("marcar_purgados marca, reescribe storage_path y es idempotente", async () => {
  const n1 = await db.query(`select public.marcar_purgados(array[$1]::uuid[]) as n`, [DOC.vencidoHace10]);
  igual(n1.rows[0].n, 1, "primera pasada");
  const fila = await db.query(`select storage_path, tamano_bytes, purgado_en is not null as purgado from documentos where id = $1`, [DOC.vencidoHace10]);
  igual(fila.rows[0].storage_path, `purgado/${DOC.vencidoHace10}`);
  igual(Number(fila.rows[0].tamano_bytes), 0);
  igual(fila.rows[0].purgado, true);
  const n2 = await db.query(`select public.marcar_purgados(array[$1]::uuid[]) as n`, [DOC.vencidoHace10]);
  igual(n2.rows[0].n, 0, "segunda pasada");
  const r = await db.query(`select id from public.docs_por_purgar(7)`);
  igual(r.rows.length, 0, "ya no hay candidatos");
});

// ---------------------------------------------------------------------------
// 5. Resumen
// ---------------------------------------------------------------------------
const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length}/${resultados.length} comprobaciones superadas.`);
if (avisos.length) console.log(`Ajustes aplicados solo en el entorno de prueba: ${avisos.join("; ")}.`);
if (fallidas.length) {
  console.log("\nFallidas:");
  for (const f of fallidas) console.log(` - [${f.grupo}] ${f.nombre}: ${f.error}`);
  process.exit(1);
}
await db.close();
