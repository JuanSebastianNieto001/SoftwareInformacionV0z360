# Cuadros-módulo: cómo se añade uno

Un cuadro de «Mis áreas» es, de serie, una carpeta de documentos. Desde la
migración `012` un cuadro puede ser además un **módulo**: una pantalla
propia (evaluación de desempeño, cumpleaños, calidad, PDA) que se abre desde el mismo
sitio y **hereda el sistema de permisos sin añadir nada**.

Este documento explica el mecanismo y la lista de pasos para añadir otro.

---

## La idea

Un módulo es una fila de `areas` con `modulo = '<clave>'`. Eso basta para:

- que aparezca como cuadro en «Mis áreas» **solo a quien tenga permiso**,
  porque la política `areas_select` filtra por `nivel_en_area()`;
- que se le concedan niveles desde *Administración → Permisos* y *Grupos*,
  igual que a cualquier carpeta;
- que escribir su URL a mano sin permiso responda 404, porque el guardia
  del módulo pregunta por la fila de `areas` y no la encuentra.

Las tablas del módulo llevan `area_id` y sus políticas se escriben sobre
`nivel_en_area(area_id)`. Qué significa cada peldaño lo decide el módulo
(ver `docs/permisos.md`), pero la convención es:

| Nivel | Convención |
|---|---|
| `lectura` / `descarga` | Consultar |
| `edicion` | Crear y modificar |
| `total` (o admin) | Además eliminar |

**No hay ninguna lista de correos en el código.** Quién entra se decide en
la base, y se cambia desde el panel.

---

## Pasos

### 1. Migración

```sql
-- ampliar el check de areas.modulo (ver 014 para la forma segura de hacerlo)
alter table areas add constraint areas_modulo_check
  check (modulo in ('evaluacion', 'cumpleanos', '<clave>'));

insert into areas (nombre, slug, descripcion, modulo)
values ('<Nombre>', '<slug>', '<descripción>', '<clave>')
on conflict (nombre) do update set modulo = excluded.modulo;
```

Después las tablas del módulo, cada una con `area_id` y políticas:

```sql
create policy x_select on x for select to authenticated
  using (public.nivel_en_area(area_id) is not null);
create policy x_insert on x for insert to authenticated
  with check (public.nivel_en_area(area_id) >= 'edicion'
              and area_id = public.area_modulo('<clave>')
              and creado_por = auth.uid());
create policy x_delete on x for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');
```

La condición `area_id = public.area_modulo('<clave>')` en los `with check`
impide colar filas del módulo en otro cuadro.

### 2. `lib/modulos.ts`

Añadir la clave al mapa `MODULOS` con su ruta, icono y pie del cuadro. Con
eso «Mis áreas» y la redirección de `/areas/[slug]` ya saben a dónde lleva.

### 3. Decoración del cuadro (opcional)

`components/comunes/decoracion-cuadro.tsx`: un fondo y una ilustración en
SVG en línea. Decorativa (`aria-hidden`) y con animaciones bajo
`motion-safe:`.

### 4. Pantallas

`app/(app)/<ruta>/layout.tsx` llama al guardia **una vez**, y las páginas
lo reutilizan (React `cache` comparte el resultado en la misma petición):

```ts
const { supabase, area, nivel, puedeEditar, puedeEliminar } = await exigirModulo("<clave>");
```

### 5. Acciones

`app/acciones/<modulo>.ts`, con `"use server"`. Validan con un esquema de
`lib/validaciones.ts`, usan el cliente de sesión y dejan que RLS decida. Si
el módulo maneja información de personas, registran en la auditoría con
`registrarAcceso` (ver `app/acciones/evaluacion.ts`).

### 6. Tipos y pruebas

- `lib/supabase/tipos.ts` está escrito a mano: añadir tablas, vistas y
  funciones.
- `pruebas/rls.test.mjs`: como mínimo, que sin permiso no se ve nada, que
  con Vista no se escribe, que con Edición se escribe solo en su cuadro y
  que borrar exige Total.

### 7. Documentación

Una línea en la tabla de módulos de `docs/permisos.md` y el árbol del
`README.md`.

---

## Lo que ya existe y se puede reutilizar

| Pieza | Para qué |
|---|---|
| `exigirModulo(clave)` | Guardia: sesión + permiso sobre el cuadro + niveles efectivos |
| `area_modulo(clave)` (SQL) | El id del área del módulo, desde políticas y funciones |
| `BotonEliminar` | Borrado con confirmación, recibe la acción ya ligada al id |
| `registrarAcceso` | Deja rastro en `accesos` (abrir, editar, eliminar…) |
| `notificaciones` + `generar_*` | Avisos por persona; el patrón está en `generar_alertas_cumpleanos()` |
