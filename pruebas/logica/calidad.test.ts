/**
 * Pruebas de la nota de calidad (lib/calidad): la fórmula que ve el analista
 * mientras marca la pauta. Es espejo de la vista v_calidad_evaluaciones, así
 * que si una de estas pruebas cambia, la vista tiene que cambiar igual.
 *
 * Se corren con `npm run prueba:logica`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calcularNota, formatearPorcentaje, sumaPesos, varianteNotaCalidad, type ItemParaNota } from "@/lib/calidad";

// Una pauta pequeña con la forma real: tres ítems que pesan (15 + 45 + 40),
// un crítico que no pesa pero anula, y un ítem retirado de la matriz.
const PAUTA: ItemParaNota[] = [
  { id: "saludo", peso: 15, es_fatal: false, activo: true },
  { id: "sondeo", peso: 45, es_fatal: false, activo: true },
  { id: "cierre", peso: 40, es_fatal: false, activo: true },
  { id: "critico", peso: 0, es_fatal: true, activo: true },
  { id: "retirado", peso: 10, es_fatal: false, activo: false },
];

describe("calcularNota", () => {
  it("todo cumple: 100 sobre 100", () => {
    const r = calcularNota(PAUTA, { saludo: "cumple", sondeo: "cumple", cierre: "cumple", critico: "cumple" }, true);
    assert.equal(r.notaSinIc, 100);
    assert.equal(r.notaFinal, 100);
    assert.equal(r.fatalesFallados, 0);
    assert.equal(r.respondidos, 4);
  });

  it("un ítem que no cumple resta exactamente su peso", () => {
    const r = calcularNota(PAUTA, { saludo: "no_cumple", sondeo: "cumple", cierre: "cumple" }, true);
    assert.equal(r.notaSinIc, 85);
    assert.equal(r.pesoAplicable, 100);
    assert.equal(r.pesoCumplido, 85);
  });

  it("«no aplica» sale del denominador: no premia ni castiga", () => {
    const r = calcularNota(PAUTA, { saludo: "no_aplica", sondeo: "cumple", cierre: "no_cumple" }, true);
    assert.equal(r.pesoAplicable, 85);
    assert.equal(r.pesoCumplido, 45);
    // 45 / 85 = 52,941… → se redondea a dos decimales.
    assert.equal(r.notaSinIc, 52.94);
  });

  it("un crítico fallado anula la nota final si la matriz lo dice", () => {
    const r = calcularNota(PAUTA, { saludo: "cumple", sondeo: "cumple", cierre: "cumple", critico: "no_cumple" }, true);
    assert.equal(r.notaSinIc, 100, "la nota sin críticos se conserva para el informe");
    assert.equal(r.notaFinal, 0);
    assert.equal(r.fatalesFallados, 1);
  });

  it("si la matriz no anula, el crítico fallado se cuenta pero no pone la nota en 0", () => {
    const r = calcularNota(PAUTA, { saludo: "cumple", sondeo: "cumple", cierre: "cumple", critico: "no_cumple" }, false);
    assert.equal(r.notaFinal, 100);
    assert.equal(r.fatalesFallados, 1);
  });

  it("sin nada aplicable no hay nota (null), no un cero", () => {
    const r = calcularNota(PAUTA, {}, true);
    assert.equal(r.notaSinIc, null);
    assert.equal(r.notaFinal, null);
    assert.equal(r.respondidos, 0);
    assert.equal(r.total, 4, "el ítem retirado no cuenta en el total");
  });

  it("un ítem retirado se ignora aunque tenga respuesta", () => {
    const r = calcularNota(PAUTA, { saludo: "cumple", sondeo: "cumple", cierre: "cumple", retirado: "no_cumple" }, true);
    assert.equal(r.notaFinal, 100);
  });
});

describe("sumaPesos", () => {
  it("los tres bloques de la matriz suman 100 (sin críticos ni retirados)", () => {
    assert.equal(sumaPesos(PAUTA), 100);
  });

  it("redondea a dos decimales para no tropezar con la coma flotante", () => {
    const tercios: ItemParaNota[] = [
      { id: "a", peso: 33.33, es_fatal: false, activo: true },
      { id: "b", peso: 33.33, es_fatal: false, activo: true },
      { id: "c", peso: 33.34, es_fatal: false, activo: true },
    ];
    assert.equal(sumaPesos(tercios), 100);
  });
});

describe("varianteNotaCalidad", () => {
  it("colorea contra la nota mínima de la matriz", () => {
    assert.equal(varianteNotaCalidad(85, 85), "default");
    assert.equal(varianteNotaCalidad(70, 85), "secondary", "hasta 15 puntos por debajo es aviso");
    assert.equal(varianteNotaCalidad(69.9, 85), "destructive");
    assert.equal(varianteNotaCalidad(null, 85), "outline");
  });
});

describe("formatearPorcentaje", () => {
  it("lo que no es número se pinta como raya", () => {
    assert.equal(formatearPorcentaje(null), "—");
    assert.equal(formatearPorcentaje(Number.NaN), "—");
  });
});
