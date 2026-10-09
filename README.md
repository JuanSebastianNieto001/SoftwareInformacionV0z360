# Comunícate con VOZ360

Herramienta interna de Voz360: un sitio donde se publican los documentos
del sistema de gestión y el personal los consulta dejando rastro de quién
abrió qué; un buzón de PQR tratado según la ISO 9001:2015; y dos módulos
de Gestión Humana, la evaluación de desempeño 360° y los cumpleaños con
alerta.

---

## Lo que hay que entender antes de tocar nada

**La autorización vive en la base de datos, no en TypeScript.** Todas las
consultas salen con la sesión de quien navega y pasan por las políticas RLS
de Postgres. Las comprobaciones que hay en el código —`exigirAdmin()`,
`puedeEditarArea()`, ocultar un botón— sirven para no enseñar puertas que no
se pueden abrir. Si alguna se equivoca, lo peor que ocurre es un botón que al
pulsarlo responde «no autorizado». Nunca al revés.

Corolario práctico: **añadir una comprobación en el componente no protege
nada**. Si hace falta impedir algo de verdad, la regla va en una política RLS
y se comprueba contra la base.

La única excepción es `lib/supabase/admin.ts`, que usa la clave de servicio y
se salta RLS. Importa `server-only`, así que la compilación falla si alguien
lo arrastra al navegador sin darse cuenta.

**Un cuadro puede ser un módulo.** Las áreas con `modulo` abren una pantalla
propia en lugar de una lista de documentos, y heredan la matriz de permisos
sin añadir nada. Cómo se añade uno está en `docs/modulos.md`.

---

## Estructura

Las capas, las reglas de cada una y dónde va cada pieza nueva están en
[`docs/arquitectura.md`](docs/arquitectura.md). En resumen: la página
(`app/`) llama al guardia y a la capa de datos del módulo
(`lib/<módulo>/datos.ts`); las escrituras van por las acciones
(`app/acciones/`); las reglas de acceso, en la base.

```
app/
  (app)/        Pantallas del día a día: Mis áreas, documentos, buzón,
                /evaluacion (desempeño 360°), /cumpleanos, /calidad
                (auditorías QualityCore), /pda (plan de trabajo de TI con
                chequeo y evidencias), /feedback (retroalimentación operativa),
                /mis-evaluaciones y /mis-feedback (lo del colaborador)
  (admin)/      Panel: documentos, usuarios, áreas, grupos, permisos, auditoría
  (auth)/       Entrada y cambio de contraseña
  acciones/     Server actions: auth, buzón, evaluación, cumpleaños,
                calidad, pda, feedback, notificaciones, admin
  api/          Route handlers: subida y descarga, CSV, Excel del PDA,
                evidencias firmadas, usuarios (service role), cron de purga
components/
  comunes/      Marco de la app, campana de notificaciones, encabezados,
                diseño de los cuadros, botón de borrado, pantalla de error
  documentos/   Subir, editar, listar, filtrar, insignias de estado
  buzon/        Formulario de PQR, bandeja, tablero, tratamiento
  evaluacion/   Hoja por cargo, matriz 360, alta, pestañas del módulo
  cumpleanos/   Alta y edición de cumpleaños
  calidad/      Pauta en vivo, retroalimentación y compromisos, firma del
                asesor, editor de la pauta, estructura operativa
  pda/          PDA del mes: cabecera del formato, objetivos (la matriz),
                cierre, lista de chequeo, evidencias y barra de avance
  feedback/     Retroalimentación: formulario con catálogo, panel de gestión
                y la respuesta de conformidad del colaborador
  admin/        Usuarios, áreas, grupos, matriz de permisos
  ui/           shadcn/ui, con los tokens de marca aplicados
lib/
  <módulo>/         Una carpeta por módulo, siempre con la misma forma:
    index.ts          reglas del dominio: etiquetas, estados, fórmulas
    datos.ts          capa de lectura: una función por consulta (server-only)
  calidad/          La nota de calidad (espejo de v_calidad_evaluaciones)
  evaluacion/       Las fórmulas del Excel de evaluación 360°
  pda/              Las 14 columnas del formato FTM-SINF-005 y sus estados
  feedback/         Etiquetas, y en colaboradores.ts a quién puede dar
                    feedback cada emisor
  cumpleanos/  buzon/  documentos/  admin/
  auditoria/        registrarAcceso (index.ts) y la consulta del panel
  archivos/         Nombres seguros y MIME, subida desde el navegador y
                    limpieza de huérfanos en Storage
  api/              Respuestas de error de las rutas y acceso con clave de
                    servicio solo tras comprobar que quien llama es admin
  supabase/         Clientes (navegador, servidor, admin, middleware) y tipos
  validaciones.ts   Esquemas Zod compartidos entre cliente y servidor
  sesion.ts         exigirSesion / exigirAdmin / exigirGestorBuzon
  modulos-acceso.ts Guardia de los módulos: sin permiso sobre el cuadro, 404
  modulos.ts        Qué cuadros son módulos: ruta, icono, pie
  permisos.ts       Espejo en TypeScript de las reglas de RLS (solo para pintar)
  notificaciones.ts Carga de avisos para la campana (genera los pendientes)
  formato.ts        Fechas, tamaños, plurales y el usuario de Poliedro
supabase/
  migrations/   El esquema, en orden. Es la fuente de verdad
  functions/    Edge Function `purgar` (borra archivos vencidos)
  scripts/      SQL de puesta en marcha y verificación (editor de Supabase)
scripts/        Comandos de consola: aplicar una migración, alta de personas
pruebas/
  rls.test.mjs              Las comprobaciones de las políticas de acceso
  logica/                   Las fórmulas y reglas de lib/ (node:test)
  cargador-ts.mjs           Deja a Node resolver @/ e imports sin extensión
  bundle-sin-secretos.mjs   Que ninguna clave secreta llegue al navegador
docs/
  arquitectura.md  Las capas, dónde va cada cosa, equivalencias con Laravel
  seguridad.md     Modelo de amenazas, qué se arregló y qué sigue abierto
  permisos.md      Cómo se calcula lo que cada persona puede hacer
  modulos.md       Cómo se añade un cuadro-módulo
```

