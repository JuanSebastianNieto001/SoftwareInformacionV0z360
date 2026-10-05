# Comunícate con VOZ360

Gestor documental interno de Voz360: un sitio donde el líder de TI publica
documentos para divulgar, el personal los consulta dejando rastro de quién
abrió qué, y cualquiera puede presentar una PQR que se trata según los
requisitos de la ISO 9001:2015.

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

---

## Estructura

```
app/
  (app)/        Pantallas del día a día: inicio, áreas, documentos, buzón,
                evaluación de desempeño (/evaluacion)
  (admin)/      Panel: documentos, usuarios, áreas, grupos, permisos, auditoría
  (auth)/       Login y cambio de contraseña
  acciones/     Server actions compartidas (auth, buzón, evaluación)
  api/          Route handlers: subida, descarga, CSV, cron
components/
  comunes/      Cabecera, encabezado de página, pantalla de error
  documentos/   Subir, editar, listar, filtrar, insignias de estado
  buzon/        Formulario de PQR, bandeja, tablero, tratamiento
  evaluacion/   Hoja por cargo, matriz 360 y navegación del módulo de evaluación
  admin/        Usuarios, áreas, grupos, matriz de permisos
  ui/           shadcn/ui, con los tokens de marca aplicados
lib/
  supabase/     Clientes (navegador, servidor, admin, proxy) y tipos
  validaciones.ts   Esquemas Zod compartidos entre cliente y servidor
  permisos.ts       Espejo en TypeScript de las reglas de RLS
  sesion.ts         exigirSesion / exigirAdmin / exigirGestorBuzon
  auditoria*.ts     Registro y consulta de accesos
  evaluacion.ts     Las fórmulas del Excel de evaluación 360°, en TypeScript
  evaluacion-acceso.ts  Guardia del módulo: sin permiso sobre el cuadro, 404
supabase/
  migrations/   El esquema, en orden. Es la fuente de verdad
  functions/    Edge Function `purgar` (borra archivos vencidos)
  scripts/      Pasos manuales de puesta en marcha
docs/
  seguridad.md  Modelo de amenazas, qué se arregló y qué sigue abierto
  permisos.md   Cómo se calcula lo que cada persona puede hacer
```

`proxy.ts` en la raíz es el middleware (Next.js 16 lo renombró). Refresca la
sesión y redirige a `/login`; no autoriza nada.

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
| `npx next build` | Compilación de producción |
| `npx vercel deploy --prod` | Despliega desde el código local |

Antes de dar por terminado un cambio: **typecheck, lint y build**, los tres.

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

---

## Documentación relacionada

- [`docs/permisos.md`](docs/permisos.md) — quién puede hacer qué y cómo se calcula
- [`docs/seguridad.md`](docs/seguridad.md) — modelo de amenazas y estado actual
- [`AGENTS.md`](AGENTS.md) — nota sobre esta versión de Next.js
