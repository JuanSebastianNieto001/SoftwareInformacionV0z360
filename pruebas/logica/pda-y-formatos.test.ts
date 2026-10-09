/**
 * Pruebas de las reglas pequeñas que se repiten por toda la app: el estado
 * de un objetivo del PDA, los nombres de mes del formato FTM-SINF-005, los
 * tipos de evidencia admitidos, cómo se enseña el usuario de un asesor
 * (número de Poliedro) y los radicados.
 *
 * Se corren con `npm run prueba:logica`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { radicado } from "@/lib/buzon";
import { enCuanto, nombreComparable } from "@/lib/cumpleanos";
import { iniciales, plural, usuarioVisible } from "@/lib/formato";
import {
  estadoObjetivo,
  mesMayusculas,
  mimeEvidenciaPorExtension,
  nombreMes,
  periodoAMes,
  rutaEvidenciaPda,
  tipoEvidencia,
} from "@/lib/pda";

describe("PDA", () => {
  it("estado del objetivo según el % de cumplimiento (columna M)", () => {
    assert.equal(estadoObjetivo(null), "en_curso");
    assert.equal(estadoObjetivo(undefined), "en_curso");
    assert.equal(estadoObjetivo(100), "cumplido");
    assert.equal(estadoObjetivo(120), "cumplido");
    assert.equal(estadoObjetivo(50), "parcial");
    assert.equal(estadoObjetivo(0), "no_cumplido");
  });

  it("nombres de mes del formato", () => {
    assert.equal(nombreMes("2026-10-01"), "Octubre 2026");
    assert.equal(mesMayusculas("2026-09-01"), "SEPTIEMBRE");
    assert.equal(periodoAMes("2026-10-01"), "2026-10");
  });

  it("evidencias: MIME por extensión, sin importar mayúsculas; lo demás se rechaza", () => {
    assert.equal(mimeEvidenciaPorExtension("Pantallazo.JPG"), "image/jpeg");
    assert.equal(mimeEvidenciaPorExtension("acta.pdf"), "application/pdf");
    assert.equal(mimeEvidenciaPorExtension("instalador.exe"), null);
    assert.equal(mimeEvidenciaPorExtension("sin-extension"), null);
    assert.equal(tipoEvidencia("image/png"), "PNG");
    assert.equal(tipoEvidencia("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "Excel");
  });

  it("la ruta en el bucket es <plan>/<objetivo>/<archivo> (la exige el trigger)", () => {
    assert.equal(rutaEvidenciaPda("p1", "o1", "a.png"), "p1/o1/a.png");
  });
});

describe("usuarios y nombres", () => {
  it("el correo interno de un asesor se enseña como su número de Poliedro", () => {
    assert.equal(usuarioVisible("46439600@poliedro.voz360.co"), "46439600");
    assert.equal(usuarioVisible("46439600@POLIEDRO.voz360.co"), "46439600");
    assert.equal(usuarioVisible("lider.ti@voz360.co"), "lider.ti@voz360.co");
    assert.equal(usuarioVisible("123@poliedro.voz360.co"), "123@poliedro.voz360.co", "menos de 4 cifras no es un número de Poliedro");
    assert.equal(usuarioVisible(null), "");
  });

  it("iniciales y plurales", () => {
    assert.equal(iniciales("juan sebastián nieto"), "JS");
    assert.equal(plural(1, "auditoría", "auditorías"), "1 auditoría");
    assert.equal(plural(3, "auditoría", "auditorías"), "3 auditorías");
  });

  it("nombres comparables: sin tildes, sin dobles espacios, en minúsculas", () => {
    assert.equal(nombreComparable("  José   Ñuñez "), "jose nunez");
  });
});

describe("cumpleaños y radicados", () => {
  it("cuánto falta, en palabras", () => {
    assert.equal(enCuanto(0), "Hoy");
    assert.equal(enCuanto(1), "Mañana");
    assert.equal(enCuanto(15), "En 15 días");
    assert.equal(enCuanto(31), "En un mes");
    assert.equal(enCuanto(75), "En 3 meses");
  });

  it("radicado del buzón con cinco cifras", () => {
    assert.equal(radicado(42), "BZ-00042");
  });
});
