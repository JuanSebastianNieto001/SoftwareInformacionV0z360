-- =====================================================================
-- EL NIVEL "DESCARGA" ENTRA EN VIGOR, Y NACE EL ÁREA DE FORMATOS
-- =====================================================================
-- Segunda mitad de 006. Aquí ya se puede usar el valor nuevo del enum.
-- =====================================================================

-- ---------- 1. NADIE PIERDE LO QUE YA TENÍA ----------
-- Antes 'lectura' incluía la descarga. Si se dejaran tal cual, todos los
-- lectores de Divulgaciones perderían de golpe el botón de descargar por
-- un cambio que no pidió nadie. Se suben a 'descarga', que es justo lo
-- que podían hacer ayer; el nivel 'lectura' queda libre para significar
-- "solo ver", que es lo nuevo.
update permisos_area set nivel = 'descarga' where nivel = 'lectura';

-- ---------- 2. EL TECHO DEL ROL GLOBAL, AHORA CON TRES NIVELES ----------
-- Antes el techo del lector se escribía forzando 'lectura', que con dos
-- niveles equivalía a un tope. Con tres ya no: forzarlo le quitaría la
-- descarga a quien la tiene concedida. least() sobre el enum expresa lo
-- que siempre se quiso decir -"no puede pasar de aquí"- y sigue valiendo
-- si algún día se añade un cuarto nivel.
create or replace function public.nivel_en_area(a uuid)
returns nivel_acceso language sql security definer stable set search_path = public as $$
  select case
    when a is null then null
    when not exists (select 1 from areas where id = a and activa) then null
    when public.soy_admin() then 'edicion'::nivel_acceso
    when public.mi_rol() is null then null
    else (
      select case
               when public.mi_rol() = 'lector'
                 then least(pa.nivel, 'descarga'::nivel_acceso)
               else pa.nivel
             end
      from permisos_area pa
      where pa.usuario_id = auth.uid() and pa.area_id = a
    )
  end;
$$;

-- ---------- 3. VER EL DOCUMENTO ----------
-- 'descarga' ve exactamente lo mismo que 'lectura': la diferencia entre
-- los dos no está en qué documentos aparecen, sino en si el archivo se
-- puede bajar. Eso se decide en la política de storage, más abajo.
drop policy if exists documentos_select on documentos;
create policy documentos_select on documentos
  for select to authenticated
  using (
    case
      -- Quien edita lo ve siempre, para programar y renovar vigencias.
      when public.nivel_en_area(area_id) = 'edicion' then true
      -- Vista y Descarga: solo dentro de la ventana de vigencia.
      when public.nivel_en_area(area_id) is not null then
        purgado_en is null
        and vigente_desde <= now()
        and (vigente_hasta is null or vigente_hasta > now())
      else false
    end
  );

-- ---------- 4. LLEGAR AL ARCHIVO (nota, no hay cambios aquí) ----------
-- La URL firmada se pide con la sesión del propio usuario, así que esta
-- política es la que de verdad decide quién alcanza el binario. Con
-- 'lectura' se sigue firmando -hay que poder abrirlo- y lo que cambia es
-- que la aplicación no pide la firma con cabecera de descarga.
--
-- Conviene saber lo que esto sí y no garantiza: impide que la aplicación
-- entregue el archivo como adjunto y deja constancia en la auditoría de
-- quién lo intentó, pero quien puede abrir un PDF en el navegador puede
-- guardarlo desde el visor. "Vista" es un control administrativo, no una
-- imposibilidad técnica; para eso haría falta un visor con DRM.
-- Se deja la política de select como estaba: sin ella no habría ni vista.

-- ---------- 5. EL ÁREA DE FORMATOS ----------
-- Nace sin un solo permiso asignado. Solo los administradores la ven
-- hasta que alguien conceda Vista o Descarga desde Administración →
-- Permisos, que es justo lo que se pidió: acceso por invitación, no por
-- estar dentro de la casa.
insert into areas (nombre, slug, descripcion)
values (
  'Formatos',
  'formatos',
  'Formatos y plantillas del sistema de gestión. El acceso se concede persona a persona desde Administración → Permisos.'
)
on conflict (nombre) do nothing;
