# Arquitectura: dónde vive cada cosa

Este documento explica cómo está organizado el código y dónde va cada pieza
nueva. Quien venga de Laravel encontrará las mismas capas con otros nombres:
la tabla de equivalencias está al final.

La idea central no cambia respecto al README: **la autorización vive en la
base de datos** (políticas RLS y funciones de Postgres). El código de
TypeScript pregunta, pinta y valida la forma de los datos, pero no decide
quién puede qué.

---

## Las capas

```
Navegador ──► proxy.ts ──► página (app/) ──► guardia ──► lib/<módulo>/datos.ts ──► Supabase (RLS)
                │                                                                        ▲
                │          formulario ──► acción (app/acciones/) ──► validación Zod ─────┘
                │
                └─ refresca la sesión y cierra las inactivas; no autoriza nada
```

| Capa | Carpeta | Qué hace | Qué no hace |
|---|---|---|---|
| Rutas y pantallas | `app/(app)`, `app/(admin)`, `app/(auth)` | Leen parámetros, llaman al guardia y a la capa de datos, calculan lo que se pinta y devuelven JSX | Consultar Supabase directamente |
| Guardias | `lib/sesion.ts`, `lib/modulos-acceso.ts` | `exigirSesion`, `exigirAdmin`, `exigirModulo(clave)`: sin sesión, a `/login`; sin permiso sobre el cuadro, 404 | Sustituir a RLS: solo evitan enseñar puertas que no se abren |
| Capa de datos (lectura) | `lib/<módulo>/datos.ts` | Una función por consulta, con el cliente de la sesión | Comprobar permisos, escribir |
| Reglas del dominio | `lib/<módulo>/index.ts` | Etiquetas, estados, fórmulas (nota de calidad, evaluación 360°), formatos | Hablar con la base |
| Acciones (escritura) | `app/acciones/<módulo>.ts` | Server actions: validan con Zod, escriben con el cliente de la sesión, dejan rastro y revalidan | Decidir permisos: si RLS rechaza, devuelven el error |
| Rutas de API | `app/api/**` | Lo que no es una pantalla: subir y descargar archivos, CSV, Excel, URL firmadas, cron | Lógica de pantalla |
| Validación | `lib/validaciones.ts` | Un esquema Zod por cada cosa que viaja, compartido entre cliente y servidor | — |
| Componentes | `components/<módulo>/`, `components/comunes/`, `components/ui/` | Interfaz. Los de cliente llaman a las acciones con `useTransition` | Consultar la base |
| Esquema y reglas | `supabase/migrations/` | Tablas, vistas, políticas RLS, funciones `security definer`, triggers. **Fuente de verdad** | — |

---

## Anatomía de un módulo

Todos los módulos siguen la misma forma. Calidad, el más grande, como
ejemplo:

```
app/(app)/calidad/
  layout.tsx                 exigirModulo("calidad") una vez + pestañas
  page.tsx                   Dashboard
  evaluaciones/              Lista, nueva, detalle [id]
  matriz/  asesores/  eliminadas/
app/acciones/calidad.ts      Guardar, publicar, eliminar con motivo, firmar…
app/api/calidad/csv/         Exportación
components/calidad/          Formulario de auditoría, pauta, retroalimentación…
lib/calidad/
  index.ts                   Etiquetas y la fórmula de la nota (calcularNota)
  datos.ts                   cargarDashboardCalidad, listarAuditorias, …
supabase/migrations/016, 017, 020, 021, 023, 027, 028, 030–032, 034
                             Tablas calidad_*, vistas, políticas y funciones
pruebas/
  rls.test.mjs               Quién ve y quién escribe
  logica/calidad.test.ts     La nota, los pesos que suman 100
```

| Módulo | Reglas | Datos | Acciones |
|---|---|---|---|
| Documentos y áreas | `lib/archivos/` | `lib/documentos/datos.ts` | `app/api/documentos/**` |
| Buzón (PQR) | `lib/buzon/index.ts` | `lib/buzon/datos.ts` | `app/acciones/buzon.ts`, `app/api/buzon/**` |
| Evaluación 360° | `lib/evaluacion/index.ts` | `lib/evaluacion/datos.ts` | `app/acciones/evaluacion.ts` |
| Cumpleaños | `lib/cumpleanos/index.ts` | `lib/cumpleanos/datos.ts` | `app/acciones/cumpleanos.ts` |
| Calidad | `lib/calidad/index.ts` | `lib/calidad/datos.ts` | `app/acciones/calidad.ts` |
| PDA | `lib/pda/index.ts` | `lib/pda/datos.ts` | `app/acciones/pda.ts` |
| Feedback | `lib/feedback/index.ts`, `lib/feedback/colaboradores.ts` | `lib/feedback/datos.ts` | `app/acciones/feedback.ts` |
| Administración | `lib/permisos.ts` | `lib/admin/datos.ts` | `app/acciones/admin.ts`, `app/api/admin/**` |
| Auditoría de accesos | `lib/auditoria/index.ts` (`registrarAcceso`) | `lib/auditoria/consulta.ts` | — |

Lo transversal se queda en la raíz de `lib/`: `sesion.ts`,
`modulos-acceso.ts`, `modulos.ts`, `permisos.ts`, `validaciones.ts`,
`formato.ts`, `notificaciones.ts` y `utils.ts`, más `lib/supabase/`
(clientes y tipos) y `lib/api/` (respuestas de error de las rutas y el
acceso con clave de servicio).

---

## Reglas de la capa de datos

Cada `lib/<módulo>/datos.ts`:

