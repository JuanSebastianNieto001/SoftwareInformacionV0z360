/**
 * Pruebas de las políticas RLS contra un Postgres embebido (PGlite), sin
 * necesidad de Docker ni de un proyecto de Supabase.
 *
 * Se aplican TODAS las migraciones de supabase/migrations/ en orden, así que
 * lo que se prueba aquí es el esquema que hay en producción, no el inicial.
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
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

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
// 2. El esquema real, TODAS las migraciones en orden
// ---------------------------------------------------------------------------
// Aplicar solo la 001 dejaba la suite probando un esquema que ya no existe:
// los niveles de acceso, los grupos y el endurecimiento de seguridad viven en
// las migraciones siguientes. Se aplican todas, en orden, tal cual están.
const avisos = [];

/** Dos cosas que PGlite no trae y que no afectan a ninguna política. */
function adaptarAPGlite(sql) {
  let salida = sql;
  if (/create extension if not exists pgcrypto/i.test(salida)) {
    salida = salida.replace(/create extension if not exists pgcrypto;/gi, "-- (pgcrypto omitido en PGlite)");
    avisos.push("pgcrypto omitido (gen_random_uuid es nativo desde PG13)");
  }
  if (salida.includes("to_tsvector('spanish'")) {
    salida = salida.split("to_tsvector('spanish'").join("to_tsvector('simple'");
    avisos.push("índice GIN con configuración 'simple' en lugar de 'spanish'");
  }
  return salida;
}

const dirMigraciones = join(raiz, "supabase", "migrations");
const migraciones = readdirSync(dirMigraciones)
  .filter((n) => n.endsWith(".sql"))
  .sort();

