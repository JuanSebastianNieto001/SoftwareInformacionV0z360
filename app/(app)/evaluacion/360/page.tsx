import type { Metadata } from "next";
import { Users } from "lucide-react";
import { eliminarRespuesta360 } from "@/app/acciones/evaluacion";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { BotonEliminar } from "@/components/evaluacion/boton-eliminar";
import { Formulario360 } from "@/components/evaluacion/formulario-360";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ETIQUETA_PERSPECTIVA,
  estatus360,
  formatearNota,
  radicado360,
  varianteNota,
} from "@/lib/evaluacion";
import { exigirModuloEvaluacion } from "@/lib/evaluacion-acceso";
import { formatearFecha } from "@/lib/formato";

export const metadata: Metadata = { title: "Matriz 360" };

export default async function PaginaMatriz360() {
  const { supabase, perfil, puedeEditar, puedeEliminar } = await exigirModuloEvaluacion();

  const [{ data: cargos }, { data: preguntas }, { data: respuestas, error }] = await Promise.all([
    supabase.from("evaluacion_cargos").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("evaluacion_360_preguntas").select("*").order("orden"),
    supabase
      .from("v_evaluacion_360")
      .select("*")
      .order("consecutivo", { ascending: false })
      .limit(300),
  ]);

  return (
    <div className="space-y-8">
      {puedeEditar && (
        <Formulario360
          cargos={cargos ?? []}
          preguntas={preguntas ?? []}
          evaluadorPorDefecto={perfil.nombre}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
          Registro de matriz de respuestas
        </h2>

        {error ? (
          <EstadoVacio titulo="No se pudo cargar la matriz" descripcion={error.message} />
        ) : !respuestas || respuestas.length === 0 ? (
          <EstadoVacio
            icono={<Users />}
            titulo="Todavía no hay respuestas"
            descripcion={
              puedeEditar
                ? "Registra la primera con el formulario de arriba."
                : "Cuando se registren respuestas aparecerán aquí."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-[20px] border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Evaluado</TableHead>
                  <TableHead>Evaluador</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Perspectiva</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead className="text-right">Liderazgo</TableHead>
                  <TableHead className="text-right">Equipo</TableHead>
                  <TableHead className="text-right">Calidad</TableHead>
                  <TableHead className="text-right">Adaptab.</TableHead>
                  {puedeEliminar && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {respuestas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {radicado360(r.consecutivo)}
                    </TableCell>
                    <TableCell className="font-medium">{r.evaluado_nombre}</TableCell>
                    <TableCell>
                      {r.evaluador_nombre}
                      {r.evaluador_cargo && (
                        <span className="block text-xs text-muted-foreground">{r.evaluador_cargo}</span>
                      )}
                    </TableCell>
                    <TableCell>{r.cargo_nombre}</TableCell>
                    <TableCell>{ETIQUETA_PERSPECTIVA[r.perspectiva]}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatearFecha(r.fecha)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatearNota(r.promedio)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={varianteNota(r.promedio)}>{estatus360(r.promedio)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatearNota(r.liderazgo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearNota(r.trabajo_equipo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearNota(r.calidad_resultados)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearNota(r.adaptabilidad)}</TableCell>
                    {puedeEliminar && (
                      <TableCell className="text-right">
                        <BotonEliminar
                          compacto
                          accion={eliminarRespuesta360.bind(null, r.id)}
                          titulo={`Eliminar ${radicado360(r.consecutivo)}`}
                          descripcion={`Se borra la respuesta de ${r.evaluador_nombre} sobre ${r.evaluado_nombre}. Esta acción no se puede deshacer.`}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
