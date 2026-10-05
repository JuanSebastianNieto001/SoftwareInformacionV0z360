-- =====================================================================
-- EVALUACIÓN DE DESEMPEÑO 360°
-- =====================================================================
-- Un cuadro nuevo en "Mis áreas" que no contiene documentos sino un
-- módulo: el formato de evaluación de desempeño que Gestión Humana lleva
-- hoy en EVALUACION_DE_DESEMPENO_360_VOZ360.xlsx.
--
-- La decisión que explica el diseño: el módulo ES un área. Se marca con
-- areas.modulo = 'evaluacion' y hereda sin más el sistema de permisos
-- (matriz por persona y por grupo, los cuatro niveles, nivel_en_area()).
-- Sin permiso, el cuadro no aparece y escribir la URL a mano responde 404,
-- porque `areas` no devuelve la fila. No hay un mecanismo aparte que se
-- pueda olvidar de proteger.
--
-- Qué significa cada nivel aquí:
--   lectura / descarga  consultar evaluaciones, dashboard y resumen
--   edicion             crear evaluaciones, calificar, cerrar, registrar 360
--   total (o admin)     además eliminar
--
-- El libro de Excel tiene DOS instrumentos y se replican los dos:
--   1. Formato por cargo: 15 hojas (una por cargo) con 12 criterios propios,
--      calificados desde 4 perspectivas con pesos fijos (autoevaluación 10 %,
--      jefe inmediato 40 %, pares 25 %, subordinados 25 %).
--   2. Matriz 360: una fila por evaluador con 12 preguntas genéricas en 4
--      competencias, que alimenta el "Resumen General".
-- =====================================================================

-- ---------- 1. EL ÁREA ES UN MÓDULO ----------
alter table areas add column if not exists modulo text
  check (modulo in ('evaluacion'));

-- Solo puede haber un área de evaluación: las políticas la localizan por
-- esta marca, no por el nombre ni por el slug.
create unique index if not exists areas_modulo_unico on areas (modulo)
  where modulo is not null;

insert into areas (nombre, slug, descripcion, modulo)
values (
  'Evaluación de desempeño',
  'evaluacion-desempeno',
  'Evaluación de desempeño 360° por cargo. El acceso se concede persona a persona desde Administración → Permisos.',
  'evaluacion'
)
on conflict (nombre) do update set modulo = excluded.modulo;

-- Devuelve el id del área de evaluación. SECURITY DEFINER a propósito: las
-- políticas de las tablas de catálogo (cargos, criterios, pesos) no tienen
-- area_id y necesitan preguntar "¿tiene acceso al módulo?" aunque la fila
-- de `areas` no sea visible para quien pregunta. nivel_en_area() ya decide
-- después si hay acceso o no.
create or replace function public.area_evaluacion()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from areas where modulo = 'evaluacion' and activa limit 1
$$;
grant execute on function public.area_evaluacion() to authenticated;

-- ---------- 2. PERSPECTIVAS Y PESOS ----------
-- La matriz 360 añade "Alta dirección" a las cuatro del formato por cargo.
create type perspectiva_360 as enum (
  'autoevaluacion', 'jefe_inmediato', 'pares', 'subordinados', 'alta_direccion'
);

-- Los pesos del formato por cargo. En el Excel están escritos dentro de
-- cada fórmula (D12*0.1, F12*0.4…); aquí viven en una tabla para que las
-- vistas y la pantalla lean el mismo número.
create table evaluacion_pesos (
  perspectiva perspectiva_360 primary key,
  peso        numeric(4,3) not null check (peso >= 0 and peso <= 1)
);
insert into evaluacion_pesos (perspectiva, peso) values
  ('autoevaluacion', 0.10),
  ('jefe_inmediato', 0.40),
  ('pares',          0.25),
  ('subordinados',   0.25)
on conflict (perspectiva) do nothing;

-- ---------- 3. CARGOS Y CRITERIOS (catálogo) ----------
create table evaluacion_cargos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,          -- CARGO-01 … CARGO-15 (Dashboard)
  nombre            text not null unique,          -- "Director General", …
  area_departamento text not null,                 -- "Dirección General", …
  hoja              text not null,                 -- nombre de la hoja en el Excel
  etiqueta_evaluado text not null,                 -- "Director", "Asesor", …
  campana_defecto   text,                          -- "Claro Colombia" en Team Leader y Asesores
  orden             integer not null unique,
  activo            boolean not null default true
);

create table evaluacion_criterios (
  id        uuid primary key default gen_random_uuid(),
  cargo_id  uuid not null references evaluacion_cargos (id) on delete cascade,
  orden     integer not null check (orden between 1 and 12),
  categoria text not null,
  criterio  text not null,
  unique (cargo_id, orden)
);

-- ---------- 4. FORMATO POR CARGO ----------
create table evaluaciones (
  id                uuid primary key default gen_random_uuid(),
  area_id           uuid not null references areas (id) on delete restrict,
  cargo_id          uuid not null references evaluacion_cargos (id) on delete restrict,
  periodo           text not null,                 -- "2026", "2026-S1"…
  evaluado_nombre   text not null,
  evaluado_id       uuid references perfiles (id) on delete set null,
  campana           text,
  fecha_evaluacion  date not null default current_date,
  evaluador_nombre  text not null,
  evaluador_cargo   text,
  plan_accion       text,
  estado            text not null default 'borrador' check (estado in ('borrador', 'cerrada')),
  cerrada_en        timestamptz,
  creado_por        uuid references perfiles (id) on delete set null,
  creado_en         timestamptz not null default now(),
  actualizado_por   uuid references perfiles (id) on delete set null,
  actualizado_en    timestamptz not null default now()
);
create index evaluaciones_cargo_periodo on evaluaciones (cargo_id, periodo);

-- Una calificación por criterio y perspectiva. Decimal entre 1 y 5, igual
-- que la validación "decimal between 1,5" de las hojas (la gente escribe
-- 3.5 y 4.7, no solo enteros).
create table evaluacion_calificaciones (
  evaluacion_id uuid not null references evaluaciones (id) on delete cascade,
  criterio_id   uuid not null references evaluacion_criterios (id) on delete restrict,
  perspectiva   perspectiva_360 not null check (perspectiva <> 'alta_direccion'),
  calificacion  numeric(3,2) not null check (calificacion >= 1 and calificacion <= 5),
  primary key (evaluacion_id, criterio_id, perspectiva)
);

-- "Observaciones / Evidencias": una por criterio, no por perspectiva.
create table evaluacion_observaciones (
  evaluacion_id uuid not null references evaluaciones (id) on delete cascade,
  criterio_id   uuid not null references evaluacion_criterios (id) on delete restrict,
  observacion   text not null,
  primary key (evaluacion_id, criterio_id)
);

-- Un criterio solo puede calificarse en una evaluación de SU cargo. Es una
-- regla entre tablas que un check no puede expresar, de ahí el disparador.
create or replace function public.evaluacion_criterio_coherente()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1
      from evaluaciones e
      join evaluacion_criterios c on c.cargo_id = e.cargo_id
     where e.id = new.evaluacion_id and c.id = new.criterio_id
  ) then
    raise exception 'El criterio no pertenece al cargo de la evaluación';
  end if;
  return new;
end $$;

create trigger evaluacion_calificaciones_coherentes
  before insert or update on evaluacion_calificaciones
  for each row execute function public.evaluacion_criterio_coherente();
create trigger evaluacion_observaciones_coherentes
  before insert or update on evaluacion_observaciones
  for each row execute function public.evaluacion_criterio_coherente();

create trigger trg_evaluaciones_actualizado
  before update on evaluaciones
  for each row execute function public.tocar_actualizado_en();

