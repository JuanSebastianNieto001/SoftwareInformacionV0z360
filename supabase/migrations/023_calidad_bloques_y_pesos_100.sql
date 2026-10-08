-- =====================================================================
-- CALIDAD: BLOQUES DE LA MATRIZ Y PESOS QUE SUMAN 100 (MTZ-OPE-001)
-- =====================================================================
-- La matriz oficial MTZ-OPE-001 se organiza en BLOQUES que suman 100 %:
-- Presentación (15 %), Comercial (45 %) y Legalización y gestión
-- operativa (40 %). Cada bloque se divide en ítems y estos en pautas.
--
-- La 020 cargó las pautas tal cual venían en la hoja (95 %) porque el
-- bloque operativo solo tiene 35 % en pautas medibles; el resto son
-- críticos de tolerancia cero. Por indicación de Calidad los pesos
-- deben sumar 100 %, así que las 8 pautas de Legalización se reescalan
-- de 35 % a 40 % (×8/7, redondeado a un decimal, total exacto 40.0).
--
-- Los errores críticos siguen en 0 % porque "pesan" de otra forma: si
-- se marca uno, la nota queda en 0 %.
-- =====================================================================

-- ---------- 1. COLUMNA DE BLOQUE ----------
alter table calidad_items
  add column if not exists bloque text check (char_length(bloque) <= 80);
comment on column calidad_items.bloque is
  'Bloque de la matriz oficial (Presentación 15 %, Comercial 45 %, Legalización y gestión operativa 40 %). Agrupa las categorías.';

-- ---------- 2. RESTAURAR EL CANDADO DE 100 % ----------
-- Vuelve a exigir suma = 100: los bloques oficiales suman 100 %.
create or replace function public.calidad_pesos_suman_cien(m uuid)
returns boolean language sql stable as $$
  select abs(coalesce(sum(peso), 0) - 100) < 0.01
    from calidad_items where matriz_id = m and activo and not es_fatal
$$;

-- Idéntico al de la 020; solo cambia el mensaje del primer raise, que
-- vuelve a hablar de "suma 100".
create or replace function public.calidad_publicacion_valida()
returns trigger language plpgsql as $$
begin
  if new.estado = 'publicada' and old.estado = 'borrador' then
    if not public.calidad_pesos_suman_cien(new.matriz_id) then
      raise exception 'La pauta debe sumar 100 %% en sus pesos; corrígela antes de publicar';
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

-- ---------- 3. PESOS REESCALADOS Y BLOQUES POR ÍTEM ----------
-- Solo cambian las 8 pautas de Legalización (órdenes 15 a 22): pasan de
-- sumar 35 a sumar 40. Presentación (15) y Comercial (45) quedan igual.
-- El bloque se rellena para los 32 ítems, críticos incluidos.
do $$
declare
  m uuid;
begin
  select id into m from calidad_matrices order by creado_en limit 1;
  if m is null then
    raise notice 'No hay matriz de calidad; no se cargan bloques ni pesos.';
    return;
  end if;

  -- Pesos de Legalización reescalados a 40 % (×8/7, un decimal).
  update calidad_items set peso = 4.6 where matriz_id = m and orden = 15 and not es_fatal;
  update calidad_items set peso = 5.7 where matriz_id = m and orden = 16 and not es_fatal;
  update calidad_items set peso = 5.7 where matriz_id = m and orden = 17 and not es_fatal;
  update calidad_items set peso = 5.7 where matriz_id = m and orden = 18 and not es_fatal;
  update calidad_items set peso = 5.7 where matriz_id = m and orden = 19 and not es_fatal;
  update calidad_items set peso = 4.6 where matriz_id = m and orden = 20 and not es_fatal;
  update calidad_items set peso = 4.6 where matriz_id = m and orden = 21 and not es_fatal;
  update calidad_items set peso = 3.4 where matriz_id = m and orden = 22 and not es_fatal;

  -- Bloque de cada ítem de la matriz oficial.
  update calidad_items set bloque = 'Presentación'
   where matriz_id = m and orden = any(array[1, 2, 3, 23, 24, 25]);
  update calidad_items set bloque = 'Comercial'
   where matriz_id = m and orden = any(array[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 26, 27, 28, 32]);
  update calidad_items set bloque = 'Legalización y gestión operativa'
   where matriz_id = m and orden = any(array[15, 16, 17, 18, 19, 20, 21, 22, 29, 30, 31]);

  -- Verificación: con el reescalado, las pautas medibles suman 100.
  if (select round(sum(peso), 2) from calidad_items
       where matriz_id = m and activo and not es_fatal) <> 100.00 then
    raise exception 'Los pesos no quedaron en 100';
  end if;
end $$;
