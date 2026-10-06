# Seguridad

Estado del sistema tras la auditoría del 29 de septiembre de 2026. Cada
hallazgo se reprodujo contra la base de producción antes de arreglarlo y se
volvió a probar después.

---

## Principios

**La autorización vive en RLS.** Todo sale con la sesión de quien navega. Las
comprobaciones en TypeScript deciden qué se pinta, no qué se permite.

**Lo que crea el cliente nace inerte.** Un perfil recién creado es `lector` e
`inactivo`, pase lo que pase en los metadatos del registro. Elevarlo es un
acto deliberado de un administrador autenticado.

**Los registros del buzón y la auditoría no se borran.** No existe política de
`delete` en `accesos` ni en `sugerencias`, a propósito: el apartado 7.5 de la
ISO 9001 obliga a conservarlos. Para descartar un caso se usa el estado
`rechazada`, que exige justificación escrita.

---

## Arreglado

### Escalada a administrador desde el registro público · CRÍTICO

El disparador que crea los perfiles leía el rol de `raw_user_meta_data`, que
es el campo `data` de la petición de registro y **lo escribe quien llama**.
Con el registro público abierto:

```
POST /auth/v1/signup   { email, password, data: { rol: "admin" } }
```

devolvía una cuenta con `rol=admin` y `activo=true`. Acceso completo desde
internet, sin credenciales previas.

Ahora el perfil nace siempre `lector` e `inactivo`. El alta desde el panel
eleva el perfil en un segundo paso, con la sesión del administrador y pasando
por `perfiles_admin_all`. Migración `011`.

### Cualquier usuario podía leer todas las PQR · CRÍTICO

`perfiles_update_propio` fijaba `rol` y `activo`, pero `gestiona_buzon` se
añadió en la migración `003` y quedó fuera del `with check`. Un `PATCH` sobre
el propio perfil bastaba para hacerse gestor del buzón y leer todas las quejas
y no conformidades.

Reproducido con la cuenta real de un asesor. La política fija ahora también
`gestiona_buzon` y `cargo`. Migración `011`.

> Lección: al añadir una columna con peso de autorización hay que revisar las
> políticas que enumeran columnas. Un `with check` que lista campos envejece
> mal.

### Fuerza bruta sin freno · ALTO

Doce intentos fallidos seguidos, cero bloqueos. Con los usuarios de Poliedro
correlativos y la misma contraseña temporal repetida, adivinar una cuenta era
cuestión de segundos.

Tabla `intentos_login` y tres funciones `SECURITY DEFINER`. Se frena a los
ocho fallos por **cuenta e IP** en quince minutos, más un tope de cuarenta por
IP. Atarlo a la IP es deliberado: bloquear solo por correo convierte el freno
en un arma —fallar ocho veces contra el correo del jefe lo dejaría fuera—.

El mensaje de error es el mismo tanto si la cuenta no existe como si la
contraseña falla: decir «ese usuario no existe» le confirmaría a quien prueba
números de Poliedro cuáles están dados de alta.

### Sin cabeceras de seguridad · MEDIO

No había ninguna. Se añaden en `next.config.ts`:

- **CSP** con `frame-ancestors 'none'` — sin esto, cualquier web podía meter
  el panel en un iframe invisible y conseguir que un administrador ya logueado
  pulsara botones sin verlos.
- **`connect-src`** limitado al propio sitio y a Supabase: si algún día entra
  un script de más, no tiene a dónde mandar lo que lea.
- **`Referrer-Policy`** — las URL llevan el id del documento y se filtraban
  enteras al salir hacia otro sitio.
- `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`.

### Cuentas inertes escribiendo en el buzón · MEDIO

`sugerencias_insert_propia` solo exigía `emisor_id = auth.uid()`. Una cuenta
autorregistrada podía inyectar PQR por la API: registros que nadie puede
borrar después. Ahora exige además que el perfil esté activo.

---

## Abierto

### El registro público sigue habilitado

Es un interruptor del panel de Supabase y no se puede tocar desde el código:
*Authentication → Sign In / Providers → Email → «Allow new users to sign up»*.

Mientras siga activo, cualquiera puede crear cuentas. Ya no conceden nada
—nacen inertes— pero ensucian la base.

### Contraseñas temporales repetidas

Las cuentas creadas en bloque comparten contraseña inicial y los usuarios de
Poliedro son correlativos y adivinables. El freno hace lento el ataque, no
imposible. La solución de fondo es una contraseña distinta por persona.

### La cookie de sesión no es `httpOnly`

Es inevitable: el navegador la necesita para subir archivos directamente a
Storage y saltarse el límite de tamaño de las funciones de Vercel. El CSP es
lo que compensa este riesgo, porque cierra la vía de salida de un XSS.

### ~~No hay caducidad por inactividad~~ · resuelto el 5 de octubre

Una sesión abierta seguía abierta: en un equipo compartido, quien se
sentara después entraba sin más. Desde el 5 de octubre el middleware guarda
la última actividad en una cookie `httpOnly` y, pasados **30 minutos** sin
ninguna petición, la siguiente cierra la sesión y lleva a `/login` con el
aviso correspondiente. Ver `lib/supabase/proxy.ts`.

---

## Cosas que no son fallos del software

**Compartir el navegador.** Pasar una URL no transfiere una sesión: va en
cookies, nunca en la dirección. Si al abrir el enlace aparecen el correo y la
contraseña rellenados, es el gestor de contraseñas del navegador, y eso solo
ocurre en el mismo perfil de Chrome —mismo equipo, o dos Chrome sincronizados
con la misma cuenta de Google—.