-- ---------- 5. MATRIZ 360 ----------
-- Las 12 preguntas del "Diccionario de Preguntas", en 4 competencias.
create table evaluacion_360_preguntas (
  codigo      text primary key,                    -- P1 … P12
  orden       integer not null unique,
  competencia text not null,
  pregunta    text not null
);
insert into evaluacion_360_preguntas (codigo, orden, competencia, pregunta) values
  ('P1',  1,  'Liderazgo y Gestión',                 'Capacidad para guiarse a sí mismo y a otros hacia el logro de objetivos.'),
  ('P2',  2,  'Liderazgo y Gestión',                 'Toma decisiones oportunas y basadas en análisis certeros.'),
  ('P3',  3,  'Liderazgo y Gestión',                 'Motiva e inspira a los miembros de la organización/equipo.'),
  ('P4',  4,  'Trabajo en Equipo y Comunicación',    'Se comunica de forma clara, asertiva y respetuosa.'),
  ('P5',  5,  'Trabajo en Equipo y Comunicación',    'Fomenta un ambiente colaborativo e inclusivo.'),
  ('P6',  6,  'Trabajo en Equipo y Comunicación',    'Resuelve conflictos de manera constructiva.'),
  ('P7',  7,  'Calidad y Orientación a Resultados',  'Demuestra un alto nivel de rigor y excelencia en sus entregables.'),
  ('P8',  8,  'Calidad y Orientación a Resultados',  'Cumple de manera constante con los KPIs e indicadores de su rol.'),
  ('P9',  9,  'Calidad y Orientación a Resultados',  'Optimiza recursos y procesos para mejorar la eficiencia operativa.'),
  ('P10', 10, 'Adaptabilidad e Innovación',          'Demuestra flexibilidad y resiliencia ante cambios en la operación.'),
  ('P11', 11, 'Adaptabilidad e Innovación',          'Aporta ideas y soluciones creativas ante problemas complejos.'),
  ('P12', 12, 'Adaptabilidad e Innovación',          'Muestra apertura al aprendizaje continuo y feedback.')
on conflict (codigo) do nothing;

-- Una fila por evaluador, como la hoja "Evaluaciones". Las doce respuestas
-- son obligatorias: la validación de la hoja no admite blancos.
create table evaluacion_360_respuestas (
  id               uuid primary key default gen_random_uuid(),
  area_id          uuid not null references areas (id) on delete restrict,
  consecutivo      bigint generated always as identity unique,   -- "EVAL-001"
  evaluado_nombre  text not null,
  evaluado_id      uuid references perfiles (id) on delete set null,
  evaluador_nombre text not null,
  evaluador_id     uuid references perfiles (id) on delete set null,
  cargo_id         uuid not null references evaluacion_cargos (id) on delete restrict,
  perspectiva      perspectiva_360 not null,
  fecha            date not null default current_date,
  comentarios      text,
  p1  numeric(3,2) not null check (p1  between 1 and 5),
  p2  numeric(3,2) not null check (p2  between 1 and 5),
  p3  numeric(3,2) not null check (p3  between 1 and 5),
  p4  numeric(3,2) not null check (p4  between 1 and 5),
  p5  numeric(3,2) not null check (p5  between 1 and 5),
  p6  numeric(3,2) not null check (p6  between 1 and 5),
  p7  numeric(3,2) not null check (p7  between 1 and 5),
  p8  numeric(3,2) not null check (p8  between 1 and 5),
  p9  numeric(3,2) not null check (p9  between 1 and 5),
  p10 numeric(3,2) not null check (p10 between 1 and 5),
  p11 numeric(3,2) not null check (p11 between 1 and 5),
  p12 numeric(3,2) not null check (p12 between 1 and 5),
  creado_por       uuid references perfiles (id) on delete set null,
  creado_en        timestamptz not null default now()
);
create index evaluacion_360_respuestas_cargo on evaluacion_360_respuestas (cargo_id, fecha);

-- ---------- 6. LAS FÓRMULAS, COMO VISTAS ----------
-- Formato por cargo (fila 24 de cada hoja):
--   D24/F24/H24/J24  = AVERAGE de la columna de calificación por perspectiva
--                      (AVERAGE ignora blancos: sin calificaciones → null)
--   K12..K23         = SUM(IF(ISNUMBER(x), x*peso, 0)) por criterio
--   K24              = AVERAGE(K12:K23) = suma de ponderados / 12
-- Ojo con la última: una perspectiva sin calificar aporta 0, no se omite.
-- Es exactamente lo que hace la hoja (por eso "Gerente de Operaciones" da
-- 0,475 con solo la autoevaluación rellena) y se replica tal cual; la
-- pantalla avisa cuando faltan perspectivas.
create or replace view v_evaluacion_resultados with (security_invoker = true) as
select e.id as evaluacion_id,
       nc.n as n_criterios,
       pr.autoevaluacion,
       pr.jefe_inmediato,
       pr.pares,
       pr.subordinados,
       coalesce(w.n_calificaciones, 0)::int as n_calificaciones,
       case when nc.n > 0 then coalesce(w.suma_ponderada, 0) / nc.n else null end as nota_final
  from evaluaciones e
  cross join lateral (
    select count(*)::int as n from evaluacion_criterios c where c.cargo_id = e.cargo_id
  ) nc
  cross join lateral (
    select avg(k.calificacion) filter (where k.perspectiva = 'autoevaluacion') as autoevaluacion,
           avg(k.calificacion) filter (where k.perspectiva = 'jefe_inmediato') as jefe_inmediato,
           avg(k.calificacion) filter (where k.perspectiva = 'pares')          as pares,
           avg(k.calificacion) filter (where k.perspectiva = 'subordinados')   as subordinados
      from evaluacion_calificaciones k
     where k.evaluacion_id = e.id
  ) pr
  cross join lateral (
    select sum(k.calificacion * p.peso) as suma_ponderada,
           count(*)                     as n_calificaciones
      from evaluacion_calificaciones k
      join evaluacion_pesos p on p.perspectiva = k.perspectiva
     where k.evaluacion_id = e.id
  ) w;

-- Matriz 360 (columnas H..M de la hoja "Evaluaciones"):
--   H = AVERAGE(P1..P12)   J = AVERAGE(P1..P3)   K = AVERAGE(P4..P6)
--   L = AVERAGE(P7..P9)    M = AVERAGE(P10..P12)
create or replace view v_evaluacion_360 with (security_invoker = true) as
select r.*,
       c.nombre as cargo_nombre,
       (r.p1 + r.p2 + r.p3 + r.p4 + r.p5 + r.p6 + r.p7 + r.p8 + r.p9 + r.p10 + r.p11 + r.p12) / 12 as promedio,
       (r.p1 + r.p2 + r.p3)    / 3 as liderazgo,
       (r.p4 + r.p5 + r.p6)    / 3 as trabajo_equipo,
       (r.p7 + r.p8 + r.p9)    / 3 as calidad_resultados,
       (r.p10 + r.p11 + r.p12) / 3 as adaptabilidad
  from evaluacion_360_respuestas r
  join evaluacion_cargos c on c.id = r.cargo_id;

-- ---------- 7. POLÍTICAS ----------
-- Catálogo: se ve si se tiene cualquier acceso al módulo. Solo el admin lo
-- modifica (los criterios vienen del Excel y cambiarlos es una decisión de
-- Gestión Humana, no de quien evalúa).
alter table evaluacion_pesos         enable row level security;
alter table evaluacion_cargos        enable row level security;
alter table evaluacion_criterios     enable row level security;
alter table evaluacion_360_preguntas enable row level security;

