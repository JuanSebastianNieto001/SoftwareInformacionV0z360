/**
 * Aplica un archivo .sql (una migración o un script de mantenimiento) a la
 * base de Supabase. Es el equivalente a `php artisan migrate`, pero de uno
 * en uno y a mano, que es como se ha llevado el esquema desde el principio:
 * las migraciones de supabase/migrations se aplican en orden y una sola vez.
 *
 * Uso:
 *   node --env-file=.env.local scripts/aplicar-migracion.mjs supabase/migrations/035_algo.sql
 *   node --env-file=.env.local scripts/aplicar-migracion.mjs <archivo.sql> --sin-transaccion
 *
 * Por defecto todo el archivo va en una transacción: o entra entero o no
 * entra nada. `--sin-transaccion` es solo para las migraciones que crean un
 * valor de enum y no pueden ir dentro de una (006 y 008; ver README).
 *
 * La conexión sale de DATABASE_URL, que no se versiona. Tiene que apuntar
 * al pooler IPv4 (aws-0-us-east-2.pooler.supabase.com:5432): el host
 * directo de Supabase es solo IPv6 y no responde desde cualquier red.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const argumentos = process.argv.slice(2);
const archivo = argumentos.find((a) => !a.startsWith("--"));
const sinTransaccion = argumentos.includes("--sin-transaccion");

if (!archivo || !archivo.endsWith(".sql")) {
  console.error("Uso: node --env-file=.env.local scripts/aplicar-migracion.mjs <archivo.sql> [--sin-transaccion]");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (cadena del pooler de Supabase). Ver .env.example.");
  process.exit(1);
}

const sql = readFileSync(archivo, "utf8");
const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

// A dónde se va a escribir, sin enseñar la contraseña.
const destino = new URL(url);
console.log(`Base: ${destino.hostname} · usuario ${destino.username}`);
console.log(`Archivo: ${path.basename(archivo)} ${sinTransaccion ? "(sin transacción)" : "(en una transacción)"}`);

await cliente.connect();
try {
  if (sinTransaccion) {
    await cliente.query(sql);
  } else {
    await cliente.query("begin");
    try {
      await cliente.query(sql);
      await cliente.query("commit");
    } catch (error) {
      await cliente.query("rollback");
      throw error;
    }
  }
  console.log("Aplicada.");
} catch (error) {
  console.error(`ERROR${sinTransaccion ? "" : ", revertida"}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
