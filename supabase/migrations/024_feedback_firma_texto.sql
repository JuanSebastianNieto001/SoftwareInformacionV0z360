-- =====================================================================
-- FEEDBACK: LA RESPUESTA DEL COLABORADOR SE LLAMA FIRMA
-- =====================================================================
-- Solo cambian los textos de la alerta al colaborador: la conformidad se
-- presenta como una firma virtual (lee, responde y firma desde
-- «Mis feedback»). La mecánica no cambia: responder_feedback() sigue
-- sellando fecha y hora y dejando rastro en accesos.
create or replace function public.generar_alertas_feedback()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  area uuid := public.area_modulo('feedback');
  pendientes integer;
begin
  if yo is null or area is null then return 0; end if;

  -- Como colaborador: feedback dirigido a mí, pendiente de mi firma.
  insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
  select yo, 'feedback:conf:' || f.id, 'feedback',
         case when c.es_positivo then '🌟 Reconocimiento: ' else '✍️ Feedback por firmar: ' end || c.subtipo,
         left(f.descripcion, 120) || ' · revísalo y fírmalo en Mis feedback',
         '/mis-feedback'
    from feedback f
    join feedback_catalogo c on c.id = f.catalogo_id
   where f.colaborador_usuario_id = yo and f.conformidad is null
  on conflict (usuario_id, clave) do nothing;

  -- Como gestor del cuadro: seguimientos por vencer o vencidos.
  if public.nivel_en_area(area) is not null then
    insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
    select yo, 'feedback:vence:' || f.id || ':' || to_char(f.fecha_seguimiento, 'YYYY-MM-DD'), 'feedback',
           case when f.fecha_seguimiento < current_date then '⏰ Seguimiento vencido: ' else '⏰ Seguimiento por vencer: ' end || f.colaborador_nombre,
           c.subtipo || ' · ' || to_char(f.fecha_seguimiento, 'DD/MM/YYYY'),
           '/feedback/' || f.id
      from feedback f
      join feedback_catalogo c on c.id = f.catalogo_id
     where f.estado in ('abierto', 'en_seguimiento')
       and f.fecha_seguimiento is not null
       and f.fecha_seguimiento <= current_date + 2
    on conflict (usuario_id, clave) do nothing;
  end if;

  select count(*) into pendientes from notificaciones where usuario_id = yo and leida_en is null;
  return pendientes;
end $$;
