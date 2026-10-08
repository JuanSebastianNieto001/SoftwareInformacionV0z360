"use client";

// Configuración de la pauta: umbral, regla de error crítico y los ítems con
// categoría, peso y marca de crítico. Avisa si los pesos no son válidos,
// que es lo que la base exige para poder publicar una auditoría.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { actualizarItem, actualizarMatriz, crearItem, desactivarItem } from "@/app/acciones/calidad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sumaPesos } from "@/lib/calidad";
import type { ItemCalidad, MatrizCalidad } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";
import { esquemaItemCalidad, esquemaMatrizCalidad, primerError } from "@/lib/validaciones";

export function EditorMatriz({ matriz, items, editable }: { matriz: MatrizCalidad; items: ItemCalidad[]; editable: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [m, setM] = useState({
    nombre: matriz.nombre,
    descripcion: matriz.descripcion ?? "",
    nota_minima: String(matriz.nota_minima),
    error_fatal_anula: matriz.error_fatal_anula,
    activa: matriz.activa,
  });
  const suma = sumaPesos(items.map((i) => ({ ...i, peso: Number(i.peso) })));
  const sumaCien = Math.abs(suma - 100) < 0.01;
  const categorias = [...new Set(items.map((i) => i.categoria))];
  // Pesos agrupados por bloque de la matriz (solo ítems activos no críticos),
  // para ver de un vistazo el 15 + 45 + 40 de la pauta oficial.
  const porBloque = [
    ...items
      .filter((i) => i.activo && !i.es_fatal)
      .reduce((mapa, i) => {
        const bloque = i.bloque ?? "Sin bloque";
        return mapa.set(bloque, (mapa.get(bloque) ?? 0) + Number(i.peso));
      }, new Map<string, number>())
      .entries(),
  ].map(([bloque, peso]) => ({ bloque, peso: Math.round(peso * 100) / 100 }));

  function guardarMatriz() {
    const parsed = esquemaMatrizCalidad.safeParse({ ...m, descripcion: m.descripcion || null });
    if (!parsed.success) return toast.error(primerError(parsed.error));
    iniciar(async () => {
      const r = await actualizarMatriz(matriz.id, parsed.data);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Pauta guardada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-[24px] border bg-card p-5 sm:grid-cols-2 sm:p-6">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="m-nombre">Nombre de la pauta</Label>
          <Input id="m-nombre" value={m.nombre} onChange={(e) => setM((p) => ({ ...p, nombre: e.target.value }))} disabled={!editable || pendiente} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-min">Umbral de aprobación (%)</Label>
          <Input id="m-min" type="number" min={0} max={100} value={m.nota_minima} onChange={(e) => setM((p) => ({ ...p, nota_minima: e.target.value }))} disabled={!editable || pendiente} />
        </div>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={m.error_fatal_anula} onCheckedChange={(v) => setM((p) => ({ ...p, error_fatal_anula: v === true }))} disabled={!editable || pendiente} />
            Un error crítico anula la nota (nota final 0)
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={m.activa} onCheckedChange={(v) => setM((p) => ({ ...p, activa: v === true }))} disabled={!editable || pendiente} />
            Pauta activa (disponible para auditorías nuevas)
          </label>
        </div>
        {editable && (
          <div className="sm:col-span-2">
            <Button onClick={guardarMatriz} disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar configuración
            </Button>
          </div>
        )}
      </section>

      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[20px] border px-5 py-3", sumaCien ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50")}>
        <p className="text-sm">
          Suma de pesos de los ítems activos (sin críticos): <span className="font-semibold tabular-nums">{suma} %</span>
          {sumaCien ? (
            <span className="ml-2 text-muted-foreground">— la nota de cada auditoría se reparte sobre los ítems que apliquen (los “No aplica” no cuentan)</span>
          ) : (
            <span className="ml-2 text-amber-800">— debe sumar 100 % para poder publicar auditorías</span>
          )}
        </p>
        {editable && <DialogoItem matrizId={matriz.id} ordenSugerido={(items.at(-1)?.orden ?? 0) + 1} categorias={categorias} />}
        {porBloque.length > 0 && (
          <p className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {porBloque.map(({ bloque, peso }, idx) => (
              <span key={bloque} className="whitespace-nowrap">
                {idx > 0 && <span className="mr-2">·</span>}
                {bloque} <span className="font-medium tabular-nums">{peso} %</span>
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-[20px] border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Bloque</TableHead>
              <TableHead className="min-w-[24rem]">Ítem</TableHead>
              <TableHead className="text-right">Peso</TableHead>
              <TableHead>Crítico</TableHead>
              <TableHead>Estado</TableHead>
              {editable && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => (
              <TableRow key={i.id} className={cn(!i.activo && "text-muted-foreground line-through")}>
                <TableCell className="tabular-nums text-muted-foreground">{i.orden}</TableCell>
                <TableCell className="text-xs font-medium">{i.categoria}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{i.bloque}</TableCell>
                <TableCell className="text-sm leading-snug whitespace-normal">{i.descripcion}</TableCell>
                <TableCell className="text-right tabular-nums">{i.es_fatal ? "—" : `${Number(i.peso)} %`}</TableCell>
                <TableCell>{i.es_fatal && <Badge variant="destructive">crítico</Badge>}</TableCell>
                <TableCell className="text-xs">{i.activo ? "Activo" : "Inactivo"}</TableCell>
                {editable && (
                  <TableCell className="text-right whitespace-nowrap">
                    <DialogoItem matrizId={matriz.id} item={i} categorias={categorias} ordenSugerido={i.orden} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Los tres bloques de la matriz oficial MTZ-OPE-001 (15 + 45 + 40).
const BLOQUES_MATRIZ = ["Presentación", "Comercial", "Legalización y gestión operativa"];

function DialogoItem({ matrizId, item, categorias, ordenSugerido }: { matrizId: string; item?: ItemCalidad; categorias: string[]; ordenSugerido: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    orden: String(item?.orden ?? ordenSugerido),
    categoria: item?.categoria ?? categorias[0] ?? "",
    bloque: item?.bloque ?? "",
    descripcion: item?.descripcion ?? "",
    peso: String(item ? Number(item.peso) : 0),
    es_fatal: item?.es_fatal ?? false,
    activo: item?.activo ?? true,
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = esquemaItemCalidad.safeParse({ ...f, peso: f.es_fatal ? 0 : f.peso });
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = item ? await actualizarItem(item.id, parsed.data) : await crearItem(matrizId, parsed.data);
      if (!r.ok) return setError(r.error);
      toast.success(item ? "Ítem guardado" : "Ítem agregado");
      setAbierto(false);
      router.refresh();
    });
  }

  function desactivar() {
    if (!item) return;
    iniciar(async () => {
      const r = await desactivarItem(item.id);
      if (!r.ok) return setError(r.error);
      toast.success("Ítem desactivado");
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {item ? (
          <Button variant="ghost" size="icon-sm" aria-label="Editar ítem">
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Nuevo ítem
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{item ? "Editar ítem" : "Nuevo ítem de la pauta"}</DialogTitle>
            <DialogDescription>Los errores críticos son los que más pesan: si el asesor incurre en uno, la nota de la auditoría queda en 0 %, sin importar lo demás.</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-orden">Orden</Label>
              <Input id="i-orden" type="number" min={1} value={f.orden} onChange={(e) => setF((p) => ({ ...p, orden: e.target.value }))} disabled={pendiente} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-cat">Categoría</Label>
              <Input id="i-cat" list="categorias-pauta" value={f.categoria} onChange={(e) => setF((p) => ({ ...p, categoria: e.target.value }))} disabled={pendiente} maxLength={80} />
              <datalist id="categorias-pauta">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-bloque">Bloque</Label>
            <Input id="i-bloque" list="bloques-pauta" value={f.bloque} onChange={(e) => setF((p) => ({ ...p, bloque: e.target.value }))} disabled={pendiente} maxLength={80} />
            <datalist id="bloques-pauta">
              {BLOQUES_MATRIZ.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-desc">Descripción del ítem</Label>
            <Input id="i-desc" value={f.descripcion} onChange={(e) => setF((p) => ({ ...p, descripcion: e.target.value }))} disabled={pendiente} maxLength={400} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-peso">Peso (%)</Label>
              <Input id="i-peso" type="number" min={0} max={100} step={0.01} value={f.peso} onChange={(e) => setF((p) => ({ ...p, peso: e.target.value }))} disabled={pendiente || f.es_fatal} />
            </div>
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={f.es_fatal} onCheckedChange={(v) => setF((p) => ({ ...p, es_fatal: v === true }))} disabled={pendiente} /> Error crítico
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={f.activo} onCheckedChange={(v) => setF((p) => ({ ...p, activo: v === true }))} disabled={pendiente} /> Activo
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {item && item.activo && (
              <Button type="button" variant="ghost" onClick={desactivar} disabled={pendiente}>
                Desactivar
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              {item ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
