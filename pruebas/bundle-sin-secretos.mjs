/**
 * Comprobación 7 de seguridad: la service_role key no aparece en ningún
 * bundle del cliente. Recorre .next/static (lo que se envía al navegador)
 * buscando:
 *   - el valor real de SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY si
 *     está en .env.local,
 *   - cualquier JWT cuyo payload tenga "role":"service_role",
 *   - claves nuevas con prefijo sb_secret_,
 *   - referencias al nombre de la variable (indicarían código cliente que
 *     intenta leerla).
 * Ejecutar tras `npm run build`:  npm run prueba:bundle
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const carpeta = join(raiz, ".next", "static");

if (!existsSync(carpeta)) {
  console.error("No existe .next/static. Ejecuta primero `npm run build`.");
  process.exit(2);
}

function leerEnv(nombre) {
  const ruta = join(raiz, ".env.local");
  if (!existsSync(ruta)) return null;
  const linea = readFileSync(ruta, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${nombre}=`));
  if (!linea) return null;
  const valor = linea.slice(linea.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  return valor || null;
}

const secretos = [leerEnv("SUPABASE_SERVICE_ROLE_KEY"), leerEnv("SUPABASE_SECRET_KEY")].filter(Boolean);

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) yield* archivos(ruta);
    else yield ruta;
  }
}

function esJwtServiceRole(token) {
  const partes = token.split(".");
  if (partes.length < 2) return false;
  try {
    const payload = Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return /"role"\s*:\s*"service_role"/.test(payload);
  } catch {
    return false;
  }
}

const hallazgos = [];
let revisados = 0;

for (const ruta of archivos(carpeta)) {
  if (!/\.(js|mjs|css|json|txt|map)$/.test(ruta)) continue;
  revisados++;
  const contenido = readFileSync(ruta, "utf8");
  const rel = ruta.slice(raiz.length + 1);

  for (const s of secretos) {
    if (contenido.includes(s)) hallazgos.push(`${rel}: contiene el valor de la clave service_role`);
  }
  // Una clave real es "sb_secret_" seguido de decenas de caracteres; la
  // cadena suelta "sb_secret_" aparece en supabase-js (aviso interno de la
  // librería) y no es un hallazgo.
  if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(contenido)) hallazgos.push(`${rel}: contiene una clave sb_secret_`);
  if (/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/.test(contenido)) {
    hallazgos.push(`${rel}: referencia el nombre de la variable de la clave secreta`);
  }
  for (const m of contenido.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    if (esJwtServiceRole(m[0])) hallazgos.push(`${rel}: contiene un JWT con role=service_role`);
  }
}

console.log(`Archivos revisados en .next/static: ${revisados}`);
console.log(
  secretos.length
    ? "Se comparó también contra el valor real de la clave en .env.local."
    : "No hay .env.local con la clave: se buscaron patrones (JWT service_role, sb_secret_, nombre de variable).",
);

if (hallazgos.length) {
  console.error("\n✘ HALLAZGOS:");
  for (const h of hallazgos) console.error(" - " + h);
  process.exit(1);
}
console.log("✔ Ningún bundle del cliente contiene la clave service_role ni referencias a ella.");
