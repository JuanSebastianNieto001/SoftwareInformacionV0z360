# Quién puede hacer qué

Tres piezas deciden lo que una persona puede hacer sobre un área: su **rol
global**, lo que se le concede **a ella en concreto**, y lo que heredan de
sus **grupos**. Este documento explica cómo se combinan.

La respuesta la da siempre `public.nivel_en_area(area)` en Postgres.
`lib/permisos.ts` la replica en TypeScript **solo para pintar la pantalla**;
si las dos discrepan, la que manda es la de la base.

---

## La escalera de acceso

Cuatro niveles, de menor a mayor. Cada peldaño incluye todo lo del anterior.

| Nivel | Etiqueta en pantalla | Puede |
|---|---|---|
| `lectura` | Solo leer | Abrir los documentos en pantalla |
| `descarga` | Descargar | Lo anterior y bajarse el archivo |
| `edicion` | Editar | Subir documentos nuevos y modificar los que hay |
| `total` | Todos | Lo anterior y **eliminar** |

Sin fila en `permisos_area` ni grupo que conceda nada, no hay acceso: el área
ni siquiera aparece.

**Es una escalera y no una lista de casillas sueltas.** Con casillas se puede
crear «elimina pero no lee», que nadie concede a propósito y que en una
auditoría no hay forma de explicar. El orden del enum en Postgres es el mismo,
y por eso las políticas comparan con `>=` en lugar de `=`.

> Cuidado al añadir una política: escribir `= 'edicion'` deja fuera a `total`.
> Fue exactamente el error que casi se cuela al introducir el cuarto nivel.

### «Solo leer» no impide guardar

Quita el botón de descargar y hace que `/abrir?descargar=1` responda 403. Pero
quien puede abrir un PDF en el navegador puede guardarlo desde el visor. Es un
**control administrativo** —deja constancia en la auditoría de quién se llevó
qué— no una imposibilidad técnica.

---

## El rol global es el techo

| Rol | No pasa de | Además |
|---|---|---|
| `lector` | `descarga` | — |
| `editor` | `total` | Ve el enlace «Subir documento» |
| `admin` | `total` **en todas las áreas** | Usuarios, áreas, grupos, permisos, auditoría |

Un administrador no necesita que se le asigne nada: la función devuelve
`total` para cualquier área activa.

A un lector se le puede marcar «Editar» en la pantalla de permisos y el
sistema lo aplicará como «Descargar». La pantalla lo avisa. Para que edite de
verdad hay que cambiarle el rol global.

---

## Los grupos se suman

Un grupo reúne a quienes hacen el mismo trabajo. Se le conceden permisos una
vez y todo el que entre los hereda.

**Gana el mayor entre lo personal y lo de los grupos activos.** Entrar en un
grupo nunca le quita nada a nadie; salir de él puede dejarle solo con lo
personal. Un grupo desactivado deja de conceder pero conserva sus miembros.

El cálculo completo, en orden:

1. ¿El área existe y está activa? Si no, nada.
2. ¿Es administrador? Entonces `total` y se acabó.
3. Se reúne lo concedido a la persona y lo de sus grupos activos, y se toma
   el mayor.
4. Se aplica el techo del rol global.

> Detalle que costó un susto: `LEAST()` en Postgres **ignora los NULL**. Al
> agregar con `max()` siempre hay una fila, así que hay que decidir qué
> significa «ninguna concesión» *antes* de aplicar el techo. Sin esa rama, una
> persona sin permiso alguno salía con `descarga` por el mero hecho de ser
> lectora.

---

## El buzón va por libre

Atender PQR no es un nivel de área: es la marca `perfiles.gestiona_buzon`.

`gestionaBuzon()` es cierto para los administradores y para quien tenga la
marca. Eso permite que alguien conteste el buzón sin poder tocar cuentas,
áreas ni auditoría.

Nadie puede dársela a sí mismo: la política `perfiles_update_propio` fija
`rol`, `activo`, `gestiona_buzon` y `cargo`. Lo único que el interesado
cambia de su propio perfil es el nombre y la marca de último acceso.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| El cálculo real | `public.nivel_en_area()`, migración `010` |
| Las políticas de documentos | migración `009` |
| El espejo en TypeScript | `lib/permisos.ts` |
| La pantalla por persona | `components/admin/matriz-permisos.tsx` |
| La pantalla por grupo | `components/admin/gestion-grupos.tsx` |

Para comprobar los permisos efectivos de alguien contra la base, sin fiarse
de la pantalla, hay un ejemplo en `supabase/scripts/04_verificar_rls_en_produccion.sql`.
