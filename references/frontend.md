# Frontend: checklist

Todo lo que llega al navegador es público. El usuario puede leerlo, cambiarlo y repetirlo. Cada punto: qué buscar, cómo comprobarlo, cómo arreglarlo.

Base: OWASP Top 10 (edición 2025), OWASP ASVS 5.0 (capítulos de codificación, configuración web y frontend) y la documentación de cabeceras de MDN.

## 1. Secretos en el bundle

**Buscar**
- Variables con prefijo público que suenan a secreto: `NEXT_PUBLIC_*SECRET*`, `VITE_*SERVICE_ROLE*`, `PUBLIC_*_PRIVATE*`, `REACT_APP_OPENAI_KEY`, `EXPO_PUBLIC_STRIPE_SECRET`.
- Claves literales en JS/TS/HTML: `sk_live_`, `rk_live_`, `whsec_`, `sk-proj-`, `sk-ant-`, `AKIA`, `ghp_`, `github_pat_`, `xox[bp]-`, `SG.`, `re_` (Resend), JWT con `"role":"service_role"`, `sb_secret_`, `-----BEGIN PRIVATE KEY-----`.
- El build ya generado: `.next/static`, `dist/`, `build/`, `out/`.

**Comprobar**
```bash
grep -rnE "sk_live_|sk-proj-|sk-ant-|service_role|sb_secret_|AKIA[0-9A-Z]{16}" .next/static dist build out 2>/dev/null
```
En una web publicada: DevTools → Sources → buscar `sk_` y `secret`.

**Arreglar**
1. Rotar la clave en el proveedor (ya está comprometida).
2. Moverla a una variable sin prefijo público y usarla solo en una ruta de servidor.
3. Si estaba en git: ver `despliegue.md`, sección historial.

## 2. XSS

**Buscar**: `dangerouslySetInnerHTML`, `v-html`, `{@html}` (Svelte), `innerHTML =`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function(`, `setTimeout("texto")`, URLs construidas con datos del usuario en `href` o `src` (`javascript:`), Markdown renderizado sin sanear.

**Arreglar**
- Renderizar como texto (`textContent`, interpolación normal de React/Vue).
- Si de verdad hace falta HTML: `DOMPurify.sanitize(html)` justo antes de pintar.
- Validar que los enlaces empiezan por `https://` o `/`.
- CSP como red de seguridad (`cabeceras.md`).

**Verificar**: meter `<img src=x onerror=alert(1)>` en cada campo que luego se muestra (nombre, comentario, bio, título de lección). No debe saltar nada.

## 3. Cabeceras

| Cabecera | Valor mínimo | Para qué |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Solo HTTPS, sin rebajas a HTTP |
| `Content-Security-Policy` | ver `cabeceras.md` | Frena XSS e inyecciones de scripts |
| `frame-ancestors` (en la CSP) | `'none'` o `'self'` | Evita que te metan en un iframe (clickjacking) |
| `X-Frame-Options` | `DENY` | Lo mismo para navegadores viejos |
| `X-Content-Type-Options` | `nosniff` | El navegador no adivina tipos |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | No filtra rutas con tokens a terceros |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), browsing-topics=()` | Apaga APIs que no usas |
| `Cross-Origin-Opener-Policy` | `same-origin` | Aísla la ventana (ojo con popups de pago u OAuth: prueba antes) |

No pongas `X-XSS-Protection: 1` (obsoleta, puede abrir fallos); si existe, `0`.
Quita `X-Powered-By` y versiones en `Server`.

**Verificar**: `node scripts/escaner.mjs . --url https://tudominio.com` o `curl -sI https://tudominio.com`.

## 4. Recursos de terceros (SRI)

- Todo `<script src="https://cdn…">` y `<link rel="stylesheet" href="https://cdn…">` con versión exacta, `integrity="sha384-…"` y `crossorigin="anonymous"`.
- Sin versión fija (`@latest`, `/npm/paquete` a secas) el SRI no sirve: fija la versión.
- Mejor aún: instalar el paquete y servirlo desde tu dominio.
- Generar el hash: `curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A`.

## 5. Formularios

- **Validación en servidor** con esquema. Longitudes máximas en todo.
- **Honeypot**: campo oculto con CSS (no `type=hidden`), `tabindex="-1"`, `autocomplete="off"`; si llega relleno, se descarta sin error visible.
- **Límite de peticiones**: por IP y por correo (por ejemplo 5 por minuto y 20 por hora). Upstash Ratelimit, el firewall del hosting o una tabla con contador.
- **CAPTCHA** solo si el honeypot y el límite no bastan; preferir Cloudflare Turnstile o similar (y tenerlo en la política de cookies si pone cookies).
- **Relé de spam**: el destinatario es fijo en el servidor. El texto del usuario nunca va en `From`, `Subject` sin sanear ni cabeceras. Para responder, `Reply-To` validado como correo.
- **Casilla de privacidad** en formularios que recogen datos: sin marcar por defecto, con enlace a la política e información básica de primera capa (responsable, finalidad, derechos).
- Mensajes de error que no revelan si un correo existe («si la cuenta existe, te hemos enviado un enlace»).

## 6. Terceros antes del consentimiento

Lo que pone cookies o identifica al visitante **no carga** hasta que acepta: Google Analytics, Tag Manager con etiquetas de marketing, Meta Pixel, TikTok Pixel, Hotjar, Microsoft Clarity, LinkedIn Insight, chats con seguimiento, vídeos de YouTube o Vimeo incrustados (usa `youtube-nocookie.com` y además carga el iframe al pulsar), mapas de Google, fuentes de Google cargadas desde su CDN (envían la IP: mejor autoalojarlas).

**Patrón correcto**
```html
<script type="text/plain" data-categoria="analitica" data-src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
```
El gestor de consentimiento cambia el tipo y carga el script solo tras aceptar. Con Google, Consent Mode v2 con todo en `denied` por defecto **antes** de cargar `gtag`.

**Verificar**: ventana privada, DevTools → Application → Cookies vacía de terceros y pestaña Network sin peticiones a dominios de analítica hasta pulsar Aceptar.

## 7. Source maps y restos de desarrollo

- Ningún `*.map` público en producción. Next.js: `productionBrowserSourceMaps` en `false` (por defecto). Vite: `build.sourcemap` en `false` o `'hidden'` y subirlos solo a tu herramienta de errores.
- Sin `console.log` con tokens, usuarios o respuestas de la API.
- Sin rutas de prueba (`/test`, `/debug`, `/admin-old`) desplegadas.
- `robots.txt` no es seguridad: no listes ahí rutas privadas.

## 8. Almacenamiento en el navegador

- Tokens de sesión en cookies `HttpOnly`, no en `localStorage` (cualquier XSS los lee).
- Nada de datos personales sensibles en `localStorage` o `sessionStorage`.
- Enlaces externos con `rel="noopener noreferrer"` si llevan `target="_blank"` y la página tiene datos en la URL.

## 9. Accesibilidad mínima (también es legal)

Si vendes a consumidores en la UE y no eres microempresa, la Ley Europea de Accesibilidad te obliga desde el 28-jun-2025 (ver `legal.md`). Mínimo comprobable: contraste AA, todo usable con teclado, foco visible, textos alternativos, formularios con etiquetas, vídeos de curso con subtítulos, banner de cookies usable con teclado y lector de pantalla.