for (const nombre of migraciones) {
  const sql = adaptarAPGlite(readFileSync(join(dirMigraciones, nombre), "utf8"));
  try {
    await db.exec(sql);
  } catch (e) {
    console.error(`\n✘ Falló la migración ${nombre}:\n   ${e.message}`);
    process.exit(1);
  }
}
console.log(
  `Esquema aplicado: ${migraciones.length} migraciones` +
    (avisos.length ? `. Ajustes solo para PGlite: ${[...new Set(avisos)].join("; ")}.` : "."),
);

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

  -- Desde la migración 011 el disparador crea los perfiles como lector e
  -- INACTIVOS, y el rol no se lee del metadata. Aquí se hace lo mismo que
  -- hace el panel de administración tras dar de alta a alguien: un
  -- administrador ya autenticado fija rol y estado.
  update perfiles set rol = 'admin',  activo = true  where id = '${U.admin}';
  update perfiles set rol = 'editor', activo = true  where id = '${U.editor}';
  update perfiles set rol = 'lector', activo = true  where id = '${U.lector}';
  update perfiles set rol = 'editor', activo = true  where id = '${U.sinPermiso}';
  update perfiles set rol = 'editor', activo = true  where id = '${U.editorLector}';
  update perfiles set rol = 'lector', activo = false where id = '${U.inactivo}';

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
await prueba("el disparador NO acepta el rol que venga en el metadata (escalada cerrada)", async () => {
  // Esta prueba nació al revés: comprobaba que el rol se copiara del
  // metadata. Ese campo lo escribe quien se registra, así que con el
  // registro público abierto bastaba pedir rol:"admin" para serlo. Ahora
  // comprueba lo contrario, y si alguien vuelve a leer el metadata, falla.
  const intruso = "90000000-0000-4000-8000-000000000001";
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, 'intruso@fuera.com', '{"nombre":"Intruso","rol":"admin","gestiona_buzon":true}')`,
    [intruso],
  );
  const r = await db.query(
    `select nombre, rol::text as rol, activo, gestiona_buzon from perfiles where id = $1`,
    [intruso],
  );
  igual(r.rows[0].rol, "lector", "el rol pedido en el metadata se ignora");
  igual(r.rows[0].activo, false, "la cuenta nace inactiva");
  igual(r.rows[0].gestiona_buzon, false, "no se concede el buzón por metadata");
  igual(r.rows[0].nombre, "Intruso", "el nombre sí se toma del metadata (no concede nada)");
});

await prueba("nadie se concede a sí mismo el buzón ni el rol (escalada cerrada)", async () => {
  // La política perfiles_update_propio fijaba rol y activo, pero
  // gestiona_buzon se añadió después y quedó fuera: cualquiera con sesión
  // podía hacerse gestor del buzón y leer todas las quejas.
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`update perfiles set gestiona_buzon = true where id = $1`, [U.lector]),
  );
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`update perfiles set rol = 'admin' where id = $1`, [U.lector]),
  );
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`update perfiles set cargo = 'Gerente' where id = $1`, [U.lector]),
  );
  // Lo que sí puede: su nombre y su marca de último acceso.
  const r = await como(U.lector, (tx) =>
    tx.query(`update perfiles set ultimo_login = now() where id = $1 returning id`, [U.lector]),
  );
  igual(r.rows.length, 1, "puede anotar su propio último acceso");
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
await prueba("el rol global es el techo: un lector nunca pasa de descarga", async () => {
  // Mario es editor con permiso de lectura en X: se queda en lectura, el
  // techo no regala nada. Luis es lector: aunque se le marque edición o
  // incluso Todos, el techo lo deja en descarga.
  const m = await como(U.editorLector, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(m[0].n, "lectura", "Mario (editor con permiso lectura) en X");

  for (const concedido of ["edicion", "total"]) {
    await db.query(`update permisos_area set nivel = $3 where usuario_id = $1 and area_id = $2`, [
      U.lector, AREA.x, concedido,
    ]);
    const l = await como(U.lector, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
    igual(l[0].n, "descarga", `Luis con permiso ${concedido} pero rol lector`);
  }
  await db.query(`update permisos_area set nivel = 'lectura' where usuario_id = $1 and area_id = $2`, [U.lector, AREA.x]);
});

await prueba("los grupos se suman al permiso propio y gana el mayor", async () => {
  const grupo = "80000000-0000-4000-8000-000000000001";
  await db.query(`insert into grupos (id, nombre, slug) values ($1, 'Operación', 'operacion')`, [grupo]);
  await db.query(`insert into grupos_usuarios (grupo_id, usuario_id) values ($1, $2)`, [grupo, U.editorLector]);

  // Mario tiene 'lectura' propia en X. El grupo le da 'edicion': gana el grupo.
  await db.query(`insert into permisos_grupo (grupo_id, area_id, nivel) values ($1, $2, 'edicion')`, [grupo, AREA.x]);
  let n = await como(U.editorLector, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(n[0].n, "edicion", "el grupo sube lo que la persona tenía");

  // Si el grupo da menos que lo propio, manda lo propio: entrar a un grupo
  // nunca le quita nada a nadie.
  await db.query(`update permisos_grupo set nivel = 'lectura' where grupo_id = $1`, [grupo]);
  await db.query(`update permisos_area set nivel = 'edicion' where usuario_id = $1 and area_id = $2`, [U.editorLector, AREA.x]);
  n = await como(U.editorLector, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(n[0].n, "edicion", "el grupo no rebaja el permiso propio");

  // Un grupo desactivado deja de conceder, pero conserva sus miembros.
  await db.query(`update permisos_area set nivel = 'lectura' where usuario_id = $1 and area_id = $2`, [U.editorLector, AREA.x]);
  await db.query(`update permisos_grupo set nivel = 'total' where grupo_id = $1`, [grupo]);
  await db.query(`update grupos set activo = false where id = $1`, [grupo]);
  n = await como(U.editorLector, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(n[0].n, "lectura", "grupo desactivado: solo queda lo propio");

  // Y quien no tiene nada, sigue sin tener nada. Esta es la comprobación que
  // atrapa el fallo de LEAST() ignorando los NULL: sin la guarda, alguien sin
  // permiso alguno salía con 'descarga' por el mero hecho de ser lector.
  const cero = await como(U.sinPermiso, (tx) => filas(tx, `select public.nivel_en_area($1)::text as n`, [AREA.x]));
  igual(cero[0].n, null, "sin permiso propio ni de grupo: null, no un nivel por defecto");

  await db.query(`delete from grupos where id = $1`, [grupo]);
});

await prueba("el nivel Todos añade borrar, y Editar no lo tiene", async () => {
  // Documento propio de esta prueba: borrar uno de los del montaje dejaría
  // sin sujeto a las comprobaciones que vienen después.
  const efimero = "20000000-0000-4000-8000-0000000000ff";
  await db.query(
    `insert into documentos (id, area_id, titulo, storage_path, nombre_archivo, mime, tamano_bytes, vigente_desde, subido_por)
     values ($1, $2, 'Efímero', $3, 'e.pdf', 'application/pdf', 10, now() - interval '1 day', $4)
     on conflict (id) do nothing`,
    [efimero, AREA.x, AREA.x + "/" + efimero + "/e.pdf", U.editor],
  );

  const fijarNivel = (nivel) =>
    db.query(`update permisos_area set nivel = $3 where usuario_id = $1 and area_id = $2`, [
      U.editor,
      AREA.x,
      nivel,
    ]);

  await fijarNivel("edicion");
  const conEdicion = await como(U.editor, (tx) =>
    tx.query(`delete from documentos where id = $1`, [efimero]),
  );
  igual(conEdicion.affectedRows ?? 0, 0, "con Editar NO borra");

  await fijarNivel("total");
  const conTotal = await como(U.editor, (tx) =>
    tx.query(`delete from documentos where id = $1`, [efimero]),
  );
  igual(conTotal.affectedRows ?? 0, 1, "con Todos sí borra");

  await fijarNivel("edicion");
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

console.log("\nEvaluación de desempeño");
grupo("Evaluación de desempeño");

// Montaje: el área del módulo y el catálogo los crea la migración 012.
// Aquí solo se conceden niveles, como haría el panel: Luis (lector) ve,
// Eva (editor) califica. Nora (sinPermiso) no tiene nada.
const EVA = (await db.query(`select public.area_evaluacion() as id`)).rows[0].id;
await db.query(
  `insert into permisos_area (usuario_id, area_id, nivel) values ($1, $3, 'lectura'), ($2, $3, 'edicion')`,
  [U.lector, U.editor, EVA],
);
const CARGO = (await db.query(`select id from evaluacion_cargos where codigo = 'CARGO-01'`)).rows[0].id;
const CRITERIOS = (
  await db.query(`select id from evaluacion_criterios where cargo_id = $1 order by orden`, [CARGO])
).rows.map((r) => r.id);
const CRITERIO_AJENO = (
  await db.query(
    `select c.id from evaluacion_criterios c join evaluacion_cargos g on g.id = c.cargo_id where g.codigo = 'CARGO-02' order by c.orden limit 1`,
  )
).rows[0].id;
let EVALUACION = null;

await prueba("el módulo es un área: sin permiso no se ve el cuadro, ni cargos, ni criterios", async () => {
  const r = await como(U.sinPermiso, (tx) =>
    filas(
      tx,
      `select (select count(*) from areas where modulo = 'evaluacion') as areas,
              (select count(*) from evaluacion_cargos)        as cargos,
              (select count(*) from evaluacion_criterios)     as criterios,
              (select count(*) from evaluacion_360_preguntas) as preguntas,
              public.nivel_en_area(public.area_evaluacion())::text as nivel`,
    ),
  );
  igual(Number(r[0].areas), 0, "el cuadro no aparece");
  igual(Number(r[0].cargos), 0, "catálogo de cargos oculto");
  igual(Number(r[0].criterios), 0, "criterios ocultos");
  igual(Number(r[0].preguntas), 0, "preguntas 360 ocultas");
  igual(r[0].nivel, null, "nivel_en_area del módulo es null");
});

await prueba("con Vista: ve los 15 cargos y 180 criterios, pero no crea evaluaciones ni respuestas 360", async () => {
  const r = await como(U.lector, (tx) =>
    filas(tx, `select (select count(*) from evaluacion_cargos) as cargos, (select count(*) from evaluacion_criterios) as criterios`),
  );
  igual(Number(r[0].cargos), 15, "cargos");
  igual(Number(r[0].criterios), 180, "criterios");
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(
      `insert into evaluaciones (area_id, cargo_id, periodo, evaluado_nombre, evaluador_nombre, creado_por) values ($1, $2, '2026', 'Alguien', 'Luis', $3)`,
      [EVA, CARGO, U.lector],
    ),
  );
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(
      `insert into evaluacion_360_respuestas (area_id, evaluado_nombre, evaluador_nombre, cargo_id, perspectiva, creado_por, p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12)
       values ($1, 'A', 'B', $2, 'pares', $3, 3,3,3,3,3,3,3,3,3,3,3,3)`,
      [EVA, CARGO, U.lector],
    ),
  );
});

await prueba("con Edición: crea, califica, y la vista calcula como la hoja (K24 = suma de ponderados / 12)", async () => {
  const ins = await como(U.editor, (tx) =>
    filas(
      tx,
      `insert into evaluaciones (area_id, cargo_id, periodo, evaluado_nombre, evaluador_nombre, creado_por)
       values ($1, $2, '2026', 'Marko Vélez', 'Clemencia García', $3) returning id`,
      [EVA, CARGO, U.editor],
    ),
  );
  EVALUACION = ins[0].id;
  // Tres celdas: jefe 4 en el criterio 1 (→1,6), autoevaluación 5 en el 1
  // (→0,5) y pares 4 en el 2 (→1,0). Lo demás en blanco cuenta 0.
  await como(U.editor, (tx) =>
    tx.query(
      `insert into evaluacion_calificaciones (evaluacion_id, criterio_id, perspectiva, calificacion)
       values ($1, $2, 'jefe_inmediato', 4), ($1, $2, 'autoevaluacion', 5), ($1, $3, 'pares', 4)`,
      [EVALUACION, CRITERIOS[0], CRITERIOS[1]],
    ),
  );
  const v = await como(U.editor, (tx) => filas(tx, `select * from v_evaluacion_resultados where evaluacion_id = $1`, [EVALUACION]));
  igual(Number(v[0].n_criterios), 12, "12 criterios por cargo");
  igual(Number(v[0].n_calificaciones), 3, "celdas calificadas");
  igual(Number(v[0].jefe_inmediato), 4, "F24: promedio de la perspectiva");
  igual(Number(v[0].autoevaluacion), 5, "D24");
  igual(Number(v[0].pares), 4, "H24");
  igual(v[0].subordinados, null, "J24 sin calificar: AVERAGE da vacío, no 0");
  const esperado = (4 * 0.4 + 5 * 0.1 + 4 * 0.25) / 12;
  igual(Math.abs(Number(v[0].nota_final) - esperado) < 1e-9, true, `K24 ${v[0].nota_final} ≈ ${esperado}`);
});

await prueba("un criterio de otro cargo no se puede calificar (disparador)", () =>
  comoDebeFallar(
    U.editor,
    (tx) =>
      tx.query(
        `insert into evaluacion_calificaciones (evaluacion_id, criterio_id, perspectiva, calificacion) values ($1, $2, 'pares', 3)`,
        [EVALUACION, CRITERIO_AJENO],
      ),
    /no pertenece/,
  ),
);

await prueba("una evaluación no se cuela en otro cuadro, ni a nombre de otro", async () => {
  await comoDebeFallar(U.editor, (tx) =>
    tx.query(
      `insert into evaluaciones (area_id, cargo_id, periodo, evaluado_nombre, evaluador_nombre, creado_por) values ($1, $2, '2026', 'X', 'Y', $3)`,
      [AREA.x, CARGO, U.editor],
    ),
  );
  await comoDebeFallar(U.editor, (tx) =>
    tx.query(
      `insert into evaluaciones (area_id, cargo_id, periodo, evaluado_nombre, evaluador_nombre, creado_por) values ($1, $2, '2026', 'X', 'Y', $3)`,
      [EVA, CARGO, U.admin],
    ),
  );
});

await prueba("cerrada: el editor ya no toca celdas ni cabecera; el administrador la reabre", async () => {
  const c = await como(U.editor, (tx) =>
    tx.query(`update evaluaciones set estado = 'cerrada', cerrada_en = now() where id = $1`, [EVALUACION]),
  );
  igual(c.affectedRows, 1, "cerrar es editar un borrador");
  const u = await como(U.editor, (tx) =>
    tx.query(`update evaluacion_calificaciones set calificacion = 1 where evaluacion_id = $1`, [EVALUACION]),
  );
  igual(u.affectedRows ?? 0, 0, "las celdas quedan como están");
  await comoDebeFallar(U.editor, (tx) =>
    tx.query(
      `insert into evaluacion_calificaciones (evaluacion_id, criterio_id, perspectiva, calificacion) values ($1, $2, 'subordinados', 5)`,
      [EVALUACION, CRITERIOS[2]],
    ),
  );
  const h = await como(U.editor, (tx) =>
    tx.query(`update evaluaciones set plan_accion = 'tarde' where id = $1`, [EVALUACION]),
  );
  igual(h.affectedRows ?? 0, 0, "la cabecera tampoco");
  const r = await como(U.admin, (tx) =>
    tx.query(`update evaluaciones set estado = 'borrador', cerrada_en = null where id = $1`, [EVALUACION]),
  );
  igual(r.affectedRows, 1, "el admin reabre");
});

await prueba("matriz 360: con Edición se registra y la vista calcula; sin permiso no se ve", async () => {
  const ins = await como(U.editor, (tx) =>
    filas(
      tx,
      `insert into evaluacion_360_respuestas (area_id, evaluado_nombre, evaluador_nombre, cargo_id, perspectiva, creado_por, p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12)
       values ($1, 'Marko', 'Kelmer', $2, 'pares', $3, 5,4,5, 3.5,4,4, 3.5,4,4, 3.5,4,3.5) returning id`,
      [EVA, CARGO, U.editor],
    ),
  );
  const v = await como(U.lector, (tx) =>
    filas(tx, `select promedio, liderazgo, trabajo_equipo, calidad_resultados, adaptabilidad from v_evaluacion_360 where id = $1`, [ins[0].id]),
  );
  igual(v.length, 1, "con Vista se lee");
  const aprox = (a, b, msg) => igual(Math.abs(Number(a) - b) < 1e-9, true, `${msg}: ${a} ≈ ${b}`);
  aprox(v[0].promedio, 48 / 12, "H: promedio");
  aprox(v[0].liderazgo, 14 / 3, "J: liderazgo");
  aprox(v[0].trabajo_equipo, 11.5 / 3, "K: equipo");
  aprox(v[0].calidad_resultados, 11.5 / 3, "L: calidad");
  aprox(v[0].adaptabilidad, 11 / 3, "M: adaptabilidad");
  const n = await como(U.sinPermiso, (tx) => filas(tx, `select count(*) as n from evaluacion_360_respuestas`));
  igual(Number(n[0].n), 0, "sin permiso: cero filas");
});

await prueba("eliminar exige Total (o admin): con Edición no se borra nada", async () => {
  const d = await como(U.editor, (tx) => tx.query(`delete from evaluaciones where id = $1`, [EVALUACION]));
  igual(d.affectedRows ?? 0, 0, "con Edición no borra");
  await db.query(`update permisos_area set nivel = 'total' where usuario_id = $1 and area_id = $2`, [U.editor, EVA]);
  const d2 = await como(U.editor, (tx) => tx.query(`delete from evaluaciones where id = $1`, [EVALUACION]));
  igual(d2.affectedRows, 1, "con Total sí");
  await db.query(`update permisos_area set nivel = 'edicion' where usuario_id = $1 and area_id = $2`, [U.editor, EVA]);
});

console.log("\nCumpleaños y notificaciones");
grupo("Cumpleaños y notificaciones");

const CUMPLE_AREA = (await db.query(`select public.area_modulo('cumpleanos') as id`)).rows[0].id;
await db.query(`insert into permisos_area (usuario_id, area_id, nivel) values ($1, $2, 'lectura')`, [U.lector, CUMPLE_AREA]);
// Dos cumpleaños: uno mañana (debe avisar) y uno dentro de diez días (no).
await db.query(
  `insert into cumpleanos (area_id, nombre, grupo, team_leader, cumple_mes, cumple_dia, anio_nacimiento)
   select $1::uuid, 'Persona Mañana', 'Kelmer', 'Kelmer', extract(month from current_date + 1)::int, extract(day from current_date + 1)::int, 1990
   union all
   select $1::uuid, 'Persona Lejana', 'Estructura', null, extract(month from current_date + 10)::int, extract(day from current_date + 10)::int, null`,
  [CUMPLE_AREA],
);

await prueba("sin permiso: ni el cuadro, ni la lista, ni alertas", async () => {
  const r = await como(U.sinPermiso, (tx) =>
    filas(tx, `select (select count(*) from v_cumpleanos) as n, public.generar_alertas_cumpleanos() as alertas, (select count(*) from notificaciones) as notis`),
  );
  igual(Number(r[0].n), 0, "no ve cumpleaños");
  igual(Number(r[0].alertas), 0, "la función no le genera nada");
  igual(Number(r[0].notis), 0, "cero notificaciones");
});

await prueba("con Vista: ve la lista y la vista calcula el próximo; recibe la alerta de mañana, y solo esa", async () => {
  const v = await como(U.lector, (tx) => filas(tx, `select nombre, dias_faltan, edad_que_cumple from v_cumpleanos order by dias_faltan`));
  igual(v.length, 2, "ve los dos");
  igual(Number(v[0].dias_faltan), 1, "mañana");
  igual(Number(v[1].dias_faltan), 10, "en diez días");
  igual(v[1].edad_que_cumple, null, "sin año no hay edad");
  const a1 = await como(U.lector, (tx) => filas(tx, `select public.generar_alertas_cumpleanos() as n`));
  igual(Number(a1[0].n), 1, "una alerta pendiente");
  const a2 = await como(U.lector, (tx) => filas(tx, `select public.generar_alertas_cumpleanos() as n`));
  igual(Number(a2[0].n), 1, "idempotente: repetir no duplica");
  const n = await como(U.lector, (tx) => filas(tx, `select titulo, enlace from notificaciones`));
  igual(n.length, 1, "exactamente una notificación");
  igual(n[0].titulo.includes("Mañana cumple años Persona Mañana"), true, `título: ${n[0].titulo}`);
  igual(n[0].enlace, "/cumpleanos", "enlace al cuadro");
});

await prueba("las notificaciones son de cada uno: otro no las ve ni las marca; el dueño sí", async () => {
  const ajeno = await como(U.editor, (tx) => filas(tx, `select count(*) as n from notificaciones`));
  igual(Number(ajeno[0].n), 0, "el editor no ve las del lector");
  const u = await como(U.editor, (tx) => tx.query(`update notificaciones set leida_en = now()`));
  igual(u.affectedRows ?? 0, 0, "ni las marca");
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`insert into notificaciones (usuario_id, clave, tipo, titulo) values ($1, 'x', 'cumpleanos', 'fabricada')`, [U.lector]),
  );
  const mia = await como(U.lector, (tx) => tx.query(`update notificaciones set leida_en = now() where leida_en is null`));
  igual(mia.affectedRows, 1, "el dueño la marca leída");
  const pend = await como(U.lector, (tx) => filas(tx, `select public.generar_alertas_cumpleanos() as n`));
  igual(Number(pend[0].n), 0, "ya no hay pendientes");
});

await prueba("con Vista no se agregan cumpleaños; con Edición sí, y solo en su cuadro", async () => {
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`insert into cumpleanos (area_id, nombre, grupo, cumple_mes, cumple_dia, creado_por) values ($1, 'X', 'Estructura', 1, 1, $2)`, [CUMPLE_AREA, U.lector]),
  );
  await db.query(`insert into permisos_area (usuario_id, area_id, nivel) values ($1, $2, 'edicion')`, [U.editor, CUMPLE_AREA]);
  const ok = await como(U.editor, (tx) =>
    filas(tx, `insert into cumpleanos (area_id, nombre, grupo, cumple_mes, cumple_dia, creado_por) values ($1, 'Nuevo', 'Estructura', 2, 29, $2) returning id`, [CUMPLE_AREA, U.editor]),
  );
  igual(ok.length, 1, "editor agrega");
  await comoDebeFallar(U.editor, (tx) =>
    tx.query(`insert into cumpleanos (area_id, nombre, grupo, cumple_mes, cumple_dia, creado_por) values ($1, 'Colado', 'Estructura', 1, 1, $2)`, [AREA.x, U.editor]),
  );
  // El 29 de febrero cae el 28 cuando el año no lo tiene.
  const p = await db.query(`select public.proximo_cumple(2, 29, '2027-01-01'::date)::text as f, public.proximo_cumple(2, 29, '2028-01-01'::date)::text as g`);
  igual(p.rows[0].f, "2027-02-28", "año no bisiesto");
  igual(p.rows[0].g, "2028-02-29", "año bisiesto");
});

console.log("\nEndurecimiento (015)");
grupo("Endurecimiento (015)");

await prueba("una notificación propia solo admite cambiar leida_en", async () => {
  await comoDebeFallar(
    U.lector,
    (tx) => tx.query(`update notificaciones set titulo = 'reescrito' where usuario_id = $1`, [U.lector]),
    /permission denied/i,
  );
  await comoDebeFallar(
    U.lector,
    (tx) => tx.query(`update notificaciones set clave = 'otra' where usuario_id = $1`, [U.lector]),
    /permission denied/i,
  );
  const ok = await como(U.lector, (tx) => tx.query(`update notificaciones set leida_en = now() where usuario_id = $1`, [U.lector]));
  igual(ok.affectedRows >= 1, true, "leida_en sí se puede");
});

await prueba("intentos_login no se lee ni se escribe directamente", async () => {
  await comoDebeFallar(U.admin, (tx) => tx.query(`select count(*) from intentos_login`), /permission denied/i);
  await comoDebeFallar(U.admin, (tx) => tx.query(`insert into intentos_login (correo) values ('x@y.z')`), /permission denied/i);
});

await prueba("el cargo de una evaluación con calificaciones no cambia, ni para el admin", async () => {
  const cargo2 = (await db.query(`select id from evaluacion_cargos where codigo = 'CARGO-02'`)).rows[0].id;
  const ins = await como(U.editor, (tx) =>
    filas(
      tx,
      `insert into evaluaciones (area_id, cargo_id, periodo, evaluado_nombre, evaluador_nombre, creado_por)
       values ($1, $2, '2027', 'Prueba Cargo', 'Eva', $3) returning id`,
      [EVA, CARGO, U.editor],
    ),
  );
  const ev = ins[0].id;
  // Sin calificaciones el cargo aún se puede corregir.
  const libre = await como(U.editor, (tx) => tx.query(`update evaluaciones set cargo_id = $2 where id = $1`, [ev, cargo2]));
  igual(libre.affectedRows, 1, "sin notas, se cambia");
  await como(U.editor, (tx) => tx.query(`update evaluaciones set cargo_id = $2 where id = $1`, [ev, CARGO]));
  await como(U.editor, (tx) =>
    tx.query(`insert into evaluacion_calificaciones (evaluacion_id, criterio_id, perspectiva, calificacion) values ($1, $2, 'pares', 4)`, [ev, CRITERIOS[0]]),
  );
  await comoDebeFallar(U.editor, (tx) => tx.query(`update evaluaciones set cargo_id = $2 where id = $1`, [ev, cargo2]), /No se puede cambiar el cargo/);
  await comoDebeFallar(U.admin, (tx) => tx.query(`update evaluaciones set cargo_id = $2 where id = $1`, [ev, cargo2]), /No se puede cambiar el cargo/);
  await db.query(`delete from evaluaciones where id = $1`, [ev]);
});

console.log("\nCalidad");
grupo("Calidad");

// Montaje: Eva (editor) con edición en el cuadro; Luis (lector) es un ASESOR
// de la estructura, sin acceso al cuadro; Nora (sinPermiso) no es nada.
const CAL = (await db.query(`select public.area_modulo('calidad') as id`)).rows[0].id;
await db.query(`insert into permisos_area (usuario_id, area_id, nivel) values ($1, $2, 'edicion')`, [U.editor, CAL]);
const MATRIZ = (await db.query(`insert into calidad_matrices (area_id, nombre, nota_minima) values ($1, 'Pauta de prueba', 80) returning id`, [CAL])).rows[0].id;
const ITEMS = (
  await db.query(
    `insert into calidad_items (matriz_id, orden, categoria, descripcion, peso, es_fatal) values
       ($1, 1, 'Saludo', 'Saluda según protocolo', 50, false),
       ($1, 2, 'Cierre', 'Cierra la venta', 50, false),
       ($1, 3, 'Errores críticos', 'Miente al cliente', 0, true)
     returning id, es_fatal`,
    [MATRIZ],
  )
).rows;
const ASESOR = (await db.query(`insert into calidad_asesores (area_id, cedula, nombre, team_leader, usuario_id) values ($1, '12345678', 'Luis Lector', 'Kelmer', $2) returning id`, [CAL, U.lector])).rows[0].id;

await prueba("sin acceso al cuadro: no ve auditorías ni estructura, pero sí la pauta (son criterios, no personas)", async () => {
  const r = await como(U.sinPermiso, (tx) =>
    filas(tx, `select (select count(*) from calidad_evaluaciones) as ev, (select count(*) from calidad_asesores) as asesores, (select count(*) from calidad_items where matriz_id = $1) as items`, [MATRIZ]),
  );
  igual(Number(r[0].ev), 0, "evaluaciones");
  igual(Number(r[0].asesores), 0, "estructura");
  igual(Number(r[0].items), 3, "pauta legible");
});

await prueba("la matriz de penalización es referencia: cualquiera la lee, solo Edición la cambia", async () => {
  const todos = await como(U.sinPermiso, (tx) => filas(tx, `select count(*) as n from calidad_penalizaciones`));
  igual(Number(todos[0].n), 12, "las 12 filas de la política son legibles por cualquier autenticado");
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`insert into calidad_penalizaciones (area_id, item_critico, gravedad, tratamiento_primera) values ($1, 'X', 'Leve', 'Feedback')`, [CAL]),
  );
  const ok = await como(U.editor, (tx) =>
    filas(tx, `insert into calidad_penalizaciones (area_id, orden, item_critico, gravedad, tratamiento_primera) values ($1, 99, 'Prueba', 'Leve', 'Feedback') returning id`, [CAL]),
  );
  igual(ok.length, 1, "con Edición sí");
  await como(U.editor, (tx) => tx.query(`delete from calidad_penalizaciones where orden = 99`));
});

let EVAL = null;
await prueba("con Edición: crea, marca la pauta, la vista calcula y publica; un crítico anula la nota", async () => {
  EVAL = (
    await como(U.editor, (tx) =>
      filas(
        tx,
        `insert into calidad_evaluaciones (area_id, matriz_id, asesor_id, asesor_nombre, analista_nombre, fecha_interaccion, creado_por)
         values ($1, $2, $3, 'Luis Lector', 'Eva', current_date, $4) returning id`,
        [CAL, MATRIZ, ASESOR, U.editor],
      ),
    )
  )[0].id;
  // Publicar sin responder todo debe fallar.
  await comoDebeFallar(U.editor, (tx) => tx.query(`update calidad_evaluaciones set estado = 'publicada' where id = $1`, [EVAL]), /Faltan ítems/);
  await como(U.editor, (tx) =>
    tx.query(
      `insert into calidad_respuestas (evaluacion_id, item_id, resultado) values ($1, $2, 'cumple'), ($1, $3, 'no_cumple'), ($1, $4, 'cumple')`,
      [EVAL, ITEMS[0].id, ITEMS[1].id, ITEMS[2].id],
    ),
  );
  let v = await como(U.editor, (tx) => filas(tx, `select nota_sin_ic, nota_final, aprobada from v_calidad_evaluaciones where id = $1`, [EVAL]));
  igual(Number(v[0].nota_sin_ic), 50, "50 % de peso cumplido");
  igual(Number(v[0].nota_final), 50, "sin crítico fallado, igual");
  igual(v[0].aprobada, false, "por debajo del umbral 80");
  // El crítico falla: nota final 0.
  await como(U.editor, (tx) => tx.query(`update calidad_respuestas set resultado = 'no_cumple' where evaluacion_id = $1 and item_id = $2`, [EVAL, ITEMS[2].id]));
  v = await como(U.editor, (tx) => filas(tx, `select nota_sin_ic, nota_final from v_calidad_evaluaciones where id = $1`, [EVAL]));
  igual(Number(v[0].nota_sin_ic), 50, "la nota sin IC no cambia");
  igual(Number(v[0].nota_final), 0, "la nota final se anula");
  const pub = await como(U.editor, (tx) => tx.query(`update calidad_evaluaciones set estado = 'publicada' where id = $1`, [EVAL]));
  igual(pub.affectedRows, 1, "publicada");
  // Publicada: ni la pauta ni el asesor cambian.
  const otro = (await db.query(`insert into calidad_asesores (area_id, nombre) values ($1, 'Otro') returning id`, [CAL])).rows[0].id;
  await comoDebeFallar(U.editor, (tx) => tx.query(`update calidad_evaluaciones set asesor_id = $2 where id = $1`, [EVAL, otro]), /no cambia de matriz ni de asesor/);
  const cel = await como(U.editor, (tx) => tx.query(`update calidad_respuestas set resultado = 'cumple' where evaluacion_id = $1`, [EVAL]));
  igual(cel.affectedRows ?? 0, 0, "las respuestas quedan como están");
});

await prueba("el asesor ve SU auditoría publicada sin tener el cuadro, y nada más", async () => {
  const mias = await como(U.lector, (tx) => filas(tx, `select id from calidad_evaluaciones`));
  igual(mias.length, 1, "exactamente la suya");
  igual(mias[0].id, EVAL);
  const otra = (
    await db.query(
      `insert into calidad_evaluaciones (area_id, matriz_id, asesor_id, asesor_nombre, analista_nombre, fecha_interaccion, estado) values ($1, $2, (select id from calidad_asesores where nombre = 'Otro'), 'Otro', 'Eva', current_date, 'publicada') returning id`,
      [CAL, MATRIZ],
    )
  ).rows[0].id;
  const ajena = await como(U.lector, (tx) => filas(tx, `select id from calidad_evaluaciones where id = $1`, [otra]));
  igual(ajena.length, 0, "la de otro asesor no");
  const borrador = (
    await db.query(
      `insert into calidad_evaluaciones (area_id, matriz_id, asesor_id, asesor_nombre, analista_nombre, fecha_interaccion) values ($1, $2, $3, 'Luis Lector', 'Eva', current_date) returning id`,
      [CAL, MATRIZ, ASESOR],
    )
  ).rows[0].id;
  const b = await como(U.lector, (tx) => filas(tx, `select id from calidad_evaluaciones where id = $1`, [borrador]));
  igual(b.length, 0, "un borrador suyo tampoco: solo lo publicado");
  await db.query(`delete from calidad_evaluaciones where id in ($1, $2)`, [otra, borrador]);
});

await prueba("la firma: solo el asesor, solo por la función, y solo con compromisos", async () => {
  const RETRO = (
    await como(U.editor, (tx) =>
      filas(tx, `insert into calidad_retroalimentaciones (evaluacion_id, area_id, realizada_por, realizada_por_nombre, estado) values ($1, $2, $3, 'Eva', 'en_proceso') returning id`, [EVAL, CAL, U.editor]),
    )
  )[0].id;
  // Nadie llega a 'firmada' por update directo, ni quien hizo la sesión.
  await comoDebeFallar(U.editor, (tx) => tx.query(`update calidad_retroalimentaciones set estado = 'firmada' where id = $1`, [RETRO]), /la firma el asesor/);
  // Sin compromisos el asesor tampoco puede firmar.
  await comoDebeFallar(U.lector, (tx) => tx.query(`select public.firmar_retroalimentacion($1, null)`, [RETRO]), /sin al menos un compromiso/);
  await como(U.editor, (tx) => tx.query(`insert into calidad_compromisos (retro_id, descripcion, fecha_limite) values ($1, 'Mejorar el saludo', current_date + 15)`, [RETRO]));
  // Otro usuario no puede firmar por él.
  await comoDebeFallar(U.sinPermiso, (tx) => tx.query(`select public.firmar_retroalimentacion($1, null)`, [RETRO]), /Solo el asesor evaluado/);
  await como(U.lector, (tx) => tx.query(`select public.firmar_retroalimentacion($1, 'De acuerdo')`, [RETRO]));
  const r = await como(U.lector, (tx) => filas(tx, `select estado, comentarios_asesor, firmada_en is not null as firmada from calidad_retroalimentaciones where id = $1`, [RETRO]));
  igual(r[0].estado, "firmada");
  igual(r[0].comentarios_asesor, "De acuerdo");
  igual(r[0].firmada, true);
  // Firmada: el editor ya no la edita; queda rastro en la auditoría.
  const u = await como(U.editor, (tx) => tx.query(`update calidad_retroalimentaciones set fortalezas = 'tarde' where id = $1`, [RETRO]));
  igual(u.affectedRows ?? 0, 0, "firmada es firmada");
  const acc = await db.query(`select count(*) as n from accesos where doc_titulo like 'Firma de retroalimentación%' and usuario_id = $1`, [U.lector]);
  igual(Number(acc.rows[0].n), 1, "la firma quedó en accesos");
});

await prueba("las alertas de calidad llegan al asesor (su evaluación) y a quien tiene el cuadro (compromisos por vencer)", async () => {
  const a = await como(U.lector, (tx) => filas(tx, `select public.generar_alertas_calidad() as n`));
  igual(Number(a[0].n) >= 1, true, "el asesor recibe la de su evaluación publicada");
  const titulos = await como(U.lector, (tx) => filas(tx, `select titulo from notificaciones where tipo = 'calidad' order by titulo`));
  igual(titulos.some((t) => t.titulo.includes("Nueva evaluación de calidad")), true, "aviso de evaluación");
  // Un compromiso que vence pasado mañana alerta al gestor; uno a 10 días no.
  await db.query(`update calidad_compromisos set fecha_limite = current_date + 2`);
  await como(U.editor, (tx) => tx.query(`select public.generar_alertas_calidad()`));
  const g = await como(U.editor, (tx) => filas(tx, `select titulo from notificaciones where tipo = 'calidad'`));
  igual(g.some((t) => t.titulo.includes("Compromiso por vencer")), true, "aviso de vencimiento al gestor");
  const nadie = await como(U.sinPermiso, (tx) => filas(tx, `select public.generar_alertas_calidad() as n`));
  igual(Number(nadie[0].n), 0, "quien no es nada, nada recibe");
});

console.log("\nPDA (019)");
grupo("PDA (019)");

const PDA = (await db.query(`select public.area_modulo('pda') as id`)).rows[0].id;
await db.query(`insert into permisos_area (usuario_id, area_id, nivel) values ($1, $2, 'lectura')`, [U.lector, PDA]);
await db.query(`insert into permisos_area (usuario_id, area_id, nivel) values ($1, $2, 'edicion')`, [U.editor, PDA]);
let PLAN_PDA = null;
let OBJ_PDA = {};

await prueba("sin permiso no hay PDA; con Vista se consulta pero no se crea", async () => {
  await db.query(
    `insert into pda_planes (id, area_id, periodo, cargo, responsable, titulo) values ('30000000-0000-4000-8000-000000000001', $1, '2026-09-01', 'Soporte TI', 'Mateo', 'PDA septiembre')`,
    [PDA],
  );
  const nada = await como(U.sinPermiso, (tx) => filas(tx, `select count(*) as n from v_pda_planes`));
  igual(Number(nada[0].n), 0, "sin permiso");
  const ve = await como(U.lector, (tx) => filas(tx, `select titulo from v_pda_planes`));
  igual(ve.length, 1, "con Vista lo ve");
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`insert into pda_planes (area_id, periodo, cargo, responsable, titulo, creado_por) values ($1, '2026-10-01', 'Líder de TI', 'X', 'X', $2)`, [PDA, U.lector]),
  );
});

await prueba("con Edición se crea el PDA, solo en su cuadro y uno por mes y cargo", async () => {
  const r = await como(U.editor, (tx) =>
    filas(
      tx,
      `insert into pda_planes (area_id, periodo, cargo, responsable, titulo, creado_por) values ($1, '2026-10-01', 'Líder de TI', 'Juan', 'PDA octubre', $2) returning id`,
      [PDA, U.editor],
    ),
  );
  PLAN_PDA = r[0].id;
  await comoDebeFallar(U.editor, (tx) =>
    tx.query(`insert into pda_planes (area_id, periodo, cargo, responsable, titulo, creado_por) values ($1, '2026-11-01', 'Líder de TI', 'Juan', 'Colado', $2)`, [AREA.x, U.editor]),
  );
  await comoDebeFallar(
    U.editor,
    (tx) => tx.query(`insert into pda_planes (area_id, periodo, cargo, responsable, titulo, creado_por) values ($1, '2026-10-01', 'Líder de TI', 'Juan', 'Repetido', $2)`, [PDA, U.editor]),
    /duplicate|unique/i,
  );
  const otroCargo = await como(U.editor, (tx) =>
    filas(tx, `insert into pda_planes (area_id, periodo, cargo, responsable, titulo, creado_por) values ($1, '2026-10-01', 'Soporte TI', 'Mateo', 'PDA octubre soporte', $2) returning id`, [PDA, U.editor]),
  );
  igual(otroCargo.length, 1, "el mismo mes para otro cargo sí");
});

await prueba("objetivos, lista de chequeo y cumplimiento: promedio de la columna M, actividades hechas sobre el total", async () => {
  const ind = await como(U.editor, (tx) =>
    filas(
      tx,
      `insert into pda_objetivos (plan_id, area_id, indicador, proyeccion, creado_por) values
         ($1, $2, 'Tickets en producción', 100, $3),
         ($1, $2, 'Reporte automático', 100, $3),
         ($1, $2, 'Página web', 80, $3)
       returning id, indicador`,
      [PLAN_PDA, AREA.x, U.editor],
    ),
  );
  OBJ_PDA = Object.fromEntries(ind.map((x) => [x.indicador, x.id]));
  const area = await db.query(`select distinct area_id from pda_objetivos where plan_id = $1`, [PLAN_PDA]);
  igual(area.rows.length, 1, "una sola área");
  igual(area.rows[0].area_id, PDA, "el área se corrige a la del PDA aunque se envíe otra");

  await como(U.editor, (tx) =>
    tx.query(
      `insert into pda_tareas (objetivo_id, area_id, descripcion, fecha_limite, completada, creado_por) values
         ($1, $3, 'Desplegar', '2026-10-05', true, $4),
         ($1, $3, 'Capacitar', '2026-10-20', false, $4),
         ($2, $3, 'Registrar tarea programada', '2026-10-02', true, $4),
         ($2, $3, 'Probar desatendido', '2026-10-05', true, $4)`,
      [OBJ_PDA["Tickets en producción"], OBJ_PDA["Reporte automático"], PDA, U.editor],
    ),
  );
  const marcada = await db.query(`select completada_por, completada_en from pda_tareas where descripcion = 'Desplegar'`);
  igual(marcada.rows[0].completada_por, U.editor, "quién marcó lo pone la base");
  igual(marcada.rows[0].completada_en !== null, true, "y cuándo");

  await como(U.editor, (tx) => tx.query(`update pda_objetivos set cumplimiento = 100, datos_cierre = '42 tickets' where id = $1`, [OBJ_PDA["Tickets en producción"]]));
  await como(U.editor, (tx) => tx.query(`update pda_objetivos set cumplimiento = 25 where id = $1`, [OBJ_PDA["Reporte automático"]]));

  const v = await como(U.lector, (tx) => filas(tx, `select indicador, n_tareas, n_tareas_hechas, avance_tareas, cumplimiento from v_pda_objetivos where plan_id = $1 order by indicador`, [PLAN_PDA]));
  const por = Object.fromEntries(v.map((x) => [x.indicador, x]));
  igual(por["Tickets en producción"].n_tareas, 2, "actividades");
  igual(Number(por["Tickets en producción"].avance_tareas), 50, "1 de 2 hechas");
  igual(Number(por["Reporte automático"].avance_tareas), 100, "2 de 2 hechas");
  igual(por["Página web"].avance_tareas, null, "sin actividades no hay avance");
  const p = await como(U.lector, (tx) => filas(tx, `select n_objetivos, n_objetivos_cerrados, n_objetivos_cumplidos, n_tareas, n_tareas_hechas, proyeccion, cumplimiento, avance_tareas from v_pda_planes where id = $1`, [PLAN_PDA]));
  igual(p[0].n_objetivos, 3, "objetivos");
  igual(p[0].n_objetivos_cerrados, 2, "con cierre");
  igual(p[0].n_objetivos_cumplidos, 1, "al 100");
  igual(Number(p[0].cumplimiento), 62.5, "(100 + 25) / 2: solo los cerrados");
  igual(Number(p[0].proyeccion), 93.3, "(100 + 100 + 80) / 3");
  igual(Number(p[0].avance_tareas), 75, "3 de 4 actividades");
});

await prueba("con Vista no se marca ni se sube; la evidencia debe colgar de su objetivo", async () => {
  const t = (await db.query(`select id from pda_tareas where descripcion = 'Capacitar'`)).rows[0].id;
  // Un update que RLS no deja ver no falla: no toca ninguna fila.
  const sinEfecto = await como(U.lector, (tx) => tx.query(`update pda_tareas set completada = true where id = $1`, [t]));
  igual(sinEfecto.affectedRows ?? 0, 0, "con Vista el update no toca ninguna fila");
  const sigue = await db.query(`select completada from pda_tareas where id = $1`, [t]);
  igual(sigue.rows[0].completada, false, "sigue sin marcar");
  const o = OBJ_PDA["Página web"];
  await comoDebeFallar(U.lector, (tx) =>
    tx.query(`insert into pda_evidencias (objetivo_id, area_id, storage_path, nombre_archivo, mime, tamano_bytes, subido_por) values ($1, $2, $3 || '/' || $1::uuid::text || '/a.png', 'a.png', 'image/png', 10, $4)`, [o, PDA, PLAN_PDA, U.lector]),
  );
  await comoDebeFallar(
    U.editor,
    (tx) => tx.query(`insert into pda_evidencias (objetivo_id, area_id, storage_path, nombre_archivo, mime, tamano_bytes, subido_por) values ($1, $2, 'otra/carpeta/a.png', 'a.png', 'image/png', 10, $3)`, [o, PDA, U.editor]),
    /carpeta de su objetivo/i,
  );
  const ok = await como(U.editor, (tx) =>
    filas(tx, `insert into pda_evidencias (objetivo_id, area_id, storage_path, nombre_archivo, mime, tamano_bytes, subido_por) values ($1, $2, $3 || '/' || $1::uuid::text || '/a.png', 'a.png', 'image/png', 10, $4) returning id`, [o, PDA, PLAN_PDA, U.editor]),
  );
  igual(ok.length, 1, "con Edición y en su carpeta, entra");
  const vista = await como(U.lector, (tx) => filas(tx, `select n_evidencias from v_pda_objetivos where id = $1`, [o]));
  igual(vista[0].n_evidencias, 1, "y se cuenta");
});

await prueba("el bucket pda: quien ve el cuadro lee, quien edita sube y retira, quien no tiene nada no toca", async () => {
  await db.query(`insert into storage.buckets (id, name, public) values ('pda', 'pda', false) on conflict (id) do nothing`);
  const ruta = `${PLAN_PDA}/${OBJ_PDA["Página web"]}/b.png`;
  await comoDebeFallar(U.lector, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('pda', $1)`, [ruta]));
  await comoDebeFallar(U.sinPermiso, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('pda', $1)`, [ruta]));
  await como(U.editor, (tx) => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('pda', $1, $2)`, [ruta, U.editor]));
  const lee = await como(U.lector, (tx) => filas(tx, `select name from storage.objects where bucket_id = 'pda'`));
  igual(lee.length, 1, "con Vista lo lee");
  const nadie = await como(U.sinPermiso, (tx) => filas(tx, `select name from storage.objects where bucket_id = 'pda'`));
  igual(nadie.length, 0, "sin permiso no lo ve");
  const borra = await como(U.editor, (tx) => tx.query(`delete from storage.objects where bucket_id = 'pda' and name = $1`, [ruta]));
  igual(borra.affectedRows, 1, "con Edición lo retira");
});

