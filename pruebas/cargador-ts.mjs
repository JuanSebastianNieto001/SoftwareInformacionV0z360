/**
 * Cargador para correr las pruebas de lógica con Node a secas, sin
 * compilar ni instalar nada.
 *
 * Node 24 ya entiende TypeScript (borra los tipos al cargar), pero no sabe
 * dos cosas que el código de `lib/` da por hechas porque las resuelve
 * Next.js:
 *
 *   - el alias `@/` (la raíz del proyecto, ver `paths` en tsconfig.json);
 *   - importar sin extensión (`./validaciones`, `@/lib/calidad`), que puede
 *     ser `validaciones.ts` o una carpeta con `index.ts`.
 *
 * Este gancho de resolución añade solo eso. Se registra con
 * `node --import ./pruebas/cargador-ts.mjs` (ver `npm run prueba:logica`).
 * Lo que vive en node_modules se resuelve como siempre.
 */
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Orden de búsqueda, el mismo que aplica el empaquetador de Next. */
const CANDIDATOS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function archivoReal(base) {
  for (const sufijo of CANDIDATOS) {
    const ruta = base + sufijo;
    if (existsSync(ruta) && statSync(ruta).isFile()) return ruta;
  }
  return null;
}

registerHooks({
  resolve(especificador, contexto, siguiente) {
    let base = null;
    if (especificador.startsWith("@/")) {
      base = path.join(RAIZ, especificador.slice(2));
    } else if (
      (especificador.startsWith("./") || especificador.startsWith("../")) &&
      contexto.parentURL?.startsWith("file:") &&
      !contexto.parentURL.includes("/node_modules/")
    ) {
      base = path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador);
    }
    const archivo = base && archivoReal(base);
    if (archivo) return { url: pathToFileURL(archivo).href, shortCircuit: true };
    return siguiente(especificador, contexto);
  },
});