create policy evaluacion_pesos_select on evaluacion_pesos
  for select to authenticated
  using (public.soy_admin() or public.nivel_en_area(public.area_evaluacion()) is not null);
create policy evaluacion_pesos_admin_all on evaluacion_pesos
  for all to authenticated using (public.soy_admin()) with check (public.soy_admin());

create policy evaluacion_cargos_select on evaluacion_cargos
  for select to authenticated
  using (public.soy_admin() or public.nivel_en_area(public.area_evaluacion()) is not null);
create policy evaluacion_cargos_admin_all on evaluacion_cargos
  for all to authenticated using (public.soy_admin()) with check (public.soy_admin());

create policy evaluacion_criterios_select on evaluacion_criterios
  for select to authenticated
  using (public.soy_admin() or public.nivel_en_area(public.area_evaluacion()) is not null);
create policy evaluacion_criterios_admin_all on evaluacion_criterios
  for all to authenticated using (public.soy_admin()) with check (public.soy_admin());

create policy evaluacion_360_preguntas_select on evaluacion_360_preguntas
  for select to authenticated
  using (public.soy_admin() or public.nivel_en_area(public.area_evaluacion()) is not null);
create policy evaluacion_360_preguntas_admin_all on evaluacion_360_preguntas
  for all to authenticated using (public.soy_admin()) with check (public.soy_admin());

-- Evaluaciones: mismas reglas que los documentos, con una más: una
-- evaluación cerrada ya no se toca, salvo que un administrador la reabra.
-- Cerrarla sí es una modificación de un borrador, así que pasa el USING.
alter table evaluaciones enable row level security;

create policy evaluaciones_select on evaluaciones
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);

create policy evaluaciones_insert on evaluaciones
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_evaluacion()
    and creado_por = auth.uid()
  );

create policy evaluaciones_update on evaluaciones
  for update to authenticated
  using (
    public.nivel_en_area(area_id) >= 'edicion'
    and (estado = 'borrador' or public.soy_admin())
  )
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_evaluacion()
  );

create policy evaluaciones_delete on evaluaciones
  for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

-- Calificaciones y observaciones no tienen area_id: preguntan por su
-- evaluación. La subconsulta ya pasa por las políticas de `evaluaciones`,
-- así que quien no ve la evaluación tampoco ve sus notas.
alter table evaluacion_calificaciones enable row level security;
alter table evaluacion_observaciones  enable row level security;

create policy evaluacion_calificaciones_select on evaluacion_calificaciones
  for select to authenticated
  using (exists (select 1 from evaluaciones e where e.id = evaluacion_id));

create policy evaluacion_calificaciones_write on evaluacion_calificaciones
  for all to authenticated
  using (
    exists (
      select 1 from evaluaciones e
       where e.id = evaluacion_id
         and public.nivel_en_area(e.area_id) >= 'edicion'
         and (e.estado = 'borrador' or public.soy_admin())
    )
  )
  with check (
    exists (
      select 1 from evaluaciones e
       where e.id = evaluacion_id
         and public.nivel_en_area(e.area_id) >= 'edicion'
         and (e.estado = 'borrador' or public.soy_admin())
    )
  );

create policy evaluacion_observaciones_select on evaluacion_observaciones
  for select to authenticated
  using (exists (select 1 from evaluaciones e where e.id = evaluacion_id));

create policy evaluacion_observaciones_write on evaluacion_observaciones
  for all to authenticated
  using (
    exists (
      select 1 from evaluaciones e
       where e.id = evaluacion_id
         and public.nivel_en_area(e.area_id) >= 'edicion'
         and (e.estado = 'borrador' or public.soy_admin())
    )
  )
  with check (
    exists (
      select 1 from evaluaciones e
       where e.id = evaluacion_id
         and public.nivel_en_area(e.area_id) >= 'edicion'
         and (e.estado = 'borrador' or public.soy_admin())
    )
  );

-- Matriz 360: una respuesta es un hecho, como una PQR. Se crea y no se
-- edita; un administrador puede corregirla o quien tenga Total, borrarla.
alter table evaluacion_360_respuestas enable row level security;

create policy evaluacion_360_select on evaluacion_360_respuestas
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);

create policy evaluacion_360_insert on evaluacion_360_respuestas
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_evaluacion()
    and creado_por = auth.uid()
  );

create policy evaluacion_360_admin_update on evaluacion_360_respuestas
  for update to authenticated
  using (public.soy_admin()) with check (public.soy_admin());

create policy evaluacion_360_delete on evaluacion_360_respuestas
  for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

-- ---------- 8. SEMBRADO DE CARGOS Y CRITERIOS ----------
-- Sembrado generado desde EVALUACION_DE_DESEMPENO_360_VOZ360.xlsx
-- (hojas de cargo, filas 12..23; Dashboard, filas 7..21). No editar a mano:
-- si cambia el Excel, se vuelve a generar.
insert into evaluacion_cargos (codigo, nombre, area_departamento, hoja, etiqueta_evaluado, campana_defecto, orden) values
  ('CARGO-01', 'Director General', 'Dirección General', 'Director', 'Director', null, 1),
  ('CARGO-02', 'Gerente de Operaciones', 'Operaciones Call Center', 'Gerente de Operaciones', 'Nombre delGerente de Operación', null, 2),
  ('CARGO-03', 'Validación (BO)', 'Back Office & Validación', 'Validacion (Bo)', 'Validador', null, 3),
  ('CARGO-04', 'Data Marshal', 'WFM & Estadísticas', 'Data Marshal', 'Data Marshal', null, 4),
  ('CARGO-05', 'Team Leader', 'Operaciones Call Center', 'Team Leader', 'Team Leader', 'Claro Colombia', 5),
  ('CARGO-06', 'Asesores', 'Operaciones Frontline', 'Asesores', 'Asesor', 'Claro Colombia', 6),
  ('CARGO-07', 'Coordinador CX', 'Experiencia del Cliente & Calidad', 'Coordinador CX', ':Coordinador Cx', null, 7),
  ('CARGO-08', 'Analista de Calidad', 'Aseguramiento de Calidad', 'Analista de Calidad', 'Analista de Calidad', null, 8),
  ('CARGO-09', 'Formación', 'Capacitación & Training', 'Formación', 'Formador', null, 9),
  ('CARGO-10', 'Líder TI', 'Tecnología de la Información', 'Líder TI', 'Lider de TI', null, 10),
  ('CARGO-11', 'Soporte Técnico', 'Tecnología de la Información', 'Soporte Técnico', 'Nombre de Soporte Técnico', null, 11),
  ('CARGO-12', 'Gerente de Talento', 'Talento Humano & GH', 'Gerente de Talento', 'Gerente de Talento', null, 12),
  ('CARGO-13', 'Coordinador SST', 'Seguridad y Salud en el Trabajo', 'Coordinador SST', 'Coordinador de SST', null, 13),
  ('CARGO-14', 'Selección de Personal', 'Talento Humano & GH', 'Selección de Personal', 'Agente de selección de personal', null, 14),
  ('CARGO-15', 'Servicios Generales', 'Servicios Generales & Mantenimiento', 'Servicios Generales', 'Nombre de Auxiliar de Servicios Generales', null, 15)
on conflict (codigo) do nothing;