await prueba("un PDA cerrado queda congelado hasta reabrirlo", async () => {
  await como(U.editor, (tx) => tx.query(`update pda_planes set estado = 'cerrado' where id = $1`, [PLAN_PDA]));
  const c = await db.query(`select cerrado_en from pda_planes where id = $1`, [PLAN_PDA]);
  igual(c.rows[0].cerrado_en !== null, true, "queda la fecha de cierre");
  const t = (await db.query(`select id from pda_tareas where descripcion = 'Capacitar'`)).rows[0].id;
  await comoDebeFallar(U.editor, (tx) => tx.query(`update pda_tareas set completada = true where id = $1`, [t]), /cerrado/i);
  await comoDebeFallar(U.editor, (tx) => tx.query(`update pda_objetivos set cumplimiento = 50 where id = $1`, [OBJ_PDA["Página web"]]), /cerrado/i);
  await como(U.editor, (tx) => tx.query(`update pda_planes set estado = 'abierto' where id = $1`, [PLAN_PDA]));
  const r = await db.query(`select cerrado_en from pda_planes where id = $1`, [PLAN_PDA]);
  igual(r.rows[0].cerrado_en, null, "reabierto: sin fecha de cierre");
  const ok = await como(U.editor, (tx) => tx.query(`update pda_tareas set completada = true where id = $1`, [t]));
  igual(ok.affectedRows, 1, "reabierto se puede marcar");
});

