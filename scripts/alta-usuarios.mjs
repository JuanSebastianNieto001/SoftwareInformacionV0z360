/**
 * Alta de cuentas en bloque desde un CSV. Es el «seeder» de personas: el
 * mismo camino por el que entraron los asesores, Calidad, Soporte TI y las
 * cuentas administrativas, ahora en un solo comando reutilizable.
 *
 * Uso:
 *   node --env-file=.env.local scripts/alta-usuarios.mjs personas.csv --ensayo
 *   node --env-file=.env.local scripts/alta-usuarios.mjs personas.csv
 *   node --env-file=.env.local scripts/alta-usuarios.mjs asesores.csv --areas=divulgaciones,apoyos-comerciales --nivel=lectura
 *
 * El CSV (separado por comas o por punto y coma, con encabezado) tiene las
 * columnas `correo`, `nombre` y, opcional, `cargo`. En `correo` puede ir un
 * número de Poliedro suelto: se convierte en <número>@poliedro.voz360.co,
 * igual que hace el inicio de sesión. Ejemplo en scripts/ejemplos/.
 *
 * Reglas:
 *   - Es repetible: si la cuenta ya existe no se toca (solo se reponen los
 *     permisos de --areas, que son idempotentes).
 *   - Cada cuenta nace activa, con rol lector y con la marca
 *     `debe_cambiar_contrasena`: el sistema obliga a cambiarla al entrar.
 *   - Contraseña inicial: una aleatoria por persona, salvo que se defina
 *     CLAVE_INICIAL en el entorno (los asesores se crearon así, temporal y
 *     compartida, por decisión de TI). Se imprimen al final para
 *     entregarlas por otro canal; no se guardan en ningún sitio.
 *   - Los listados de personal NO se versionan (.gitignore): tienen
 *     cédulas y números de Poliedro.
 *
 * Usa la API de administración de Supabase con la clave de servicio, que
 * se salta RLS. Por eso es un script de consola y no una pantalla.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const DOMINIO_POLIEDRO = "poliedro.voz360.co";
const NIVELES = ["lectura", "descarga", "edicion", "total"];

// ---------- argumentos y entorno ----------
const argumentos = process.argv.slice(2);
const archivo = argumentos.find((a) => !a.startsWith("--"));
const opcion = (nombre) => argumentos.find((a) => a.startsWith(`--${nombre}=`))?.split("=")[1];
const ensayo = argumentos.includes("--ensayo");
const areasPedidas = (opcion("areas") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const nivel = opcion("nivel") ?? "lectura";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLAVE = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!archivo) {
  console.error("Uso: node --env-file=.env.local scripts/alta-usuarios.mjs <personas.csv> [--ensayo] [--areas=slug,slug] [--nivel=lectura]");
  process.exit(1);
}
if (!URL_SB || !CLAVE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno.");
  process.exit(1);
}
if (!NIVELES.includes(nivel)) {
  console.error(`--nivel debe ser uno de: ${NIVELES.join(", ")}`);
  process.exit(1);
}

// ---------- API de Supabase ----------
const cabeceras = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" };

async function api(ruta, opciones = {}) {
  const r = await fetch(URL_SB + ruta, { ...opciones, headers: { ...cabeceras, ...(opciones.headers ?? {}) } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${ruta} → ${r.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

// Sin letras que se confunden al dictarlas (I/l/1, O/0).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const claveAleatoria = () => Array.from(randomBytes(10), (b) => ALFABETO[b % ALFABETO.length]).join("");

// ---------- 1. Leer el CSV ----------
const lineas = readFileSync(archivo, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
const separador = lineas[0].includes(";") ? ";" : ",";
const celdas = (linea) => linea.split(separador).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
const encabezado = celdas(lineas[0]).map((c) => c.toLowerCase());
const col = (nombre) => encabezado.indexOf(nombre);
if (col("correo") < 0 || col("nombre") < 0) {
  console.error("El CSV necesita las columnas «correo» y «nombre» (y opcional «cargo»).");
  process.exit(1);
}

const personas = lineas.slice(1).map((linea) => {
  const c = celdas(linea);
  const identificador = c[col("correo")] ?? "";
  const correo = (/^\d+$/.test(identificador) ? `${identificador}@${DOMINIO_POLIEDRO}` : identificador).toLowerCase();
  return { correo, nombre: c[col("nombre")] ?? "", cargo: col("cargo") >= 0 ? c[col("cargo")] || null : null };
});
const invalidas = personas.filter((p) => !p.correo.includes("@") || !p.nombre);
if (invalidas.length) {
  console.error("Filas sin correo o sin nombre:", invalidas);
  process.exit(1);
}

// ---------- 2. Qué existe ya ----------
const existentes = new Map();
for (let pagina = 1; ; pagina++) {
  const r = await api(`/auth/v1/admin/users?page=${pagina}&per_page=200`);
  for (const u of r.users ?? []) existentes.set((u.email ?? "").toLowerCase(), u.id);
  if (!r.users || r.users.length < 200) break;
}

let idsAreas = [];
if (areasPedidas.length) {
  const areas = await api(`/rest/v1/areas?select=id,slug`);
  const porSlug = new Map(areas.map((a) => [a.slug, a.id]));
  const faltan = areasPedidas.filter((s) => !porSlug.has(s));
  if (faltan.length) throw new Error(`No existen las áreas: ${faltan.join(", ")}`);
  idsAreas = areasPedidas.map((s) => porSlug.get(s));
}

const nuevas = personas.filter((p) => !existentes.has(p.correo));
console.log(`En el archivo: ${personas.length} · ya existen: ${personas.length - nuevas.length} · por crear: ${nuevas.length}`);
if (areasPedidas.length) console.log(`Permiso «${nivel}» en: ${areasPedidas.join(", ")}`);

if (ensayo) {
  for (const p of nuevas) console.log(`  crearía: ${p.correo} · ${p.nombre}${p.cargo ? ` · ${p.cargo}` : ""}`);
  console.log("Ensayo: no se escribió nada.");
  process.exit(0);
}

// ---------- 3. Crear y conceder ----------
const resumen = [];
for (const p of personas) {
  let id = existentes.get(p.correo);
  let clave = "";
  if (!id) {
    clave = process.env.CLAVE_INICIAL || claveAleatoria();
    const u = await api("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: p.correo,
        password: clave,
        email_confirm: true, // las cuentas de Poliedro no tienen buzón al que confirmar
        user_metadata: { nombre: p.nombre, rol: "lector", debe_cambiar_contrasena: true },
      }),
    });
    id = u.id;
    await api(`/rest/v1/perfiles?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ nombre: p.nombre, cargo: p.cargo, rol: "lector", activo: true }),
    });
  }
  if (idsAreas.length) {
    await api(`/rest/v1/permisos_area?on_conflict=usuario_id,area_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(idsAreas.map((area_id) => ({ usuario_id: id, area_id, nivel }))),
    });
  }
  resumen.push({ correo: p.correo, nombre: p.nombre, estado: clave ? "creada" : "ya existía", clave });
}
console.table(resumen);
console.log("Entrega las contraseñas por un canal distinto al de esta consola; se piden cambiar al primer ingreso.");
