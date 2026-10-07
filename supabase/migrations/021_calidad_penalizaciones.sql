-- =====================================================================
-- CALIDAD: MATRIZ DE PENALIZACIÓN DE LOS ERRORES CRÍTICOS
-- =====================================================================
-- La hoja "Penalización" de la matriz MTZ-OPE-001 define, para cada error
-- crítico (y sus variantes), la gravedad, el tratamiento en la primera y la
-- segunda ocurrencia (reincidencia) y el impacto en comisiones. Es política
-- de referencia, no datos de personas: se lee como la pauta (cualquier
-- autenticado) y la mantiene quien edita el cuadro. No hay cálculo asociado;
-- es la guía que acompaña a la retroalimentación cuando un crítico falla.
-- =====================================================================

create table calidad_penalizaciones (
  id                   uuid primary key default gen_random_uuid(),
  area_id              uuid not null references areas (id) on delete restrict,
  orden                smallint not null default 0,
  item_critico         text not null check (char_length(item_critico) between 2 and 200),
  variante             text check (char_length(variante) <= 120),
  pauta_evaluada       text check (char_length(pauta_evaluada) <= 400),
  gravedad             text not null check (char_length(gravedad) between 2 and 120),
  tratamiento_primera  text not null check (char_length(tratamiento_primera) <= 600),
  tratamiento_segunda  text check (char_length(tratamiento_segunda) <= 600),
  impacto_comisiones   text check (char_length(impacto_comisiones) <= 120),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create index calidad_penalizaciones_orden on calidad_penalizaciones (orden);

create trigger trg_calidad_penalizaciones_actualizado
  before update on calidad_penalizaciones
  for each row execute function public.tocar_actualizado_en();

alter table calidad_penalizaciones enable row level security;

create policy calidad_penalizaciones_select on calidad_penalizaciones
  for select to authenticated using (true);
create policy calidad_penalizaciones_write on calidad_penalizaciones
  for all to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('calidad'));

-- ---------- Seed: las 12 filas de la hoja Penalización ----------
insert into calidad_penalizaciones (area_id, orden, item_critico, variante, pauta_evaluada, gravedad, tratamiento_primera, tratamiento_segunda, impacto_comisiones)
select public.area_modulo('calidad'), v.orden, v.item, v.variante, v.pauta, v.gravedad, v.t1, v.t2, v.comision
from (values
  (1,  'Corta o no contesta llamada', null,                 'Atiende correctamente al cliente (tiempos muertos / buzón)', 'Moderada (pasivo/buzón) / Muy grave (abandono deliberado)', 'Feedback escrito // Feedback escrito + proceso disciplinario inmediato (descargos)', 'Feedback escrito + penalización de comisión', 'Propuesta: 10 %'),
  (2,  'Irrespetuoso con el cliente', 'Indirecto',          'Trata con respeto (bostezos, risas de fondo, comentarios a terceros)', 'Moderada', 'Feedback escrito', 'Feedback escrito + penalización de comisión', 'Propuesta: 10 %'),
  (3,  'Irrespetuoso con el cliente', 'Directo',            'Trata con respeto (groserías, sarcasmo, levantar la voz)', 'Muy grave', 'Feedback escrito + proceso disciplinario inmediato (descargos)', 'Sanción laboral directa desde el primer evento', null),
  (4,  'Transmite mala imagen de la compañía', null,        'El asesor transmite buena imagen de la compañía', 'Muy grave', 'Feedback escrito + proceso disciplinario inmediato (descargos)', 'Sanción laboral directa desde el primer evento', null),
  (5,  'Omisión grave de información', 'Sin impacto financiero', 'Reformulación y condiciones del plan', 'Moderada', 'Feedback escrito', 'Feedback escrito + penalización de comisión', 'Propuesta: 10 %'),
  (6,  'Omisión grave de información', 'Con impacto financiero', 'Ocultamiento de costos de activación o cobros adicionales', 'Muy grave', 'Feedback escrito + proceso disciplinario inmediato (descargos)', 'Sanción laboral directa desde el primer evento', null),
  (7,  'Miente al cliente', null,                           'Información veraz y transparente', 'Moderada', 'Feedback escrito', 'Feedback escrito + penalización de comisión', 'Propuesta: 10 %'),
  (8,  'Se garantiza lectura ATDP antes de datos sensibles', null, 'Cumplimiento estricto de Habeas Data / legal', 'Muy grave', 'Feedback escrito + proceso disciplinario inmediato (descargos)', 'Sanción laboral directa desde el primer evento', null),
  (9,  'Gestión fraudulenta', null,                         'Veracidad, titularidad directa y legalidad de la orden', 'Muy grave', 'Feedback escrito + proceso disciplinario inmediato (descargos)', 'Sanción laboral directa desde el primer evento', null),
  (10, 'Gestión incorrecta', 'Error operativo involuntario', 'Flujo de radicación y carga de documentos', 'Leve / Moderada', 'Feedback escrito', 'Feedback escrito + penalización de comisión', 'Propuesta: 10 %'),
  (11, 'Tipificación', 'Involuntaria',                      'Tipificación correcta en el CRM', 'Leve', 'Feedback escrito', 'Feedback escrito + penalización de comisión', 'Propuesta: 10 %'),
  (12, 'Tipificación', 'Deliberada',                        'Alteración malintencionada de estados para alterar métricas', 'Muy grave', 'Feedback escrito + proceso disciplinario inmediato (descargos)', 'Sanción laboral directa desde el primer evento', null)
) as v(orden, item, variante, pauta, gravedad, t1, t2, comision)
where public.area_modulo('calidad') is not null;

comment on table calidad_penalizaciones is
  'Política de penalización de los errores críticos (hoja Penalización de MTZ-OPE-001): gravedad, tratamiento 1.ª y 2.ª ocurrencia e impacto en comisiones. Referencia, no datos de personas.';
