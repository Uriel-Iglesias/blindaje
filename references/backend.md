# Backend: checklist

El servidor es la única frontera real. Si algo solo se comprueba en el navegador, no se comprueba.

Base: OWASP Top 10 2025 (A01 Control de acceso roto, A02 Configuración insegura, A03 Cadena de suministro, A05 Inyección, A07 Autenticación), OWASP ASVS 5.0 y OWASP API Security Top 10.

## 1. Autenticación

- Usa un proveedor probado (Supabase Auth, Clerk, Auth.js, Firebase Auth, Lucia, el del framework). No inventes tu sistema de contraseñas.
- Si guardas contraseñas: Argon2id o bcrypt (coste ≥ 12). Nunca MD5, SHA-1 ni SHA-256 a pelo.
- Límite de intentos en login, registro, recuperación y verificación de códigos (por IP y por cuenta).
- Enlaces mágicos y códigos: un solo uso, caducan en ≤ 15 minutos, se invalidan al usar otro.
- Sesiones: cookie `HttpOnly; Secure; SameSite=Lax`, caducidad razonable, cierre de sesión que invalida en servidor, rotación de sesión al iniciar sesión.
- JWT: verificar firma y `exp` con la librería (`jwt.verify`, no `jwt.decode`). Algoritmo fijado; nunca `none`.
- 2FA disponible para cuentas de administración.

**Verificar**: 20 intentos de login fallidos seguidos deben acabar en bloqueo temporal o 429.

## 2. Autorización e IDOR

El fallo número uno de la lista OWASP. Pregunta en cada ruta: «¿quién puede pedir esto y sobre qué registro?».

**Buscar**
- Rutas que reciben un `id` (`/api/pedidos/[id]`, `?userId=`) y lo usan sin cruzarlo con la sesión.
- `userId`, `role`, `isAdmin`, `plan` leídos del cuerpo, de la query o de `localStorage`.
- Protección solo en el middleware. Next.js tuvo un fallo (CVE-2025-29927) que permitía saltarse el middleware con una cabecera: compruébalo también dentro de cada ruta y mantén el framework actualizado.
- Server Actions de Next.js: son endpoints públicos. Cada una comprueba sesión y permiso.

**Arreglar**
```ts
// mal
const pedido = await db.pedido.findUnique({ where: { id: params.id } });
// bien
const sesion = await auth();
if (!sesion) return new Response('No autorizado', { status: 401 });
const pedido = await db.pedido.findFirst({ where: { id: params.id, userId: sesion.user.id } });
if (!pedido) return new Response('No encontrado', { status: 404 });
```

**Verificar**: con dos cuentas de prueba, A pide los recursos de B cambiando el id. Debe dar 404 o 403.

## 3. Control de acceso por fila

### Supabase
- `alter table … enable row level security;` en **todas** las tablas del esquema `public`. Sin RLS, la clave anon (pública) lee y escribe todo.
- Políticas por operación (`select`, `insert`, `update`, `delete`) con `auth.uid() = user_id`. Nada de `using (true)` salvo en datos realmente públicos y solo para `select`.
- `update` con `with check` para que nadie cambie el `user_id` de una fila.
- Vistas: `security_invoker = true` (si no, se saltan la RLS). Funciones `security definer`: solo si hace falta, con `search_path` fijado.
- Storage: buckets privados para contenido de pago y datos personales, con políticas en `storage.objects`.
- `service_role` / `sb_secret_`: solo en servidor y solo cuando de verdad hay que saltarse la RLS.
- Comprobar: panel de Supabase → Advisors (Security) sin avisos de «RLS disabled»; y en SQL:
```sql
select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'public';
```
- Prueba real: con la clave anon y sin sesión, `curl "$SUPABASE_URL/rest/v1/<tabla>?select=*" -H "apikey: $ANON"` debe devolver `[]` o error en tablas privadas.

### Firebase
- Firestore y Storage: ninguna regla `allow read, write: if true;` ni `if request.time < timestamp.date(…)` (la regla de «modo prueba» caduca y alguien la amplía).
- Mínimo: `allow read, write: if request.auth != null && request.auth.uid == userId;`.
- Validar forma y campos en las reglas (`request.resource.data.keys().hasOnly([...])`).
- Activar App Check. Probar con el emulador de reglas.

## 4. Inyección

