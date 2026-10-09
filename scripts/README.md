# Scripts de consola

Tareas de mantenimiento que se corren a mano desde la raíz del proyecto, con
las variables de `.env.local`. Son el equivalente a los comandos de `artisan`
en Laravel: nada de esto lo ejecuta la aplicación.

| Comando | Qué hace | Variables |
|---|---|---|
| `npm run db:aplicar -- <archivo.sql>` | Aplica una migración o un script SQL, en una transacción | `DATABASE_URL` |
| `npm run usuarios:alta -- <personas.csv> --ensayo` | Dice qué cuentas crearía, sin escribir nada | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` |
| `npm run usuarios:alta -- <personas.csv>` | Crea las cuentas que falten (repetible) | las mismas, y opcional `CLAVE_INICIAL` |

Los SQL de puesta en marcha (bucket, primer administrador, cron, verificación
de RLS) siguen en [`supabase/scripts/`](../supabase/scripts), porque se
pegan en el editor SQL de Supabase.

---

## Aplicar una migración

```bash
npm run db:aplicar -- supabase/migrations/035_algo.sql
```

- Una migración se aplica **una sola vez y en orden**. Antes de aplicar la
  035, la 034 tiene que estar en la base.
- Todo el archivo va en una transacción: si algo falla, no queda nada a
  medias. Las migraciones que crean un valor de enum (006 y 008) no pueden ir
  así y se aplican con `--sin-transaccion`.
- `DATABASE_URL` apunta al **pooler IPv4** (`aws-0-us-east-2.pooler.supabase.com:5432`).
  El host directo de Supabase es solo IPv6 y no responde desde cualquier red.
- Después de aplicar, actualizar `lib/supabase/tipos.ts` y correr
  `npm run prueba:rls`.

## Dar de alta personas

```bash
npm run usuarios:alta -- personas.csv --ensayo
npm run usuarios:alta -- personas.csv
npm run usuarios:alta -- asesores.csv --areas=divulgaciones,apoyos-comerciales --nivel=lectura
```

El CSV lleva encabezado con `correo`, `nombre` y, opcional, `cargo`, separado
por comas o por punto y coma (lo que exporta Excel en español). En `correo`
puede ir un número de Poliedro suelto. Hay un ejemplo en
[`ejemplos/personas.ejemplo.csv`](ejemplos/personas.ejemplo.csv).

- Si la cuenta ya existe, no se toca; `--areas` sí se vuelve a aplicar, sin
  duplicar.
- Toda cuenta nueva nace activa, con rol lector y obligada a cambiar la
  contraseña al primer ingreso.
- Las contraseñas se imprimen al final: se entregan por otro canal y no se
  guardan en ningún sitio.
- **Los listados de personal no se suben al repositorio.** `.gitignore`
  excluye `*.csv`, `*.xlsx` y `*.xls` porque llevan cédulas y números de
  Poliedro.

Los permisos sobre módulos (Calidad, Feedback, PDA…) se dan después desde
*Administración → Permisos*, o con una migración si deben quedar fijos.