1. Empieza con `import "server-only"`: la compilación falla si alguien lo
   arrastra a un componente de cliente.
2. Exporta funciones cuyo **primer parámetro es el cliente de la sesión**
   (`supabase: ClienteServidor`, el que devuelve el guardia). Nunca crean
   uno propio y nunca usan la clave de servicio.
3. No comprueban permisos: **RLS decide qué filas vuelven**. Quien no tiene
   acceso recibe una lista vacía o `null`, y la pantalla lo trata como «no
   hay nada».
4. Se nombran por lo que devuelven: `listar…` (varias filas), `obtener…` /
   `buscar…` (una fila o `null`), `contar…`, `cargar…` (lo que necesita una
   pantalla entera, en paralelo cuando se puede), `puede…` (una pregunta de
   permisos a la base, solo para decidir qué botones pintar).
5. Llevan JSDoc en español: qué devuelven, qué filtros aceptan y qué regla
   de acceso aplica.
6. En funciones nuevas, las listas devuelven `[]` en lugar de `null` y el
   error se devuelve aparte solo si la pantalla lo enseña.

Una pantalla, entonces, se lee de arriba abajo así:

```ts
export default async function PaginaPda() {
  const { supabase, puedeEditar } = await exigirModulo("pda"); // guardia
  const { planes, error } = await listarPlanes(supabase);       // datos
  const delMes = planes.filter((p) => p.periodo.startsWith(mesActual())); // presentación
  return <…/>;                                                  // vista
}
```

**Por qué las lecturas en una capa y las escrituras en acciones.** Las
lecturas se repiten entre pantallas (el dashboard y la lista de Calidad
usan los mismos team leaders; la página del PDA y su Excel, el mismo plan)
y tenerlas en un sitio evita que una cambie y la otra no. Las escrituras,
en cambio, van cada una con su validación, su rastro en `accesos` y su
`revalidatePath`; juntarlas no ahorra nada.

---

## Dónde va cada cosa nueva

| Necesito… | Va en… |
|---|---|
| Una tabla, una columna, una regla de quién ve o escribe | Una migración nueva en `supabase/migrations/` (numerada, se aplica una vez) y su prueba en `pruebas/rls.test.mjs` |
| Leer datos para una pantalla | Una función en `lib/<módulo>/datos.ts` |
| Guardar, publicar, borrar | Una acción en `app/acciones/<módulo>.ts` con su esquema en `lib/validaciones.ts` |
| Un cálculo o una etiqueta | `lib/<módulo>/index.ts`, con su prueba en `pruebas/logica/` |
| Un archivo descargable o algo que no es una pantalla | Una ruta en `app/api/<módulo>/` |
| Un cuadro-módulo completo | Los pasos de [`docs/modulos.md`](modulos.md) |
| Cargar personas o aplicar una migración | Los comandos de [`scripts/`](../scripts/README.md) |

---

## Pruebas

| Comando | Qué asegura |
|---|---|
| `npm run prueba:rls` | Las políticas: quién ve, quién escribe, quién borra. Corre las migraciones en un Postgres embebido (PGlite) |
| `npm run prueba:logica` | Las fórmulas y reglas de `lib/`: nota de calidad, pesos que suman 100, evaluación 360°, estados del PDA, usuario de Poliedro |
| `npm run prueba:bundle` | Que ninguna clave secreta llegue al navegador (tras `next build`) |
| `npm run typecheck`, `npm run lint` | Tipos y estilo |

Las pruebas de lógica se escriben en TypeScript y Node 24 las corre sin
compilar; `pruebas/cargador-ts.mjs` solo le enseña el alias `@/` y las
importaciones sin extensión.

---

## Equivalencias con Laravel

| Laravel | Aquí | Nota |
|---|---|---|
| `routes/web.php` | Carpetas de `app/` | La ruta es la carpeta; `(app)` y `(admin)` agrupan sin cambiar la URL |
| Controller (lectura) | `page.tsx` | Componente de servidor: guardia + datos + vista en un archivo |
| Controller (escritura) | `app/acciones/*.ts` | Server actions con `"use server"` |
| Eloquent Model | `lib/<módulo>/datos.ts` + tablas y vistas | Sin ORM: consultas de Supabase tipadas con `lib/supabase/tipos.ts` |
| Policy / Gate | Políticas RLS y funciones `security definer` | En la base, no en el código: no hay forma de saltárselas desde una pantalla |
| Middleware | `proxy.ts` + guardias de `lib/sesion.ts` y `lib/modulos-acceso.ts` | |
| Form Request | Esquemas Zod de `lib/validaciones.ts` | Se validan en los dos extremos |
| Blade / componentes | `components/` | React; `components/ui` es shadcn/ui con la marca aplicada |
| Migrations | `supabase/migrations/` | SQL plano, en orden |
| Seeders | `insert` dentro de las migraciones (catálogos, pautas) y `scripts/alta-usuarios.mjs` (personas) | Los listados de personal no se versionan |
| Artisan commands | `scripts/` (`npm run db:aplicar`, `npm run usuarios:alta`) | |
| Notifications / Events | Tabla `notificaciones`, funciones `generar_*` y triggers | La campana las lee; se generan con `after()` fuera del camino crítico |
| Scheduler | Vercel Cron → `app/api/cron/purgar` | |
| PHPUnit | `pruebas/` | |
| `.env` / `config/` | `.env.local` y variables de Vercel | `.env.example` lista todas |

Laravel no encaja como plataforma aquí (Vercel no ejecuta PHP y la
seguridad ya vive en Postgres), pero su orden de capas sí, y es el que sigue
este proyecto.
