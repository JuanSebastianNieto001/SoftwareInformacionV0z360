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

### No hay caducidad por inactividad

Una sesión abierta sigue abierta. En un equipo compartido, quien se siente
después entra sin más. Es lo que conviene atacar a continuación.

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

## Al terminar una sesión de trabajo

Si en el proceso se han pegado claves en algún chat, herramienta o ticket,
rotarlas: contraseña de la base, clave de servicio de Supabase y token de
Vercel. Una clave que pasó por un sitio del que no se controla la retención
hay que darla por comprometida.