await prueba("borrar un PDA u objetivo exige Total o admin; con Edición se quita una actividad o evidencia", async () => {
  const e = await como(U.editor, (tx) => tx.query(`delete from pda_evidencias where nombre_archivo = 'a.png'`));
  igual(e.affectedRows, 1, "Edición retira una evidencia");
  const t = await como(U.editor, (tx) => tx.query(`delete from pda_tareas where descripcion = 'Capacitar'`));
  igual(t.affectedRows, 1, "Edición quita una actividad");
  const o = await como(U.editor, (tx) => tx.query(`delete from pda_objetivos where id = $1`, [OBJ_PDA["Página web"]]));
  igual(o.affectedRows ?? 0, 0, "Edición no borra un objetivo");
  const d = await como(U.editor, (tx) => tx.query(`delete from pda_planes where id = $1`, [PLAN_PDA]));
  igual(d.affectedRows ?? 0, 0, "Edición no borra el PDA");
  await como(U.editor, (tx) => tx.query(`update pda_planes set estado = 'cerrado' where id = $1`, [PLAN_PDA]));
  const a = await como(U.admin, (tx) => tx.query(`delete from pda_planes where id = $1`, [PLAN_PDA]));
  igual(a.affectedRows, 1, "admin sí, incluso cerrado, y en cascada sus objetivos");
  const resto = await db.query(`select count(*)::int as n from pda_objetivos where plan_id = $1`, [PLAN_PDA]);
  igual(resto.rows[0].n, 0, "sin objetivos huérfanos");
  const tareas = await db.query(`select count(*)::int as n from pda_tareas`);
  igual(tareas.rows[0].n, 0, "ni actividades");
});