insert into evaluacion_criterios (cargo_id, orden, categoria, criterio)
select c.id, v.orden, v.categoria, v.criterio
  from (values
    ('CARGO-01', 1, 'Gestión Financiera y Rentabilidad (P&L)', 'Asegura el margen bruto/neto de la operación, optimiza el EBITDA y controla la desviación presupuestaria de las cuentas.'),
    ('CARGO-01', 2, 'Crecimiento y Fidelización de Cuentas', 'Garantiza la retención de clientes clave (Key Accounts), gestiona Renovaciones de Contrato (SLAs) e identifica oportunidades de upselling/cross-selling.'),
    ('CARGO-01', 3, 'Estrategia y Transformación Digital', 'Impulsa e implementa tecnologías emergentes (IA, omnicanalidad, automatización) para modernizar la entrega del servicio.'),
    ('CARGO-01', 4, 'Gobierno Operativo y Compliance', 'Vela por el cumplimiento de regulaciones normativas (PCI-DSS, protección de datos/GDPR, normativas laborales) y planes de continuidad del negocio (BCP).'),
    ('CARGO-01', 5, 'Dirección de Clima y Retención de Talento', 'Establece políticas para mitigar la rotación estructural (attrition) y consolida una cultura organizacional orientada al desempeño y bienestar.'),
    ('CARGO-01', 6, 'Visión Estratégica de Negocio', 'Traduce los objetivos corporativos en planes estratégicos de operación a mediano y largo plazo.'),
    ('CARGO-01', 7, 'Liderazgo Transformacional', 'Modela los valores corporativos, empodera al equipo gerencial a su cargo y sostiene una visión compartida de alto rendimiento.'),
    ('CARGO-01', 8, 'Negociación e Influencia de Alto Nivel', 'Maneja objeciones y acuerdos complejos con directivos de clientes externos, proveedores y juntas directivas.'),
    ('CARGO-01', 9, 'Pensamiento Crítico y Gestión de Crisis', 'Evalúa escenarios de alto riesgo para la compañía y toma decisiones contundentes bajo máxima presión e incertidumbre.'),
    ('CARGO-01', 10, 'Desarrollo de Ejecutivos y Sucesión', 'Identifica talento clave, forma a sus gerentes directos y estructura planes de sucesión robustos en la estructura directiva.'),
    ('CARGO-01', 11, 'Respaldo Institucional', 'Ofrece respaldo ejecutivo al equipo gerencial ante escalamientos complejos con clientes o crisis operativas'),
    ('CARGO-01', 12, 'Empoderamiento y Delegación', 'Otorga el nivel de autonomía necesario para tomar decisiones gerenciales sin caer en la microgestión'),
    ('CARGO-02', 1, 'Gestión de KPIs Operativos', 'Mantiene y optimiza las métricas clave de la operación (SLA, AHT, FCR, Abandonment Rate, CSAT).'),
    ('CARGO-02', 2, 'Estrategico y de cumplimiento', 'Logra cumplir con los ANS (Acuerdos de Nivel de Servicio) pactados para los diferentes períodos'),
    ('CARGO-02', 3, 'Planificación y Capacidad (WFM)', 'Garantiza una dimensión eficiente de personal ajustada a los picos de tráfico y dimensionamiento del servicio.'),
    ('CARGO-02', 4, 'Control de Calidad y Procesos', 'Asegura el cumplimiento de los estándares de calidad, guiones y normativas operativas vigentes.'),
    ('CARGO-02', 5, 'Gestión de Cliente Interno/Externo', 'Atiende los requerimientos del cliente contratante/cuenta y gestiona escalamientos de alto impacto.'),
    ('CARGO-02', 6, 'Optimización de Costos y Presupuesto', 'Administra eficientemente los recursos asignados (horas extra, rotación, licencias de software, infraestructura).'),
    ('CARGO-02', 7, 'Liderazgo y Gestión de Equipos', 'Inspira, orienta y moviliza a los supervisores y agentes hacia el logro de los objetivos comunes.'),
    ('CARGO-02', 8, 'Toma de Decisiones Bajo Presión', 'Mantiene la calma y resuelve incidencias operativas críticas de manera ágil y fundamentada.'),
    ('CARGO-02', 9, 'Pensamiento Analítico y Estadístico', 'Interpreta datos e informes operativos para convertirlos en planes de acción y mejora continua.'),
    ('CARGO-02', 10, 'Comunicación Asertiva y Negociación', 'Transmite directrices con claridad y gestiona desacuerdos de forma constructiva a todo nivel.'),
    ('CARGO-02', 11, 'Desarrollo de Talento', 'Promueve el crecimiento del equipo a su cargo (supervisores, analistas) mediante feedback y formación.'),
    ('CARGO-02', 12, 'Comunicación Asertiva y Negociación', 'Retroalimenta de manera respetuosa, clara y orientada a la mejora continua'),
    ('CARGO-03', 1, 'Verificación y Análisis de Documentación', 'Audita y valida que la información recopilada cumpla estrictamente con las políticas, listas de chequeo y normativas del servicio.'),
    ('CARGO-03', 2, 'Oportunidad y Tiempos de Respuesta (SLA)', 'Gestiona el volumen de casos asignados dentro de los tiempos límite pactados sin comprometer la calidad del análisis.'),
    ('CARGO-03', 3, 'Prevención de Riesgos y Detección de Fraude', 'Identifica inconsistencias, suplantaciones o anomalías documentales antes de autorizar o rechazar un trámite.'),
    ('CARGO-03', 4, 'Tipificación y Registro en Sistemas', 'Procesa y documenta de forma clara, detallada y correcta los estados de cada caso en los aplicativos del cliente/servicios (CRM, ERP).'),
    ('CARGO-03', 5, 'Gestión de Rechazos y Devoluciones', 'Justifica técnicamente los casos no aprobados y efectúa el retorno al agente comercial u operativo con el soporte correspondiente.'),
    ('CARGO-03', 6, 'Atención al Detalle y Minuciosidad', 'Detecta errores mínimos o discrepancias en grandes volúmenes de datos e información con alta precisión.'),
    ('CARGO-03', 7, 'Pensamiento Analítico y Criterio Técnico', 'Aplica la lógica y la normativa del servicio para resolver casos ambiguos o "zonas grises" sin improvisar.'),
    ('CARGO-03', 8, 'Orientación a la Calidad y Cumplimiento', 'Mantiene el apego a las políticas de seguridad de la información (habeas data, PCI, confidencialidad) y estándares de calidad.'),
    ('CARGO-03', 9, 'Gestión del Tiempo y Autonomía', 'Prioriza eficientemente la bandeja de entrada o cola de trabajo de manera sistemática y orientada a resultados.'),
    ('CARGO-03', 10, 'Comunicación Asertiva y Constructiva', 'Explica con claridad los motivos de rechazo o inconsistencias, facilitando la corrección pedagógica del trámite.'),
    ('CARGO-03', 11, 'Calidad Operativa (Accuracy)', 'Presenta un índice mínimo/nulo de errores o margen de reproceso en las auditorías de calidad de validación'),
    ('CARGO-03', 12, 'Confiabilidad', 'Muestra un alto criterio técnico para tomar decisiones en casos complejos sin requerir escalamientos innecesarios'),
    ('CARGO-04', 1, 'Monitoreo en Tiempo Real y Tráfico', 'Supervisa constantemente el flujo de llamadas/mallas operativas (SLA, ocupación, llamadas en espera, tiempo de abandono).'),
    ('CARGO-04', 2, 'Control de Adherencia y Ausentismo', 'Rastrea el cumplimiento de los horarios del personal (mallas de turnos, breaks, capacitaciones, desconexiones no programadas).'),
    ('CARGO-04', 3, 'Gestión de la Intradía (Re-dimensionamiento)', 'Aplica acciones de mitigación inmediatas (apertura/cierre de auxes, redistribución de habilidades/skills, horas extra) ante picos no planificados.'),
    ('CARGO-04', 4, 'Emisión de Alertas de Incidencias Técnicas', 'Detecta y escala de inmediato caídas de plataforma, fallas de conectividad o degradación de sistemas al área de IT/Help Desk.'),
    ('CARGO-04', 5, 'Elaboración de Reportes Intradía y Flash Reports', 'Genera y distribuye informes periódicos (horarios o diarios) de rendimiento con datos precisos para la toma de decisiones.'),
    ('CARGO-04', 6, 'Agilidad y Capacidad de Reacción', 'Toma decisiones rápidas y asertivas frente a cambios imprevistos en el volumen de tráfico o plantilla disponible.'),
    ('CARGO-04', 7, 'Pensamiento Analítico y Numérico', 'Interpreta métricas en tiempo real para prever tendencias en el comportamiento de la curva de llamadas del día.'),
    ('CARGO-04', 8, 'Comunicación Asertiva y Firmeza', 'Notifica con claridad y oportunidad los desvíos a los supervisores de operaciones sin generar fricciones, pero con firmeza.'),
    ('CARGO-04', 9, 'Atención al Detalle y Precisión', 'Mantiene un alto grado de exactitud al consolidar datos y registrar novedades de personal en las plataformas WFM.'),
    ('CARGO-04', 10, 'Trabajo Bajo Presión', 'Mantiene el control y la cabeza fría en momentos de alto tráfico, sobrepaso de colas o contingencias masivas.'),
    ('CARGO-04', 11, 'Sinergia con WFM', 'Retroalimenta a los analistas de Capacity/Scheduling sobre inconsistencias entre la proyección y la realidad del tráfico'),
    ('CARGO-04', 12, 'Resolución de Dudas', 'Aclara de forma pedagógica las discrepancias en los marcajes de tiempo o registros de adherencia del equipo'),
    ('CARGO-05', 1, 'Liderazgo y Gestión de Equipo', 'Motiva y lidera al equipo para mantener un clima laboral positivo y baja rotación.'),
    ('CARGO-05', 2, 'Liderazgo y Gestión de Equipo', 'Realiza retroalimentaciones (1-on-1) y coaching efectivo de manera periódica.'),
    ('CARGO-05', 3, 'Liderazgo y Gestión de Equipo', 'Gestiona y resuelve conflictos internos dentro del equipo de forma oportuna.'),
    ('CARGO-05', 4, 'Gestión Operativa y KPIs', 'Asegura el cumplimiento de métricas operativas de la campaña (SLA, AHT, CSAT, FCR, QA).'),
    ('CARGO-05', 5, 'Gestión Operativa y KPIs', 'Monitorea en tiempo real la adherencia, puntualidad y disponibilidad de los agentes.'),
    ('CARGO-05', 6, 'Gestión Operativa y KPIs', 'Analiza reportes operativos e identifica desviaciones para tomar acciones correctivas.'),
    ('CARGO-05', 7, 'Calidad y Formación', 'Identifica necesidades de capacitación y refuerza brechas del conocimiento en el equipo.'),
    ('CARGO-05', 8, 'Calidad y Formación', 'Garantiza la aplicación estricta de los procesos, scripts y políticas de la cuenta.'),
    ('CARGO-05', 9, 'Comunicación y Reporte', 'Mantiene comunicación efectiva y fluida con Operaciones, WFM y el Cliente/Account Manager.'),
    ('CARGO-05', 10, 'Comunicación y Reporte', 'Comunica reportes e informes de gestión con exactitud y dentro de los plazos.'),
    ('CARGO-05', 11, 'Resolución de Problemas', 'Maneja escalamientos complejos de clientes de manera profesional y eficiente.'),
    ('CARGO-05', 12, 'Resolución de Problemas', 'Propone e implementa iniciativas de mejora continua en la operación.'),
    ('CARGO-06', 1, 'Liderazgo y Gestión de Equipo', 'Motiva y lidera al equipo para mantener un clima laboral positivo y baja rotación.'),
    ('CARGO-06', 2, 'Liderazgo y Gestión de Equipo', 'Realiza retroalimentaciones (1-on-1) y coaching efectivo de manera periódica.'),
    ('CARGO-06', 3, 'Liderazgo y Gestión de Equipo', 'Gestiona y resuelve conflictos internos dentro del equipo de forma oportuna.'),
    ('CARGO-06', 4, 'Gestión Operativa y KPIs', 'Asegura el cumplimiento de métricas operativas de la campaña (SLA, AHT, CSAT, FCR, QA).'),
    ('CARGO-06', 5, 'Gestión Operativa y KPIs', 'Monitorea en tiempo real la adherencia, puntualidad y disponibilidad de los agentes.'),
    ('CARGO-06', 6, 'Gestión Operativa y KPIs', 'Analiza reportes operativos e identifica desviaciones para tomar acciones correctivas.'),
    ('CARGO-06', 7, 'Calidad y Formación', 'Identifica necesidades de capacitación y refuerza brechas del conocimiento en el equipo.'),
    ('CARGO-06', 8, 'Calidad y Formación', 'Garantiza la aplicación estricta de los procesos, scripts y políticas de la cuenta.'),
    ('CARGO-06', 9, 'Comunicación y Reporte', 'Mantiene comunicación efectiva y fluida con Operaciones, WFM y el Cliente/Account Manager.'),
    ('CARGO-06', 10, 'Comunicación y Reporte', 'Comunica reportes e informes de gestión con exactitud y dentro de los plazos.'),
    ('CARGO-06', 11, 'Resolución de Problemas', 'Maneja escalamientos complejos de clientes de manera profesional y eficiente.'),
    ('CARGO-06', 12, 'Resolución de Problemas', 'Propone e implementa iniciativas de mejora continua en la operación.'),
    ('CARGO-07', 1, 'Liderazgo y Gestión de Equipo', 'Gestiona adecuadamente el clima laboral, reduce la rotación voluntaria y desarrolla planes de carrera para los analistas/agentes de CX'),
    ('CARGO-07', 2, 'Liderazgo y Gestión de Equipo', 'Muestra un estilo de liderazgo constructivo que facilita la cooperación entre equipos operativos sin generar conflictos'),
    ('CARGO-07', 3, 'Liderazgo y Gestión de Equipo', 'Mantiene una escucha activa, reconoce logros, corrige con respeto y ayuda a crecer profesionalmente'),
    ('CARGO-07', 4, 'Gestión Operativa y KPIs', 'Mantiene un monitoreo continuo de las métricas clave e implementa acciones correctivas oportunas frente a las desviaciones'),
    ('CARGO-07', 5, 'Gestión Operativa y KPIs', 'Colabora activamente para que los indicadores del área no afecten negativamente el flujo ni los tiempos de respuesta de otras dependencias.'),
    ('CARGO-07', 6, 'Gestión Operativa y KPIs', 'proporciona visibilidad sobre indicadores individuales y grupales, explicándonos claramente cómo es el  impacto en el CSAT y FCR'),
    ('CARGO-07', 7, 'Calidad y Formación', 'Entrega reportes analíticos precisos y estructurados, proyectando tendencias y planes de acción preventivos en lugar de solo datos descriptivos'),
    ('CARGO-07', 8, 'Calidad y Formación', 'Asume con responsabilidad los casos que requieren negociación interdepartamental sin trasladar conflictos al cliente final'),
    ('CARGO-07', 9, 'Comunicación y Reporte', 'Adapta sus estrategias rápidamente ante cambios de scripts, metas, herramientas tecnológicas o requerimientos del cliente contratante'),
    ('CARGO-07', 10, 'Comunicación y Reporte', 'Comunica de forma transparente las políticas, metas y modificaciones operativas a todas las partes interesadas'),
    ('CARGO-07', 11, 'Resolución de Problemas', 'Contribuye a la solución conjunta de imprevistos operativos manteniendo la calma y proponiendo alternativas viables'),
    ('CARGO-07', 12, 'Resolución de Problemas', 'Identifica brechas críticas en la experiencia del cliente y propone mejoras estructurales que incrementan la fidelización y reducen quejas'),
    ('CARGO-08', 1, 'Auditoría y Monitoreo de Contactos', 'Monitorea interacciones (llamadas, chats, correos) según la matriz de evaluación y la muestra estadística exigida.'),
    ('CARGO-08', 2, 'Retroalimentación y Coaching (Feedback)', 'Realiza sesiones de coaching pedagógicas, oportunas y centradas en la mejora continua de la experiencia del usuario.'),
    ('CARGO-08', 3, 'Calibración de Criterios', 'Participa y lidera sesiones de calibración con operaciones y clientes para garantizar la homogeneidad en la medición.'),
    ('CARGO-08', 4, 'Análisis de Causas Raíz y Tendencias', 'Identifica fallas recurrentes (errores críticos y no críticos) para proponer planes de acción y refuerzos de formación.'),
    ('CARGO-08', 5, 'Registro y Actualización de Matrices', 'Mantiene actualizada la base de datos de evaluaciones con información clara, objetiva y alineada con las políticas de la cuenta.'),
    ('CARGO-08', 6, 'Objetividad y Criterio Técnico', 'Evalúa con imparcialidad, apego estricto a la matriz de calidad y neutralidad, sin sesgos personales.'),
    ('CARGO-08', 7, 'Comunicación Asertiva y Empatía', 'Transmite las oportunidades de mejora con respeto, tacto pedagógico y enfoque en el desarrollo del evaluado.'),
    ('CARGO-08', 8, 'Atención al Detalle y Escucha Activa', 'Capta elementos clave de la interacción (lenguaje, tono, cumplimiento normativo, solución) con alta precisión.'),
    ('CARGO-08', 9, 'Pensamiento Analítico', 'Correlaciona los resultados de calidad con los indicadores de negocio (CSAT, NPS, FCR, AHT) para hallar brechas.'),
    ('CARGO-08', 10, 'Adaptabilidad y Manejo de Objeciones', 'Gestiona debates de impugnación o apelaciones de notas con argumentos sólidos, madurez profesional y apertura.'),
    ('CARGO-08', 11, 'Sinergia con Formación', 'Retroalimenta al área de Capacitación/Training sobre los vacíos de conocimiento detectados en la operación'),
    ('CARGO-08', 12, 'Oportunidad', 'Entregué las retroalimentaciones dentro de los tiempos estipulados para garantizar que el agente corrigiera la falla a tiempo'),
    ('CARGO-09', 1, 'Ejecución de Planes de Formación y Curricula', 'Imparte los programas de capacitación inicial, actualización y re-entrenamiento respetando la intensidad horaria y contenidos.'),
    ('CARGO-09', 2, 'Gestión de la Curva de Aprendizaje (Nesting)', 'Acompaña la etapa de anidamiento/piso garantizando el logro de las métricas de entrada a la operación (KPIs operativos).'),
    ('CARGO-09', 3, 'Diseño e Innovación de Material Didáctico', 'Actualiza y crea contenidos, evaluaciones, guías de estudio y simulaciones alineadas con los cambios operativos.'),
    ('CARGO-09', 4, 'Evaluación y Medición del Conocimiento', 'Aplica instrumentos de evaluación teóricos y prácticos para certificar las competencias del personal entrenado.'),
    ('CARGO-09', 5, 'Mitigación de la Deserción Temprana (Early Attrition)', 'Mantiene la motivación y cohesión de los grupos en formación para reducir la rotación durante el período de entrenamiento.'),
    ('CARGO-09', 6, 'Dominio Técnico del Servicio y Procesos', 'Demuestra conocimiento profundo de las herramientas, aplicativos, guiones y normativas de la cuenta.'),
    ('CARGO-09', 7, 'Facilitación Pedagógica y Andragogía', 'Utiliza técnicas de enseñanza efectivas para adultos, haciendo dinámicos, comprensibles y aplicables los contenidos.'),
    ('CARGO-09', 8, 'Manejo de Grupos y Control del Aula', 'Mantiene la disciplina, participación activa, puntualidad y clima de respeto en el entorno de aprendizaje (presencial o virtual).'),
    ('CARGO-09', 9, 'Comunicación Asertiva y Expresión Oral', 'Transmite conceptos con claridad, excelente modulación, fluidez verbal, lenguaje corporal positivo y escucha activa.'),
    ('CARGO-09', 10, 'Empatía y Orientación al Alumno', 'Muestra paciencia y disposición para identificar estilos de aprendizaje individuales y apoyar a quienes presentan rezagos.'),
    ('CARGO-09', 11, 'Compartir Mejores Prácticas', 'Aporta dinámicas, simulaciones o metodologías innovadoras que enriquecen el trabajo del equipo de capacitación'),
    ('CARGO-09', 12, 'Preparación para la Operación', 'Los conocimientos y simulaciones brindados en el aula fueron útiles para enfrentar las situaciones reales del piso'),
    ('CARGO-10', 1, 'Continuidad del Servicio y Disponibilidad (Uptime)', 'Asegura la máxima disponibilidad de la infraestructura de telecomunicaciones (VDI, VOIP, PBX, canales de red y plataformas del cliente).'),
    ('CARGO-10', 2, 'Gestión de Mesa de Ayuda e Incidentes (ITSM)', 'Garantiza que las solicitudes de soporte técnico de los agentes y áreas administrativas se resuelvan dentro de los SLAs establecidos.'),
    ('CARGO-10', 3, 'Seguridad de la Información y Cumplimiento', 'Implementa y supervisa protocolos de ciberseguridad, gestión de accesos/roles, políticas de respaldo (backups) y normativas (PCI-DSS, ISO 27001).'),
    ('CARGO-10', 4, 'Planes de Continuidad del Negocio (BCP / DR)', 'Mantiene actualizados y probados los planes de recuperación ante desastres para garantizar la contingencia de la operación ante caídas masivas.'),
    ('CARGO-10', 5, 'Gestión de Proveedores e Inventario Tecnológico', 'Administra las licencias de software, el ciclo de vida del hardware/diademas y las relaciones operativas con proveedores de canales e infraestructura.'),
    ('CARGO-10', 6, 'Resolución de Problemas y Gestión de Crisis', 'Mantiene el control, actúa con rapidez y aplica metodologías de análisis de causa raíz durante caídas críticas del sistema.'),
    ('CARGO-10', 7, 'Liderazgo Técnico y Desarrollo de Equipo', 'Guía, capacita y empodera al equipo informático (Soporte/Redes), fomentando la autonomía y la transferencia de conocimiento.'),
    ('CARGO-10', 8, 'Orientación al Cliente Interno y Servicio', 'Entiende las urgencias de la operación del Call Center y brinda respuestas con sentido de oportunidad, empatía y efectividad.'),
    ('CARGO-10', 9, 'Pensamiento Estratégico e Innovación', 'Propone e implementa mejoras en la arquitectura tecnológica para optimizar costos, automatizar tareas o mejorar la experiencia del agente.'),
    ('CARGO-10', 10, 'Comunicación Técnica y Asertividad', 'Traduce conceptos informáticos complejos a un lenguaje comprensible para la alta dirección y los líderes operativos sin perder precisión.'),
    ('CARGO-10', 11, 'Cumplimiento de SLAs y Métricas', 'Superó los indicadores globales de disponibilidad de plataforma y tiempo de resolución de tickets de TI'),
    ('CARGO-10', 12, 'Visión de Futuro', 'Demuestra capacidad para implementar nuevas tecnologías que mantengan al Call Center competitivo y preparado para escalar'),
    ('CARGO-11', 1, 'Atención y Solución de Tickets (Mesa de Ayuda)', 'Diagnostica, gestiona y resuelve las incidencias de hardware y software notificadas dentro de los SLAs establecidos.'),
    ('CARGO-11', 2, 'Alistamiento y Mantenimiento de Puestos de Trabajo', 'Configura, instala y mantiene en estado óptimo las estaciones de trabajo (PC, telefonía/softphone, diademas, aplicativos del servicio).'),
    ('CARGO-11', 3, 'Gestión de Accesos, Permisos y Credenciales', 'Asigna, modifica y restablece accesos y usuarios en las distintas plataformas respetando las políticas de seguridad de la información.'),
    ('CARGO-11', 4, 'Documentación y Cierre de Incidentes (ITSM)', 'Tipifica, registra y documenta adecuadamente las soluciones aplicadas en el sistema de tickets de la compañía para alimentar la base de conocimiento.'),
    ('CARGO-11', 5, 'Control e Inventario de Hardware y Periféricos', 'Controla el inventario de activos de TI (asignación y devolución de diademas, monitores, CPU, cables) bajo su custodia.'),
    ('CARGO-11', 6, 'Orientación al Cliente Interno y Servicio', 'Muestra empatía, predisposición y excelente trato hacia el agente o usuario que presenta una falla en su puesto de trabajo.'),
    ('CARGO-11', 7, 'Pensamiento Analítico y Diagnóstico de Fallas', 'Identifica rápidamente la causa raíz de un problema técnico de forma metodológica sin improvisar.'),
    ('CARGO-11', 8, 'Agilidad y Sentido de Urgencia', 'Prioriza las incidencias según su nivel de impacto operativo para minimizar el tiempo ocioso del personal en piso.'),
    ('CARGO-11', 9, 'Apego a Normas de Ciberseguridad', 'Aplica rigurosamente las políticas de seguridad informática (manejo de claves, bloqueos de puertos USB, accesos no autorizados).'),
    ('CARGO-11', 10, 'Trabajo en Equipo y Comunicación Técnica', 'Explica de forma clara e instructiva la solución aplicada al usuario y se coordina con sus pares para resolver fallas masivas.'),
    ('CARGO-11', 11, 'Control de Activos', 'Asegura el registro riguroso de las entregas y devoluciones de equipos y periféricos en la operación'),
    ('CARGO-11', 12, 'Mantenimiento del Área', 'Mantiene en orden el taller de sistemas, el inventario de repuestos y las herramientas de trabajo compartidas'),
    ('CARGO-12', 1, 'Atracción y Selección Masiva de Talento', 'Garantiza la cobertura oportuna de las mallas y convocatorias (Waves) de la operación bajo perfiles idóneos y en el tiempo requerido (Time-to-Fill).'),
    ('CARGO-12', 2, 'Estrategias de Contención de la Rotación (Attrition)', 'Diseña e implementa programas eficaces de fidelización y permanencia para mitigar la rotación voluntaria y temprana en las campañas.'),
    ('CARGO-12', 3, 'Gestión del Clima, Cultura y Bienestar', 'Lidera las metodologías de medición del clima organizacional (eNPS/Great Place to Work) e impulsa planes de acción de alto impacto.'),
    ('CARGO-12', 4, 'Relaciones Laborales y Cumplimiento Normativo', 'Vela por el cumplimiento estricto de la legislación laboral, régimen disciplinario, SST y minimización de riesgos jurídicos.'),
    ('CARGO-12', 5, 'Gestión Estratégica del Desempeño y Sucesión', 'Administra los ciclos de evaluación de desempeño, planes de carrera (Fast Track de agentes a supervisores) y desarrollo de competencias directivas.'),
    ('CARGO-12', 6, 'Visión de Negocio y Entendimiento Operativo', 'Comprende las dinámicas de facturación, KPIs de Call Center (SLA, ocupación, margen) y alinea la estrategia de GH con los objetivos comerciales.'),
    ('CARGO-12', 7, 'Liderazgo Empático y Gestión de Equipos', 'Inspira, guía y fortalece el desarrollo del equipo de Gestión Humana (Selección, Bienestar, Nómina, SST, Formación).'),
    ('CARGO-12', 8, 'Toma de Decisiones y Gestión de Crisis', 'Aborda contingencias colectivas, conflictos laborales o cambios estructurales con celeridad, aplomo y equidad.'),
    ('CARGO-12', 9, 'Resolución de Conflictos', 'Facilita espacios de mediación constructivos frente a situaciones disciplinarias o de clima en las campañas'),
    ('CARGO-12', 10, 'Innovación y Transformación en GH', 'Promueve la automatización de procesos (People Analytics, IA en reclutamiento, autoservicio del empleado) para optimizar la experiencia interna.'),
    ('CARGO-12', 11, 'Comunicación y Flujo', 'Informa oportunamente las novedades de novedades de personal, cambios en políticas o procesos de bienestar'),
    ('CARGO-12', 12, 'Cumplimiento Legal', 'Aseguré una gestión libre de contingencias o multas laborales, garantizando un ambiente seguro y normativo'),
    ('CARGO-13', 1, 'Diseño y Ejecución del SG-SST', 'Diseña, ejecuta y actualiza el Plan Anual del Sistema de Gestión de SST de acuerdo con la normatividad legal vigente y políticas de la empresa.'),
    ('CARGO-13', 2, 'Gestión de Riesgos Biomecánicos y Ergonómicos', 'Realiza inspecciones ergonómicas a los puestos de trabajo (sillas, diademas, pantallas) e implementa programas de pausas activas y cuidado osteomuscular.'),
    ('CARGO-13', 3, 'Prevención del Riesgo Psicosocial y Salud Mental', 'Coordina la aplicación de la batería de riesgo psicosocial e implementa planes de acción junto a Gestión Humana para mitigar el estrés laboral.'),
    ('CARGO-13', 4, 'Investigación de Accidentes y Control de Ausentismo', 'Investiga accidentes/incidentes de trabajo, reporta ante la ARL/entidades reguladoras y hace seguimiento a la reincorporación laboral y ausentismo.'),
    ('CARGO-13', 5, 'Preparación ante Emergencias y Brigadas', 'Conformación, capacitación y liderazgo de la brigada de emergencias, planes de evacuación y realización de simulacros periódicos.'),
    ('CARGO-13', 6, 'Dominio Normativo y Legal de SST', 'Conoce y aplica rigurosamente las leyes, decretos y estándares mínimos de seguridad y salud ocupacional aplicables al sector.'),
    ('CARGO-13', 7, 'Comunicación Asertiva y Sensibilización', 'Transmite la importancia del autocuidado y las normas de SST de manera clara, persuasiva y pedagógica a todos los niveles de la empresa.'),
    ('CARGO-13', 8, 'Pensamiento Analítico y Estadístico', 'Analiza indicadores de accidentalidad, morbilidad y ausentismo para convertirlos en acciones preventivas y correctivas.'),
    ('CARGO-13', 9, 'Gestión de Contingencias y Liderazgo de Crisis', 'Mantiene la calma, el criterio técnico y el control operativo durante emergencias médicas, evacuaciones o crisis de salud en piso.'),
    ('CARGO-13', 10, 'Orientación al Servicio e Interacción Humana', 'Demuestra empatía, escucha activa y receptividad para atender las novedades médicas o condiciones de salud manifestadas por los colaboradores.'),
    ('CARGO-13', 11, 'Cumplimiento Legal y Auditorías', 'Asegura un porcentaje alto de cumplimiento en los estándares mínimos del SG-SST y obtiene resultados óptimos en auditorías'),
    ('CARGO-13', 12, 'Gestión de Entidades Externas', 'Administra eficientemente la relación y los recursos con la ARL, EPS y entes reguladores de trabajo'),
    ('CARGO-14', 1, 'Atracción de Talento y Reclutamiento Masivo', 'Diseña y ejecuta estrategias efectivas de convocatoria (portales, redes, ferias) para mantener un flujo continuo de candidatos según el perfil de cada cuenta.'),
    ('CARGO-14', 2, 'Evaluación y Perfilamiento de Candidatos', 'Aplica entrevistas por competencias, pruebas psicotécnicas, pruebas de idioma (si aplica) y simulaciones de rol con objetividad y precisión.'),
    ('CARGO-14', 3, 'Cumplimiento de Tiempos de Cobertura (Time-to-Fill)', 'Entrega las olas de contratación (waves) completas en la fecha y hora acordadas con el área de Capacitación y Operaciones.'),
    ('CARGO-14', 4, 'Mitigación de la Deserción Temprana (Early Attrition)', 'Garantiza la alineación de expectativas del candidato (horarios, salario, condiciones) para evitar bajas en las etapas de Formación o Anidamiento.'),
    ('CARGO-14', 5, 'Gestión Documental y Contratación (Trazabilidad)', 'Recopila y verifica la autenticidad de los documentos requeridos para la contratación, asegurando la trazabilidad en el sistema de Gestión Humana (ATS).'),
    ('CARGO-14', 6, 'Capacidad de Evaluación y Criterio Psicoboral', 'Identifica rápidamente rasgos de personalidad, competencias blandas y estabilidad laboral para predecir el desempeño en piso de Call Center.'),
    ('CARGO-14', 7, 'Orientación a Resultados y Trabajo bajo Presión', 'Mantiene la productividad, efectividad y serenidad ante volúmenes altos de citación y entregas de personal de urgencia.'),
    ('CARGO-14', 8, 'Comunicación Asertiva y Employer Branding', 'Proyecta una imagen profesional de la empresa, comunicándose con claridad, respeto y transparencia con los candidatos en todo el proceso.'),
    ('CARGO-14', 9, 'Flexibilidad y Adaptabilidad al Cambio', 'Ajusta las estrategias de reclutamiento ante cambios repentinos en los perfiles, aperturas de nuevas campañas o picos inesperados.'),
    ('CARGO-14', 10, 'Organización y Manejo del Tiempo', 'Prioriza las etapas del proceso de selección de manera metódica, asegurando el avance fluido del embudo de contratación (funnel).'),
    ('CARGO-14', 11, 'Clima de Trabajo', 'Mantiene una actitud colaborativa, respetuosa y proactiva dentro de la mesa de Gestión Humana'),
    ('CARGO-14', 12, 'Soporte y Respuesta', 'Responde con agilidad y buena disposición las inquietudes presentadas en el proceso de incorporación'),
    ('CARGO-15', 1, 'Aseo y Desinfección de Puestos Operativos', 'Ejecuta la limpieza, sanitización y desinfección metódica de los puestos de trabajo (escritorios, PC, periféricos, diademas, sillas) entre turnos o mallas.'),
    ('CARGO-15', 2, 'Mantenimiento Higiénico de Zonas Comunes', 'Mantiene en perfecto estado de limpieza e higiene las áreas de alto tráfico (baños, comedores/cafeterías, pasillos, salas de reunión, recepción).'),
    ('CARGO-15', 3, 'Gestión y Control de Insumos de Aseo', 'Controla, dosifica y reporta oportunamente el stock de elementos de aseo e higiene (jabón, papel higiénico, desinfectante, toallas de papel, bolsas).'),
    ('CARGO-15', 4, 'Manejo Adecuado de Residuos (Reciclaje y SST)', 'Clasifica, recolecta y dispone los residuos sólidos y líquidos respetando los puntos ecológicos, rutas de evacuación de basuras y normas de bioseguridad.'),
    ('CARGO-15', 5, 'Atención a Eventos y Contingencias', 'Atiende con oportunidad y eficacia los derrames, incidentes de limpieza o alistamiento de salas para reuniones y eventos especiales.'),
    ('CARGO-15', 6, 'Orientación al Servicio Interno y Amabilidad', 'Muestra siempre una actitud respetuosa, cordial, paciente y dispuesta a colaborar con el personal de la empresa.'),
    ('CARGO-15', 7, 'Atención al Detalle y Pulcritud', 'Realiza las labores de aseo con minuciosidad, asegurando que no queden rincones o herramientas sin limpiar o desinfectar.'),
    ('CARGO-15', 8, 'Responsabilidad y Cuidado de Recursos', 'Utiliza de forma racional y eficiente los insumos de aseo y cuida las herramientas de trabajo (maquinaria, mopas, carros de aseo).'),
    ('CARGO-15', 9, 'Apego a Normas de SST y Autocuidado', 'Utiliza rigurosamente sus Elementos de Protección Personal (EPP: guantes, tapabocas, calzado antideslizante) y señala pisos húmedos.'),
    ('CARGO-15', 10, 'Agilidad y Sentido de Urgencia', 'Responde rápidamente ante solicitudes de limpieza imprevistas en la operación para evitar interrupciones o accidentes.'),
    ('CARGO-15', 11, 'Relaciones Interpersonales', 'Mantiene una convivencia armónica, respetuosa y de apoyo mutuo con el equipo de trabajo'),
    ('CARGO-15', 12, 'Puntualidad y Compromiso', 'Cumple con sus horarios de trabajo, cronogramas de aseo y demuestra compromiso con la presentación de la empresa')
  ) as v (codigo, orden, categoria, criterio)
  join evaluacion_cargos c on c.codigo = v.codigo
