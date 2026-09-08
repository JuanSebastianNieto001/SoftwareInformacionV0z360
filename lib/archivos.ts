import {
  EXTENSIONES_PERMITIDAS,
  MIME_PERMITIDOS,
  type MimePermitido,
} from "./validaciones";

/**
 * Convierte un nombre de archivo cualquiera en uno seguro para Storage:
 * sin tildes, sin espacios, solo [A-Za-z0-9._-], conservando la extensión.
 * Debe cumplir la regex de `nombreArchivo` en validaciones.ts.
 */
export function sanitizarNombreArchivo(original: string): string {
  const sinRuta = original.split(/[\\/]/).pop() ?? "archivo";
  const punto = sinRuta.lastIndexOf(".");
  const base = punto > 0 ? sinRuta.slice(0, punto) : sinRuta;
  const ext = punto > 0 ? sinRuta.slice(punto + 1).toLowerCase() : "";

  const limpiar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // quita tildes y diéresis
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^[._-]+/, "")
      .replace(/[._-]+$/, "");

  let nombre = limpiar(base).slice(0, 120) || "archivo";
  const extension = limpiar(ext).slice(0, 12);
  if (!/^[A-Za-z0-9]/.test(nombre)) nombre = `a${nombre}`;
  return extension ? `${nombre}.${extension}` : nombre;
}

/** Ruta obligatoria de Storage: <area_id>/<documento_id>/<archivo>. */
export function construirRutaStorage(
  areaId: string,
  documentoId: string,
  nombreArchivo: string,
): string {
  return `${areaId}/${documentoId}/${nombreArchivo}`;
}

/** Deduce el MIME por extensión cuando el navegador no lo informa. */
export function mimePorExtension(nombre: string): MimePermitido | null {
  const ext = nombre.slice(nombre.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return null;
  }
}

export function esMimePermitido(
  m: string | null | undefined,
): m is MimePermitido {
  return !!m && (MIME_PERMITIDOS as readonly string[]).includes(m);
}

/** Valor para el atributo accept del <input type=file>. */
export const ACCEPT_ARCHIVOS = [
  ...EXTENSIONES_PERMITIDAS,
  ...MIME_PERMITIDOS,
].join(",");

/** Extensión (sin punto, en mayúsculas) para mostrar en la UI. */
export function extensionVisible(nombre: string): string {
  const i = nombre.lastIndexOf(".");
  return i > 0 ? nombre.slice(i + 1).toUpperCase() : "";
}