**Las URL de despliegue antiguas.** Vercel conserva una copia de cada versión
en su propia dirección. Apuntan a la **misma base de datos** con código viejo.
Conviene borrarlas después de cada despliegue y usar solo la dirección corta.

---

## Revisión del 5 de octubre de 2026

Segunda pasada, tras añadir los módulos de evaluación de desempeño (012,
013) y cumpleaños con notificaciones (014). Mismo método: superficie de
escritura (acciones de servidor, rutas API, funciones `SECURITY DEFINER`),
políticas nuevas, dependencias y configuración.

### Corregido

**Vulnerabilidad crítica en Next.js · CRÍTICO.** `npm audit` señalaba en la
versión instalada (16.3.4) una ejecución remota de código en `next/og`
(GHSA-vcvr-r3jv-pc5j) y otras siete altas en dependencias de la
herramienta `shadcn`. La aplicación no usa `next/og`, pero una dependencia
con una crítica conocida no se deja. Next.js a 16.3.8; `shadcn` —que es
una herramienta de línea de comandos, no código de la aplicación— pasa a
`devDependencies`; el resto con `npm audit fix`. Resultado en producción:
**0 vulnerabilidades**. `npm audit --omit=dev` queda como comprobación
previa a cada despliegue.

**Sesiones sin caducidad · MEDIO.** Resuelto (ver arriba).

**`'unsafe-eval'` en producción · MEDIO.** La política de contenido lo
concedía siempre; solo lo necesita el servidor de desarrollo. Ahora
condicionado a `NODE_ENV !== 'production'`.

**Notificaciones editables · BAJO.** La política de `update` limitaba a las
filas propias, pero dentro de ellas cualquier columna era modificable. Con
un privilegio a nivel de columna, `leida_en` es lo único que acepta un
cambio (015).

**Cargo de una evaluación mutable · BAJO.** El disparador de coherencia
comprobaba cada calificación contra el cargo, pero no impedía cambiar el
cargo después de calificar. Nuevo disparador (015).

**Comparación del secreto del cron · BAJO.** `!==` filtra por tiempo cuántos
caracteres iniciales acertó quien prueba; ahora `timingSafeEqual`.

**`intentos_login` con privilegio de tabla · BAJO.** Sin políticas ya estaba
cerrada; se revoca también el privilegio por defensa en profundidad (015).

Además: `X-Robots-Tag: noindex` (herramienta interna) y, en estructura, las
acciones de administración y el botón de borrado compartido en su sitio.

### Revisado y correcto

- Las funciones `SECURITY DEFINER` nuevas (`area_modulo`,
  `generar_alertas_cumpleanos`) solo actúan sobre `auth.uid()` y comprueban
  `nivel_en_area` antes de crear nada. `area_modulo` devuelve el id de un
  área a cualquier autenticado: un uuid solo no concede nada.
- Toda escritura de los módulos exige `area_id = area_modulo(...)` en el
  `with check`: no se pueden colar filas en otro cuadro.
- Las acciones de servidor validan con Zod en el servidor aunque el cliente
  ya haya validado, y ninguna decide permisos en TypeScript.
- Los guiones de carga (asesores, cumpleaños, datos del Excel) leen claves
  del entorno y no las imprimen; los archivos con datos personales siguen
  fuera del repositorio (`*.xlsx` en `.gitignore`).

### Sigue abierto

- **Registro público habilitado** en el panel de Supabase (solo el
  propietario puede desactivarlo). Las cuentas nacen inertes, pero ensucian.
- **Rotar** la contraseña de la base, la clave de servicio y el token de
  Vercel que pasaron por el chat de desarrollo.
- **Datos personales.** El módulo de cumpleaños guarda fechas de nacimiento
  y el de evaluación, valoraciones sobre personas: ambos limitados por
  permisos a Gestión Humana, Selección y administradores, y con rastro en
  la auditoría. Falta el aviso de privacidad y las autorizaciones de
  tratamiento (Ley 1581), que no son tarea de TI.

---

## Módulo de calidad (6 de octubre de 2026)

Añadido con la migración `016` a partir del formulario de requerimientos de
Calidad. Lo relevante para seguridad:

- **Datos de desempeño de personas.** Las auditorías, hallazgos y
  retroalimentaciones son información laboral sensible. El cuadro lo ven
  Calidad, Formación y administradores; **el asesor evaluado ve únicamente
  sus auditorías publicadas**, por RLS sobre `calidad_asesores.usuario_id`,
  y nunca los borradores ni las de otros.
- **La firma es del asesor.** El estado «firmada» solo se alcanza con la
  función `firmar_retroalimentacion()`, que exige que firme el evaluado y
  que exista al menos un compromiso; un disparador bloquea cualquier otro
  camino. Cada firma queda en `accesos` con fecha, hora e IP.
- **Lo publicado no se altera.** Publicar exige pauta completa y pesos que
  sumen 100; después, ni la matriz ni el asesor ni las respuestas cambian.
- **El histórico cargado** (535 auditorías del formulario anterior) **no
  incluye el teléfono del cliente**, que el formulario sí recogía: no hace
  falta para el fin del módulo (minimización, Ley 1581).
- La pauta (ítems y pesos) la lee cualquier autenticado: son criterios de
  calidad, no datos de personas.

---

## Al terminar una sesión de trabajo

Si en el proceso se han pegado claves en algún chat, herramienta o ticket,
rotarlas: contraseña de la base, clave de servicio de Supabase y token de
Vercel. Una clave que pasó por un sitio del que no se controla la retención
hay que darla por comprometida.
