-- =====================================================================
-- CALIDAD: LOS PESOS REALES DE LA MATRIZ (MTZ-OPE-001)
-- =====================================================================
-- Cuando se construyó el módulo (016) la matriz con los pesos no estaba
-- compartida y los 23 ítems no críticos quedaron con peso igual (~4.35 %).
-- Ya con la hoja "Matriz de Calidad" a la vista, se cargan los pesos
-- oficiales por ítem. Los nueve errores críticos siguen en 0 % (anulan la
-- nota, no suman).
--
-- La nota se normaliza sobre lo aplicable:
--   nota_sin_ic = Σ peso(cumple) / Σ peso(no "no aplica") × 100
-- así que la escala absoluta de los pesos no cambia el resultado; lo que
-- cambia es el PESO RELATIVO de cada ítem, que ahora es el de la matriz.
--
-- Los pesos oficiales suman 95 %, no 100 %: el bloque "Legalización
-- comercial / Gestión operativa (40 %)" solo tiene 35 % en ítems medibles
-- (ATDP) y 5 % en ítems que son críticos de tolerancia cero. Por eso el
-- candado de publicación se afloja: deja de exigir "suma = 100" y pasa a
-- exigir "suma positiva y ≤ 100", que es lo que de verdad protege contra
-- una matriz mal configurada. La normalización hace el resto.
-- =====================================================================

-- ---------- 1. AFLOJAR EL CANDADO ----------
create or replace function public.calidad_pesos_suman_cien(m uuid)
returns boolean language sql stable as $$
  -- El nombre se conserva por el trigger que la usa. Hoy comprueba que los
  -- pesos de los ítems activos no críticos sean positivos y no pasen de 100;
  -- la nota se normaliza sobre lo aplicable, así que no tienen que sumar 100.
  select coalesce(sum(peso), 0) > 0 and coalesce(sum(peso), 0) <= 100.01
    from calidad_items where matriz_id = m and activo and not es_fatal
$$;

-- Idéntico al de la 016, con dos cambios: el mensaje ya no habla de "suma 100"
-- y se mantiene todo lo demás (sello de publicación e inmutabilidad).
create or replace function public.calidad_publicacion_valida()
returns trigger language plpgsql as $$
begin
  if new.estado = 'publicada' and old.estado = 'borrador' then
    if not public.calidad_pesos_suman_cien(new.matriz_id) then
      raise exception 'Los pesos de la pauta deben ser positivos y no superar 100 %%; corrígela antes de publicar';
    end if;
    if exists (
      select 1 from calidad_items i
       where i.matriz_id = new.matriz_id and i.activo
         and not exists (select 1 from calidad_respuestas r where r.evaluacion_id = new.id and r.item_id = i.id)
    ) then
      raise exception 'Faltan ítems por responder';
    end if;
    new.publicada_en := now();
  end if;
  if old.estado = 'publicada' and (new.matriz_id <> old.matriz_id or new.asesor_id <> old.asesor_id) then
    raise exception 'Una evaluación publicada no cambia de matriz ni de asesor';
  end if;
  return new;
end $$;

-- ---------- 2. PESOS OFICIALES POR ÍTEM ----------
-- Se emparejan por `orden` dentro de la única matriz. Los valores son los de
-- la columna "Calificación" de la hoja Matriz (bloque entre paréntesis).
do $$
declare
  m uuid;
  pesos numeric[] := array[
    4.0,  -- 1  Presentación · saludo y despedida
    4.5,  -- 2  Presentación · escucha activa y empatía
    3.0,  -- 3  Presentación · tratamiento de la indiferencia
    3.5,  -- 4  Sondeo · preguntas concisas y neutrales
    4.5,  -- 5  Sondeo · sondeo abierto a necesidades
    3.0,  -- 6  Sondeo · continuidad por WhatsApp con ok del cliente
    4.5,  -- 7  Oferta · características claras y correctas
    5.0,  -- 8  Oferta · transforma características en beneficios
    3.5,  -- 9  Oferta · informa SVA
    5.0,  -- 10 Rebate · reconoce escepticismo y da pruebas
    4.0,  -- 11 Rebate · confirma la necesidad y aclara
    5.0,  -- 12 Rebate · verifica la aceptación tras la objeción
    5.0,  -- 13 Cierre · aceptación expresa (Sí/No)
    2.0,  -- 14 Cierre · recuerda los canales de atención
    4.0,  -- 15 Legalización · solo nombre y ciudad antes de la ATDP
    5.0,  -- 16 Legalización · guion correspondiente
    5.0,  -- 17 Legalización · datos sensibles solo tras aceptación
    5.0,  -- 18 Legalización · digitación solo tras la ATDP
    5.0,  -- 19 Legalización · centrales de riesgo solo tras autorización
    4.0,  -- 20 Legalización · captura del correo electrónico
    4.0,  -- 21 Legalización · grabación completa de la interacción
    3.0,  -- 22 Legalización · motivo de la venta grabada
    3.5   -- 23 Presentación · maneja el hold y los tiempos de espera
  ];
  i int;
begin
  select id into m from calidad_matrices order by creado_en limit 1;
  if m is null then
    raise notice 'No hay matriz de calidad; no se cargan pesos.';
    return;
  end if;
  for i in 1 .. array_length(pesos, 1) loop
    update calidad_items set peso = pesos[i]
     where matriz_id = m and orden = i and not es_fatal;
  end loop;
  -- Los nueve críticos, por si alguno quedó con peso: siempre 0.
  update calidad_items set peso = 0 where matriz_id = m and es_fatal and peso <> 0;
end $$;