console.log("\nRetroalimentación (022)");
grupo("Retroalimentación (022)");

const FB = (await db.query(`select public.area_modulo('feedback') as id`)).rows[0].id;
await db.query(`insert into permisos_area (usuario_id, area_id, nivel) values ($1, $2, 'edicion')`, [U.editor, FB]);
// Un colaborador con cuenta (el lector) para probar "lo mío" y la conformidad.
const CAT_NORMAL = (await db.query(`select id from feedback_catalogo where not solo_direccion order by orden limit 1`)).rows[0].id;
const CAT_LIDER = (await db.query(`select id from feedback_catalogo where solo_direccion order by orden limit 1`)).rows[0].id;
let FB_ID = null;

await prueba("el catálogo se sembró y es legible por cualquiera; de liderazgo hay filas", async () => {
  const n = await como(U.sinPermiso, (tx) => filas(tx, `select count(*) as n from feedback_catalogo`));
  igual(Number(n[0].n) >= 30, true, "catálogo legible (" + n[0].n + " filas)");
  const dir = (await db.query(`select count(*)::int as n from feedback_catalogo where solo_direccion`)).rows[0].n;
  igual(dir >= 8, true, "liderazgo sembrado");
});

await prueba("con Edición se registra feedback; sin permiso no", async () => {
  await comoDebeFallar(U.sinPermiso, (tx) =>
    tx.query(`insert into feedback (catalogo_id, colaborador_nombre, fecha, gravedad, severidad, descripcion, creado_por) values ($1, 'Luis', current_date, 'leve', 'notificacion', 'x', $2)`, [CAT_NORMAL, U.sinPermiso]),
  );
  const r = await como(U.editor, (tx) =>
    filas(tx, `insert into feedback (catalogo_id, colaborador_nombre, colaborador_usuario_id, fecha, gravedad, severidad, descripcion, plan_accion, fecha_seguimiento, creado_por) values ($1, 'Luis Lector', $2, current_date, 'moderado', 'plan_accion', 'Llegó tarde 3 veces', 'Compromiso de puntualidad', current_date - 1, $3) returning id, area_id`, [CAT_NORMAL, U.lector, U.editor]),
  );
  FB_ID = r[0].id;
  igual(r[0].area_id, FB, "el área se impone a la del cuadro");
});

