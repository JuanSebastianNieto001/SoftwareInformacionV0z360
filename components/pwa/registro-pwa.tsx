"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (public/sw.js) solo en producción. El SW no
 * cachea datos de la aplicación: solo sirve una página de "sin conexión"
 * y los íconos, para que la PWA sea instalable y no muestre un error
 * genérico del navegador cuando el asesor pierde señal.
 */
export function RegistroPwa() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("[pwa] No se pudo registrar el service worker:", e);
    });
  }, []);

  return null;
}