- **SQL**: consultas parametrizadas u ORM. Buscar `query(\`…${`, `$queryRawUnsafe`, `$executeRawUnsafe`, `.raw(` con interpolación, `sql.unsafe`.
- **NoSQL**: no pasar objetos del usuario directos a filtros de Mongo (`{ email: req.body.email }` acepta `{"$ne": null}`). Validar que son texto.
- **Comandos**: nada de `exec`/`execSync` con texto del usuario; `execFile` con argumentos en array.
- **Rutas de ficheros**: `path.join(base, input)` + comprobar que el resultado sigue dentro de `base` (path traversal).
- **Plantillas y correo**: escapar lo que va a HTML de correos.

## 5. SSRF

Cualquier función que pide una URL que da el usuario (previsualizar enlaces, importar imagen, webhook configurable, «lee esta web» de un agente):
- Lista blanca de dominios si se puede.
- Si no: solo `https`, resolver DNS y bloquear IPs privadas, `localhost`, `169.254.169.254` (metadatos de la nube), `::1`, rangos internos; sin seguir redirecciones a esos destinos.
- Tiempo máximo y tamaño máximo de respuesta.

## 6. Subida de ficheros

- Tamaño máximo en servidor. Tipos permitidos por lista blanca, comprobando los primeros bytes, no solo la extensión.
- Nombre nuevo aleatorio; nunca el nombre del usuario en la ruta.
- Bucket privado y URL firmada para servirlo. Nunca en la carpeta pública del servidor web.
- SVG y HTML subidos por usuarios: o se rechazan o se sirven con `Content-Disposition: attachment` desde otro dominio.
- Imágenes: quitar metadatos EXIF (ubicación).

## 7. Webhooks

- Verificar la firma con el **cuerpo crudo** y el secreto del proveedor, con comparación de tiempo constante.
- Rechazar eventos viejos (tolerancia de 5 minutos con la marca de tiempo firmada).
- Idempotencia: guardar el `id` del evento y no procesarlo dos veces.
- Responder 2xx rápido y procesar en cola si tarda.
- Ejemplos de verificación por proveedor en `cursos-pagos-correo.md`.

## 8. Límite de peticiones

Obligatorio en: login, registro, recuperación, formularios, endpoints que mandan correo o SMS, endpoints que llaman a un modelo de IA, búsquedas caras, descargas. Respuesta `429` con `Retry-After`.

## 9. CORS

- Por defecto no hace falta CORS: si el frontend y la API están en el mismo dominio, no lo actives.
- Nunca `Access-Control-Allow-Origin: *` junto con `Access-Control-Allow-Credentials: true`. Nunca reflejar el `Origin` que llega sin lista blanca.
- CORS no protege la API: un `curl` no pasa por CORS. La protección es la autenticación.

## 10. Secretos y rotación

- En variables de entorno del hosting o en un gestor (Doppler, 1Password, Infisical, el del proveedor de nube). Nunca en el código ni en el repo.
- Una clave por entorno (desarrollo, preview, producción). Producción no se usa en local.
- Claves con mínimos permisos (Stripe: claves restringidas `rk_`; AWS: política por recurso).
- Plan de rotación: lista de claves, dónde se usan y cómo rotar cada una. Rotar al salir alguien del equipo y tras cualquier exposición.

## 11. Errores y logs

- En producción, el usuario ve un mensaje genérico; nada de trazas, SQL ni rutas internas.
- Logs sin contraseñas, tokens, números de tarjeta ni datos de salud. Correos y teléfonos, enmascarados si no hacen falta.
- Registrar lo que importa para detectar abuso: logins fallidos, cambios de permisos, accesos denegados, webhooks rechazados. Con alertas.
- Retención de logs definida (y en la política de privacidad si llevan datos personales).

## 12. Backups

- Automáticos, cifrados y en otra cuenta o región.
- **Probados**: restaurar al menos una vez al trimestre en un entorno aparte y anotar cuánto tardó.
- Supabase: el plan gratuito no da copias descargables útiles; programa un `pg_dump` propio si no pagas el plan con PITR.
- Saber cuánto se puede perder (horas de datos) y decirlo en voz alta.

## 13. Dependencias y versiones

- Lockfile en el repo e instalación con `npm ci` en el despliegue.
- `npm audit --omit=dev` o `osv-scanner --lockfile=package-lock.json` antes de publicar. Críticos y altos con exploit público: arreglar ya.
- Revisar avisos de seguridad del framework (Next.js y React publicaron fallos graves en 2025 en middleware y en Server Components): mantenerlos en la última versión parcheada de tu rama.
- Antes de instalar un paquete que sugiere la IA: comprobar que existe, que es el oficial y que tiene historia (descargas, repositorio, mantenedor).
- No exponer versiones: quitar `X-Powered-By`, `Server: nginx/1.x`, páginas de error por defecto.
- Activar Dependabot o Renovate.
