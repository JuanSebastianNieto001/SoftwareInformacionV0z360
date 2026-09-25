-- =====================================================================
-- EL NIVEL "TOTAL" ENTRA EN VIGOR
-- =====================================================================
-- Segunda mitad de 008.
--
-- El cambio importante no es la política de borrado, sino el paso de "="
-- a ">=" en todas las demás. Con "=" el nivel Total habría perdido la
-- edición al ganar el borrado, porque 'total' no es igual a 'edicion'.
-- Como la escalera está ordenada, ">= 'edicion'" significa "edita, y lo
-- que venga por encima también".
-- =====================================================================

-- ---------- 1. VER ----------
drop policy if exists documentos_select on documentos;
create policy documentos_select on documentos
  for select to authenticated
  using (
    case
      -- De Edición hacia arriba se ve siempre, para programar y renovar.
      when public.nivel_en_area(area_id) >= 'edicion' then true
      -- Vista y Descarga: solo dentro de la ventana de vigencia.
      when public.nivel_en_area(area_id) is not null then
        purgado_en is null
        and vigente_desde <= now()
        and (vigente_hasta is null or vigente_hasta > now())
      else false
    end
  );

-- ---------- 2. CREAR Y EDITAR ----------
drop policy if exists documentos_insert on documentos;
create policy documentos_insert on documentos
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and subido_por = auth.uid()
    and storage_path like (area_id::text || '/%')
  );

drop policy if exists documentos_update on documentos;
create policy documentos_update on documentos
  for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and storage_path like (area_id::text || '/%')
  );

-- ---------- 3. ELIMINAR ----------
-- Lo que antes solo podía el administrador. Se concede por área, nunca de
-- forma global: tener Total en Formatos no da para borrar Divulgaciones.
drop policy if exists documentos_delete on documentos;
create policy documentos_delete on documentos
  for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

-- ---------- 4. LOS MISMOS PERMISOS SOBRE EL ARCHIVO ----------
-- Si la fila se puede borrar y el binario no, queda un archivo huérfano
-- ocupando espacio que ya nadie ve. Las dos políticas van juntas.
drop policy if exists storage_insert_documentos on storage.objects;
create policy storage_insert_documentos on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and public.nivel_en_area(public.uuid_seguro((storage.foldername(name))[1])) >= 'edicion'
  );

drop policy if exists storage_update_documentos on storage.objects;
create policy storage_update_documentos on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documentos'
    and public.nivel_en_area(public.uuid_seguro((storage.foldername(name))[1])) >= 'edicion'
  );

drop policy if exists storage_delete_documentos on storage.objects;
create policy storage_delete_documentos on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos'
    and (
      public.soy_admin()
      or public.nivel_en_area(public.uuid_seguro((storage.foldername(name))[1])) = 'total'
    )
  );

comment on type nivel_acceso is
  'Escalera de acceso a un área, de menor a mayor: lectura (Vista) < descarga < edicion < total (además elimina).';