await prueba("el feedback de liderazgo solo lo registra un administrador", async () => {
  await comoDebeFallar(
    U.editor,
    (tx) => tx.query(`insert into feedback (catalogo_id, colaborador_nombre, fecha, gravedad, severidad, descripcion, creado_por) values ($1, 'Un TL', current_date, 'grave', 'disciplinario', 'Desviación de KPIs del grupo', $2)`, [CAT_LIDER, U.editor]),
    /liderazgo/i,
  );
  const ok = await como(U.admin, (tx) =>
    filas(tx, `insert into feedback (catalogo_id, colaborador_nombre, fecha, gravedad, severidad, descripcion, creado_por) values ($1, 'Un TL', current_date, 'grave', 'disciplinario', 'Desviación de KPIs del grupo', $2) returning id`, [CAT_LIDER, U.admin]),
  );
  igual(ok.length, 1, "el admin sí");
});

await prueba("el colaborador ve lo suyo sin tener el cuadro, y nada ajeno", async () => {
  const mios = await como(U.lector, (tx) => filas(tx, `select count(*) as n from v_feedback`));
  igual(Number(mios[0].n), 1, "solo el feedback dirigido a él (incluido el de liderazgo ajeno: no)");
  const detalle = await como(U.lector, (tx) => filas(tx, `select colaborador_nombre from feedback where id = $1`, [FB_ID]));
  igual(detalle.length, 1, "puede abrir el suyo");
});