`proxy.ts` en la raíz es el middleware (Next.js 16 lo renombró). Refresca la
sesión, cierra las inactivas más de 30 minutos y redirige a `/login`; no
autoriza nada.

Cada archivo de `app/`, `components/` y `lib/` empieza con una cabecera que
dice qué es y por qué existe. Los comentarios del cuerpo explican
decisiones, no repiten el código.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local      # y rellena las variables
npm run dev
```

Variables necesarias, todas en el panel de Vercel del proyecto:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública (va al navegador) |
| `SUPABASE_SECRET_KEY` | Clave de servicio. **Nunca con prefijo `NEXT_PUBLIC_`** |
| `CRON_SECRET` | Autentica la llamada del cron de purga |
| `NEXT_PUBLIC_APP_URL` | Dirección pública, para enlaces absolutos |

`npx vercel env pull .env.local` las trae todas de una vez.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run typecheck` | `next typegen` y `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run prueba:rls` | Las comprobaciones de las políticas de acceso (Postgres embebido) |
| `npm run prueba:logica` | Las fórmulas y reglas de `lib/` (nota de calidad, evaluación 360°, PDA…) |
| `npm run prueba:bundle` | Que la clave de servicio no llegue al navegador |
| `npm run db:aplicar -- <archivo.sql>` | Aplica una migración en una transacción (ver [`scripts/`](scripts/README.md)) |
| `npm run usuarios:alta -- <personas.csv>` | Alta de cuentas en bloque, repetible (`--ensayo` para ver antes) |
| `npm run codigo-muerto` | Exportaciones y archivos que nadie usa |
| `npm audit --omit=dev` | Vulnerabilidades conocidas en dependencias de producción |
| `npx next build` | Compilación de producción |
| `npx vercel deploy --prod` | Despliega desde el código local |

Antes de dar por terminado un cambio: **typecheck, lint, build, las tres
pruebas (rls, lógica y bundle) y el audit**. Tras desplegar, retirar los despliegues anteriores
(`npx vercel ls` / `npx vercel remove`): sus direcciones siguen vivas y
apuntan a la misma base con código viejo.

---

## Base de datos

Las migraciones de `supabase/migrations/` están numeradas y **se aplican en
orden**. Son la fuente de verdad del esquema: si algo no está ahí, no existe.

Dos de ellas van en pareja porque Postgres no deja usar un valor de enum en
la misma transacción en la que se crea: `006`/`007` y `008`/`009`. La primera
de cada par se aplica sola, sin transacción.

Se aplican con `npm run db:aplicar -- supabase/migrations/<archivo>.sql`, que
lee `DATABASE_URL` y mete todo el archivo en una transacción (ver
[`scripts/README.md`](scripts/README.md)). La conexión va al pooler IPv4
(`aws-0-us-east-2.pooler.supabase.com:5432`); el host directo es solo IPv6 y
no responde desde cualquier red.

**Los tipos de `lib/supabase/tipos.ts` están escritos a mano.** Al cambiar el
esquema hay que actualizarlos, o `npx supabase gen types typescript --linked`
si el proyecto está enlazado.

---

## Convenciones

- **Todo en español**: nombres de variables, funciones, tablas y comentarios.
  El código lo lee gente que habla español; que el idioma cambie a mitad de
  línea no ayuda a nadie.
- **Comentarios que explican el porqué, no el qué.** `// suma uno` sobra;
  `// nullish y no optional: el cliente reenvía su propia salida` no.
- **Los archivos son CRLF.** Al editar con scripts hay que usar `\r\n`, o los
  reemplazos fallan en silencio.
- **Un esquema Zod por cada cosa que viaja**, en `lib/validaciones.ts`, y se
  valida en los dos extremos. Ojo con el viaje de ida y vuelta: el cliente
  valida y manda su propia salida, que el servidor vuelve a parsear, así que
  los esquemas tienen que aceptar lo que ellos mismos producen.
- **Las acciones de servidor no deciden permisos.** Validan la forma, usan
  el cliente de sesión y dejan que RLS acepte o rechace. Si tocan
  información de personas, dejan rastro con `registrarAcceso`.

---

## Documentación relacionada

- [`docs/arquitectura.md`](docs/arquitectura.md) — las capas y dónde va cada cosa
- [`docs/permisos.md`](docs/permisos.md) — quién puede hacer qué y cómo se calcula
- [`docs/seguridad.md`](docs/seguridad.md) — modelo de amenazas y estado actual
- [`docs/modulos.md`](docs/modulos.md) — cómo se añade un cuadro-módulo
- [`AGENTS.md`](AGENTS.md) — nota sobre esta versión de Next.js
