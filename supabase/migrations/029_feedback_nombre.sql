-- =====================================================================
-- FEEDBACK: EL CUADRO SE LLAMA "FEEDBACK"
-- =====================================================================
-- El área del módulo pasa de llamarse «Retroalimentación» a «Feedback»,
-- que es como lo nombra el equipo. Solo cambia el nombre visible (la clave
-- del módulo, el slug y las rutas quedan igual) y el texto que la firma
-- deja en el registro de auditoría.

update areas
   set nombre = 'Feedback',
       descripcion = 'Feedback operativo: adherencia, desempeño, calidad y liderazgo, con plan de acción, seguimiento y conformidad.'
 where modulo = 'feedback';

create or replace function public.responder_feedback(
  p_id uuid,
  p_conformidad text,
  p_comentario text default null,
  p_compromiso text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  f record;
  area uuid := public.area_modulo('feedback');
begin
  select x.id, x.colaborador_usuario_id, x.plan_accion, c.es_positivo
    into f
    from feedback x
    join feedback_catalogo c on c.id = x.catalogo_id
   where x.id = p_id;
  if f.id is null then raise exception 'No existe el feedback'; end if;
  if p_conformidad not in ('aceptado', 'observaciones', 'rechazado') then
    raise exception 'Conformidad inválida';
  end if;
  if not (coalesce(f.colaborador_usuario_id = yo, false) or coalesce(public.nivel_en_area(area) >= 'edicion', false)) then
    raise exception 'No puedes responder este feedback';
  end if;
  if not coalesce(f.es_positivo, false)
     and p_conformidad <> 'rechazado'
     and coalesce(nullif(trim(p_compromiso), ''), f.plan_accion) is null then
    raise exception 'Escribe tu compromiso de mejora antes de firmar';
  end if;

  update feedback
     set conformidad = p_conformidad::feedback_conformidad,
         conformidad_comentario = nullif(trim(p_comentario), ''),
         conformidad_en = now(),
         plan_accion = coalesce(nullif(trim(p_compromiso), ''), plan_accion),
         estado = case when p_conformidad = 'rechazado' and estado = 'cerrado' then 'en_seguimiento' else estado end
   where id = p_id;

  insert into accesos (usuario_id, usuario_email, usuario_nombre, doc_titulo, area_nombre, accion)
  select yo, coalesce(u.email, ''), coalesce(p.nombre, ''),
         'Firma de feedback ' || p_id::text || ' (' || p_conformidad || case when nullif(trim(p_compromiso), '') is not null then ', con compromiso' else '' end || ')',
         'Feedback', 'editar'
    from perfiles p left join auth.users u on u.id = p.id where p.id = yo;
end $$;
