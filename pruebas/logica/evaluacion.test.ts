/**
 * Pruebas de las fórmulas de la evaluación de desempeño 360° (lib/evaluacion),
 * que replican el libro EVALUACION_DE_DESEMPENO_360_VOZ360.xlsx. Las vistas
 * v_evaluacion_resultados y v_evaluacion_360 calculan lo mismo en Postgres.
 *
 * Se corren con `npm run prueba:logica`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calcular360,
  calcularFormato,
  estadoIso,
  media,
  nivelDashboard,
  nivelFormato,
  radicado360,
} from "@/lib/evaluacion";

describe("calcularFormato (fila 24 y columna K de la hoja de cargo)", () => {
  it("con las cuatro perspectivas en 5, la nota es 5 (los pesos suman 1)", () => {
    const todas5 = { autoevaluacion: 5, jefe_inmediato: 5, pares: 5, subordinados: 5 };
    const r = calcularFormato(["c1", "c2"], { c1: todas5, c2: todas5 });
    assert.equal(r.notaFinal, 5);
    assert.equal(r.nCalificadas, 8);
    assert.deepEqual(r.perspectivasIncompletas, []);
  });

  it("una perspectiva en blanco aporta 0, como IF(ISNUMBER(x), x*peso, 0) en la hoja", () => {
    const sinSubordinados = { autoevaluacion: 5, jefe_inmediato: 5, pares: 5 };
    const r = calcularFormato(["c1"], { c1: sinSubordinados });
    // 5·0,1 + 5·0,4 + 5·0,25 = 3,75
    assert.equal(r.notaFinal, 3.75);
    assert.equal(r.promedioPorPerspectiva.subordinados, null);
    assert.deepEqual(r.perspectivasIncompletas, ["subordinados"]);
  });

  it("pondera con los pesos del formato: jefe inmediato pesa 40 %", () => {
    const r = calcularFormato(["c1"], { c1: { autoevaluacion: 1, jefe_inmediato: 5, pares: 1, subordinados: 1 } });
    // 0,1 + 2 + 0,25 + 0,25 = 2,6
    assert.ok(Math.abs((r.notaFinal ?? 0) - 2.6) < 1e-9);
  });

  it("sin criterios no hay nota", () => {
    assert.equal(calcularFormato([], {}).notaFinal, null);
  });
});

describe("cortes de nivel", () => {
  it("tabla de interpretación de la hoja de cargo (L24)", () => {
    assert.equal(nivelFormato(4.5), "Excelente / Sobresaliente");
    assert.equal(nivelFormato(4.49), "Satisfactorio Alto");
    assert.equal(nivelFormato(3.8), "Satisfactorio Alto");
    assert.equal(nivelFormato(3.79), "Satisfactorio Básico");
    assert.equal(nivelFormato(3), "Satisfactorio Básico");
    assert.equal(nivelFormato(2.99), "No Satisfactorio");
    assert.equal(nivelFormato(null), null);
  });

  it("columna J del dashboard", () => {
    assert.equal(nivelDashboard(4.5), "Excepcional");
    assert.equal(nivelDashboard(4), "Sobresaliente");
    assert.equal(nivelDashboard(3), "Competente / Satisfactorio");
    assert.equal(nivelDashboard(2), "Necesita mejora");
    assert.equal(nivelDashboard(1.9), "Insatisfactorio");
  });

  it("conformidad ISO: el corte es 3", () => {
    assert.equal(estadoIso(3), "CONFORME");
    assert.equal(estadoIso(2.99), "NO CONFORME · REQUIERE PAI");
  });
});

describe("calcular360 (hoja «Evaluaciones»)", () => {
  it("promedia cada competencia sobre sus tres preguntas", () => {
    const r = calcular360([5, 4, 3, 2, 2, 2, 5, 5, 5, 1, 2, 3]);
    assert.equal(r.competencias.liderazgo, 4);
    assert.equal(r.competencias.trabajo_equipo, 2);
    assert.equal(r.competencias.calidad_resultados, 5);
    assert.equal(r.competencias.adaptabilidad, 2);
    assert.equal(r.promedio, 39 / 12);
  });

  it("las preguntas sin responder no cuentan (AVERAGE ignora vacíos)", () => {
    const r = calcular360([5, null, undefined, null, null, null, null, null, null, null, null, null]);
    assert.equal(r.competencias.liderazgo, 5);
    assert.equal(r.competencias.trabajo_equipo, null);
    assert.equal(r.promedio, 5);
  });
});

describe("utilidades", () => {
  it("media ignora nulos y devuelve null si no queda nada", () => {
    assert.equal(media([4, null, 2]), 3);
    assert.equal(media([null, undefined]), null);
  });

  it("radicado con tres cifras, como la columna A", () => {
    assert.equal(radicado360(7), "EVAL-007");
    assert.equal(radicado360(1234), "EVAL-1234");
  });
});
