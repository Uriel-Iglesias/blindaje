# Fallos típicos del código generado con IA

El código que escribe un agente compila, se ve bien y funciona en la demo. Lo que falla es lo que no se ve en la demo: quién más puede hacer esa petición. Revisa esta lista en cada auditoría, en este orden.

| # | Fallo | Cómo detectarlo | Arreglo |
|---|---|---|---|
| 1 | RLS apagada en Supabase | `select tablename, rowsecurity from pg_tables where schemaname='public';` · Advisors del panel | `enable row level security` + políticas por operación |
| 2 | Política RLS `using (true)` o `to anon` en tablas privadas | `grep -rn "using (true)" supabase/` | `using (auth.uid() = user_id)` |
| 3 | `service_role` / `sb_secret_` en el cliente | `grep -rn "SERVICE_ROLE\|sb_secret_" src app components` | Solo en rutas de servidor; rotar |
| 4 | Clave de IA o de pagos con prefijo público | `grep -rnE "NEXT_PUBLIC_.*(SECRET\|OPENAI\|ANTHROPIC\|STRIPE_SECRET)"` | Mover a servidor; rotar |
| 5 | Rutas `/api` sin comprobar sesión | Abrir cada `route.ts` / `api/*.js` y buscar la llamada a la sesión en las primeras líneas | `auth()` + 401 al principio de cada handler |
| 6 | Confiar en `userId` o `role` del cuerpo o la query | `grep -rnE "body\.(userId\|role\|isAdmin)\|searchParams.get\('userId'\)"` | Sacarlo siempre de la sesión |
| 7 | Seguridad solo en el middleware o escondiendo botones | Llamar a la API directamente con `curl` | Comprobar dentro de cada ruta y Server Action |
| 8 | Server Actions sin auth | `grep -rn "'use server'"` y revisar cada función exportada | Sesión y permiso en cada acción |
| 9 | Webhook sin verificar firma, o con `req.json()` antes de verificar | Buscar `webhook` sin `constructEvent` / `verify` | Ver `cursos-pagos-correo.md` |
| 10 | Acceso al curso desde la página de «gracias» o `?paid=true` | Buscar `success`, `paid`, `session_id` en páginas | Conceder acceso solo desde el webhook |
| 11 | Vídeos y PDFs de pago en `public/` o bucket público | `find public -name "*.mp4" -o -name "*.pdf"` · buckets marcados como public | Proveedor con URL firmada |
| 12 | Reglas de Firebase en modo prueba | `grep -rn "if true\|request.time <" firestore.rules storage.rules` | Reglas por usuario |
| 13 | CORS `*` o reflejo del `Origin` | `grep -rn "Access-Control-Allow-Origin\|cors(" .` | Quitar CORS o lista blanca |
| 14 | `dangerouslySetInnerHTML` / `innerHTML` con datos del usuario o del modelo | `grep -rn "dangerouslySetInnerHTML\|innerHTML\s*="` | Texto plano o DOMPurify |
| 15 | SQL con interpolación | `grep -rn "queryRawUnsafe\|executeRawUnsafe\|sql.unsafe"` y consultas montadas con plantillas de texto | Parámetros |
| 16 | Sin límite de peticiones en login, formularios e IA | Buscar `ratelimit` / `rateLimit`; si no aparece, no hay | Upstash Ratelimit o firewall del hosting |
| 17 | Paquetes inventados o con nombre parecido | Revisar cada dependencia nueva en npmjs.com | Quitar y usar el oficial |
| 18 | `.env` en el primer commit | `git log --all -- .env` | Rotar + `.gitignore` + limpiar historial con permiso |
| 19 | Mensajes de error con la traza o el SQL | Provocar un error en producción | Mensaje genérico; detalle solo al log |
| 20 | Cookies de sesión sin `HttpOnly` / token en `localStorage` | DevTools → Application | Cookie `HttpOnly; Secure; SameSite` |
| 21 | Analítica y píxeles en el `<head>` sin consentimiento | Ventana privada + pestaña Network | Gestor de consentimiento, Consent Mode por defecto denegado |
| 22 | Formulario de contacto que manda a la dirección que llega en el formulario | Leer el handler del envío | Destinatario fijo en servidor |
| 23 | Subidas sin límite de tamaño ni tipo | Leer el handler de subida | Lista blanca + tamaño + bucket privado |
| 24 | Contraseñas con hash débil o en claro | `grep -rnE "md5\|sha1\|createHash\('sha256'\)"` cerca de `password` | Argon2id o bcrypt, o proveedor de auth |
| 25 | JWT leído con `decode` sin verificar | `grep -rn "jwt.decode"` | `jwt.verify` con algoritmo fijado |
| 26 | Endpoint de IA abierto sin login ni tope | Llamarlo sin sesión | Sesión + límite + tope en el proveedor |
| 27 | Versiones antiguas de Next.js/React con avisos críticos | `npm audit` · `npm ls next react` | Actualizar a la versión parcheada de la rama |
| 28 | Source maps publicados | `curl -sI https://dominio/_next/static/.../*.js.map` | Desactivarlos en el build |

## Cómo pedírselo bien al agente que construye

Añade al principio de cualquier encargo de código: «Aplica la skill blindaje en modo construcción: claves solo en servidor, auth y permiso en cada ruta, RLS en cada tabla, webhooks firmados, contenido de pago con URL firmada y nada de terceros antes del consentimiento».