await prueba("la vista marca seguimiento vencido y sin conformidad", async () => {
  const v = await como(U.editor, (tx) => filas(tx, `select seguimiento_vencido, sin_conformidad from v_feedback where id = $1`, [FB_ID]));
  igual(v[0].seguimiento_vencido, true, "la fecha de seguimiento quedó en el pasado");
  igual(v[0].sin_conformidad, true, "aún sin conformidad");
});

await prueba("la conformidad: la responde el colaborador (o el cuadro), no un tercero; sella la fecha", async () => {
  await comoDebeFallar(U.sinPermiso, (tx) => tx.query(`select public.responder_feedback($1, 'aceptado', null)`, [FB_ID]), /No puedes responder/);
  await como(U.lector, (tx) => tx.query(`select public.responder_feedback($1, 'observaciones', 'De acuerdo, mejoraré')`, [FB_ID]));
  const v = await como(U.editor, (tx) => filas(tx, `select conformidad, conformidad_comentario, conformidad_en, sin_conformidad from v_feedback where id = $1`, [FB_ID]));
  igual(v[0].conformidad, "observaciones", "quedó registrada");
  igual(v[0].conformidad_en !== null, true, "con fecha y hora");
  igual(v[0].sin_conformidad, false, "ya no está pendiente");
});

await prueba("borrar un feedback exige Total o admin", async () => {
  const d = await como(U.editor, (tx) => tx.query(`delete from feedback where id = $1`, [FB_ID]));
  igual(d.affectedRows ?? 0, 0, "Edición no borra");
  const a = await como(U.admin, (tx) => tx.query(`delete from feedback where id = $1`, [FB_ID]));
  igual(a.affectedRows, 1, "admin sí");
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