on conflict (cargo_id, orden) do nothing;

-- ---------- 9. QUIÉN ENTRA ----------
-- Lo pedido: lo ven Gerencia, Gestión Humana, Selección y TI; interactúan
-- los administradores y Selección. El rol de Selección pasa a editor
-- porque el rol lector tiene su techo en descarga y "Edición" no haría
-- efecto (ver docs/permisos.md, "El rol global es el techo").
-- Si alguna de las cuentas no existe todavía, su fila simplemente no se
-- inserta: se concede después desde Administración → Permisos.
insert into permisos_area (usuario_id, area_id, nivel)
select u.id, public.area_evaluacion(), v.nivel::nivel_acceso
  from (values
    ('gerencia@voz360.co',      'lectura'),
    ('gestionhumana@voz360.co', 'lectura'),
    ('seleccion@voz360.co',     'edicion')
  ) as v (email, nivel)
  join auth.users u on lower(u.email) = v.email
on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;

update perfiles
   set rol = 'editor'
 where rol = 'lector'
   and id in (select id from auth.users where lower(email) = 'seleccion@voz360.co');

comment on column areas.modulo is
  'Null = área de documentos. ''evaluacion'' = el cuadro abre el módulo de evaluación de desempeño en lugar de una lista de documentos.';
comment on table evaluaciones is
  'Formato de evaluación de desempeño por cargo (una hoja del Excel). Las fórmulas están en v_evaluacion_resultados.';
comment on table evaluacion_360_respuestas is
  'Matriz 360: una fila por evaluador, 12 preguntas en 4 competencias (hoja "Evaluaciones" del Excel). Fórmulas en v_evaluacion_360.';
