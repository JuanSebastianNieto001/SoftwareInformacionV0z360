import { extensionVisible } from "@/lib/archivos";
import { cn } from "@/lib/utils";

/**
 * Chip con la extensión del archivo.
 *
 * El color por tipo es un atajo visual: en una lista larga se encuentra el
 * rojo del PDF antes de leer la palabra. Nunca es la única señal —la
 * extensión va escrita dentro del chip y repetida en la columna Archivo—,
 * así que quien no distinga los tonos no pierde nada.
 */
const COLORES: Record<string, string> = {
  PDF: "bg-[#fee2e2] text-[#b91c1c]",
  DOC: "bg-[#dbeafe] text-[#1d4ed8]",
  DOCX: "bg-[#dbeafe] text-[#1d4ed8]",
  XLS: "bg-[#dcfce7] text-[#15803d]",
  XLSX: "bg-[#dcfce7] text-[#15803d]",
  PPT: "bg-[#ffedd5] text-[#c2410c]",
  PPTX: "bg-[#ffedd5] text-[#c2410c]",
};

export function ChipArchivo({
  nombreArchivo,
  className,
}: {
  nombreArchivo: string;
  className?: string;
}) {
  const extension = extensionVisible(nombreArchivo);
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[9.5px] font-semibold",
        COLORES[extension] ?? "bg-tinte text-marino-suave",
        className,
      )}
    >
      {extension.slice(0, 4) || "—"}
    </span>
  );
}
