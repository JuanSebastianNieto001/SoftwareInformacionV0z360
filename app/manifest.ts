import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Comunícate con VOZ360",
    short_name: "VOZ360",
    description: "Documentos internos de la empresa, por área y con vigencia controlada.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef4fb",
    theme_color: "#0d2b4e",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
