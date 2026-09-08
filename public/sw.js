/* Service worker del Gestor Documental.
 *
 * Deliberadamente mínimo: NO cachea páginas ni datos de la aplicación
 * (siempre debe verse la versión vigente y respetar RLS). Solo:
 *  - precachea la página /offline y los íconos,
 *  - sirve /offline cuando una navegación falla por falta de red,
 *  - cachea los assets estáticos inmutables de Next (/_next/static).
 * Nunca intercepta llamadas a /api ni a otros orígenes (Supabase).
 */
const CACHE = "gd-estaticos-v1";
const PRECACHE = ["/offline", "/iconos/icono-192.png", "/iconos/icono-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase u otros: ni tocarlos
  if (url.pathname.startsWith("/api/")) return; // nunca cachear la API

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline").then((r) => r ?? Response.error())),
    );
    return;
  }

  const esEstatico =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/iconos/");
  if (esEstatico) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return res;
          }),
      ),
    );
  }
});
