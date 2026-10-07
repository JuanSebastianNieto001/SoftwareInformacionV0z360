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

```
app/
  (app)/        Pantallas del día a día: Mis áreas, documentos, buzón,
                /evaluacion (desempeño 360°), /cumpleanos, /calidad
                (auditorías QualityCore), /pda (plan de trabajo de TI con
                chequeo y evidencias) y /mis-evaluaciones (el asesor)
  (admin)/      Panel: documentos, usuarios, áreas, grupos, permisos, auditoría
  (auth)/       Entrada y cambio de contraseña
  acciones/     Server actions: auth, buzón, evaluación, cumpleaños,
                pda, notificaciones, admin
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
  admin/        Usuarios, áreas, grupos, matriz de permisos
  ui/           shadcn/ui, con los tokens de marca aplicados
lib/
  supabase/     Clientes (navegador, servidor, admin, middleware) y tipos
  validaciones.ts   Esquemas Zod compartidos entre cliente y servidor
  permisos.ts       Espejo en TypeScript de las reglas de RLS (solo para pintar)
  modulos.ts        Qué cuadros son módulos: ruta, icono, pie
  modulos-acceso.ts Guardia de los módulos: sin permiso sobre el cuadro, 404
  sesion.ts         exigirSesion / exigirAdmin / exigirGestorBuzon
  auditoria*.ts     Registro y consulta de accesos
  evaluacion.ts     Las fórmulas del Excel de evaluación 360°, en TypeScript
  cumpleanos.ts     Etiquetas y utilidades del módulo de cumpleaños
  calidad.ts        Estados, etiquetas y la fórmula de la nota de calidad
  pda.ts            Las 14 columnas del formato FTM-SINF-005, estados y formato
  notificaciones.ts Carga de avisos para la campana (genera los pendientes)
supabase/
  migrations/   El esquema, en orden. Es la fuente de verdad
  functions/    Edge Function `purgar` (borra archivos vencidos)
  scripts/      Pasos manuales de puesta en marcha y verificación
pruebas/
  rls.test.mjs              Las comprobaciones de las políticas de acceso
  bundle-sin-secretos.mjs   Que ninguna clave secreta llegue al navegador
docs/
  seguridad.md  Modelo de amenazas, qué se arregló y qué sigue abierto
  permisos.md   Cómo se calcula lo que cada persona puede hacer
  modulos.md    Cómo se añade un cuadro-módulo
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
| `npm run prueba:bundle` | Que la clave de servicio no llegue al navegador |
| `npm run codigo-muerto` | Exportaciones y archivos que nadie usa |
| `npm audit --omit=dev` | Vulnerabilidades conocidas en dependencias de producción |
| `npx next build` | Compilación de producción |
| `npx vercel deploy --prod` | Despliega desde el código local |

Antes de dar por terminado un cambio: **typecheck, lint, build, las dos
pruebas y el audit**. Tras desplegar, retirar los despliegues anteriores
(`npx vercel ls` / `npx vercel remove`): sus direcciones siguen vivas y
apuntan a la misma base con código viejo.

---

## Base de datos

Las migraciones de `supabase/migrations/` están numeradas y **se aplican en
orden**. Son la fuente de verdad del esquema: si algo no está ahí, no existe.

Dos de ellas van en pareja porque Postgres no deja usar un valor de enum en
la misma transacción en la que se crea: `006`/`007` y `008`/`009`. La primera
de cada par se aplica sola, sin transacción.

Para aplicar una migración hace falta conectarse al pooler IPv4
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

- [`docs/permisos.md`](docs/permisos.md) — quién puede hacer qué y cómo se calcula
- [`docs/seguridad.md`](docs/seguridad.md) — modelo de amenazas y estado actual
- [`docs/modulos.md`](docs/modulos.md) — cómo se añade un cuadro-módulo
- [`AGENTS.md`](AGENTS.md) — nota sobre esta versión de Next.js
