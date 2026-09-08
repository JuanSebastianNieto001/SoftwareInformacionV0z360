// Edge Function "purgar" — borra del almacenamiento los documentos cuya
// vigencia terminó hace más de DIAS_GRACIA días y marca las filas como
// purgadas.
//
// Flujo: cron -> esta función -> docs_por_purgar(7) -> storage.remove()
//        -> marcar_purgados(ids que ya no existen en Storage)
//
// Idempotente: si se ejecuta dos veces el mismo día, la segunda no
// encuentra candidatos (ya están marcados) y responde con ceros. Si una
// ejecución anterior borró el archivo pero no alcanzó a marcar la fila,
// la siguiente detecta que el objeto ya no existe y la marca.
//
// Variables de entorno (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las
// inyecta Supabase automáticamente; PURGA_SECRET es opcional y se define
// con `supabase secrets set PURGA_SECRET=...`).

import { createClient } from "npm:@supabase/supabase-js@2";

const DIAS_GRACIA = 7;
const BUCKET = "documentos";

type Candidato = { id: string; storage_path: string };

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function autorizado(req: Request, serviceKey: string): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token && token === serviceKey) return true;

  const secreto = Deno.env.get("PURGA_SECRET");
  if (secreto && req.headers.get("x-purga-secret") === secreto) return true;

  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Método no permitido" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  if (!autorizado(req, serviceKey)) {
    return json({ error: "No autorizado" }, 401);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const inicio = Date.now();

  // 1. Candidatos (función SECURITY DEFINER; ejecución revocada a authenticated/anon).
  const { data: candidatos, error: errorCandidatos } = await supabase.rpc(
    "docs_por_purgar",
    { dias_gracia: DIAS_GRACIA },
  );
  if (errorCandidatos) {
    console.error("[purgar] docs_por_purgar:", errorCandidatos.message);
    return json({ error: errorCandidatos.message }, 500);
  }

  const docs = (candidatos ?? []) as Candidato[];
  if (docs.length === 0) {
    console.log("[purgar] Sin documentos por purgar.");
    return json({ candidatos: 0, borrados: 0, marcados: 0, pendientes: 0, ms: Date.now() - inicio });
  }

  const rutas = docs.map((d) => d.storage_path);

  // 2. Borrar binarios. remove() no falla por rutas inexistentes: las omite.
  const { data: removidos, error: errorRemove } = await supabase.storage
    .from(BUCKET)
    .remove(rutas);
  if (errorRemove) {
    console.error("[purgar] storage.remove:", errorRemove.message);
  }

  // 3. ¿Cuáles siguen existiendo? Solo marcamos los que ya no están.
  const { data: restantes, error: errorRestantes } = await supabase
    .schema("storage")
    .from("objects")
    .select("name")
    .eq("bucket_id", BUCKET)
    .in("name", rutas);

  if (errorRestantes) {
    console.error("[purgar] No se pudo verificar storage.objects:", errorRestantes.message);
    return json({ error: errorRestantes.message, borrados: removidos?.length ?? 0 }, 500);
  }

  const aunExisten = new Set((restantes ?? []).map((r: { name: string }) => r.name));
  const idsListos = docs.filter((d) => !aunExisten.has(d.storage_path)).map((d) => d.id);

  // 4. Marcar filas (storage_path pasa a 'purgado/<id>', tamano_bytes a 0).
  let marcados = 0;
  if (idsListos.length > 0) {
    const { data, error: errorMarcar } = await supabase.rpc("marcar_purgados", { ids: idsListos });
    if (errorMarcar) {
      console.error("[purgar] marcar_purgados:", errorMarcar.message);
      return json({ error: errorMarcar.message, borrados: removidos?.length ?? 0 }, 500);
    }
    marcados = typeof data === "number" ? data : Number(data ?? 0);
  }

  const resultado = {
    candidatos: docs.length,
    borrados: removidos?.length ?? 0,
    marcados,
    pendientes: docs.length - idsListos.length,
    ms: Date.now() - inicio,
  };
  console.log("[purgar]", JSON.stringify(resultado));
  return json(resultado);
});
