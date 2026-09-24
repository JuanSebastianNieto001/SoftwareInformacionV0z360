-- =====================================================================
-- NUEVO NIVEL DE ACCESO: DESCARGA
-- =====================================================================
-- Hasta ahora había dos niveles y ver implicaba poder descargar. Para el
-- área de Formatos hace falta separarlos: hay quien debe consultar el
-- formato en pantalla y quien además puede llevárselo.
--
--   lectura  -> Vista     : abre el documento, no se lo lleva
--   descarga -> Descarga  : lo anterior y además baja el archivo
--   edicion  -> Edición   : sube, edita y descarga
--
-- El orden del enum importa: es de menor a mayor permiso, y así el techo
-- del rol global se puede calcular con least() en lugar de a mano.
--
-- Va en su propio archivo porque Postgres no deja usar un valor de enum
-- en la misma transacción en la que se crea. Aquí se añade; en 007 se usa.
-- =====================================================================

alter type nivel_acceso add value if not exists 'descarga' after 'lectura';
