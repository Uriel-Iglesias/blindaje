# Cabeceras listas para pegar

## Antes de pegar

1. **CSP en modo informe primero.** Publica `Content-Security-Policy-Report-Only` una semana, mira la consola del navegador y añade solo los dominios que de verdad usas. Luego cámbiala a `Content-Security-Policy`.
2. **Ajusta la CSP a tus terceros.** La base de abajo bloquea todo lo externo. Ejemplos de lo que suele hacer falta añadir:
   - Stripe: `script-src https://js.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; connect-src https://api.stripe.com`
   - Supabase: `connect-src https://<proyecto>.supabase.co wss://<proyecto>.supabase.co`
   - Google Analytics (tras consentimiento): `script-src https://www.googletagmanager.com; connect-src https://*.google-analytics.com https://*.analytics.google.com; img-src https://*.google-analytics.com`
   - Vídeo: `frame-src https://player.vimeo.com https://iframe.mediadelivery.net https://*.cloudflarestream.com` · `media-src https://stream.mux.com blob:`
3. **HSTS con cuidado.** Empieza sin `preload`. Añádelo solo cuando todos los subdominios sirvan HTTPS, y entonces inscríbete en hstspreload.org (es difícil dar marcha atrás).
4. **Verifica**: `curl -sI https://tudominio.com` o `node scripts/escaner.mjs . --url https://tudominio.com`.

## CSP base (sitio estático o SPA)

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; media-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

`'unsafe-inline'` en estilos es un compromiso aceptable (Tailwind y muchas librerías lo necesitan). En `script-src`, nunca `'unsafe-inline'` ni `'unsafe-eval'` si se puede evitar: usa nonce (ver Next.js).

## Vercel (`vercel.json`)

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), browsing-topics=()" }
      ]
    },
    {
      "source": "/.well-known/security.txt",
      "headers": [{ "key": "Content-Type", "value": "text/plain; charset=utf-8" }]
    }
  ]
}
```

## Netlify y Cloudflare Pages (`_headers` en la carpeta publicada)

```
/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()

/.well-known/security.txt
  Content-Type: text/plain; charset=utf-8
```

Netlify también acepta lo mismo en `netlify.toml`:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Strict-Transport-Security = "max-age=63072000; includeSubDomains"
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), browsing-topics=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
```

## Nginx (dentro del bloque `server` con TLS)

```nginx
server_tokens off;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), browsing-topics=()" always;

location ~ /\.(?!well-known) { deny all; }      # bloquea .env, .git, .htaccess…
location ~* \.(map|sql|bak|zip)$ { deny all; }
autoindex off;
```
Ojo: si un `location` tiene su propio `add_header`, no hereda los del `server`. Repite las cabeceras o usa un `include`.

## Apache (`.htaccess` o configuración del host)

```apache
<IfModule mod_headers.c>
  Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains"
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  Header unset X-Powered-By
</IfModule>
Options -Indexes
<FilesMatch "^\.(?!well-known)|\.(map|sql|bak|zip|env)$">
  Require all denied
</FilesMatch>
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```
`ServerTokens Prod` y `ServerSignature Off` van en la configuración principal (no en `.htaccess`).

## Next.js

### Cabeceras fijas (`next.config.js` / `next.config.ts`)

```js
const cabeceras = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
];

module.exports = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: '/:path*', headers: cabeceras }];
  },
};
```

### CSP con nonce (`middleware.ts`; en Next.js 16 el fichero se llama `proxy.ts`)

```ts
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
  const cabeceras = new Headers(req.headers);
  cabeceras.set('x-nonce', nonce);
  const res = NextResponse.next({ request: { headers: cabeceras } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico).*)' }],
};
```
Con nonce, las páginas se renderizan en cada petición (no estáticas). Si la web es casi toda estática, usa la CSP fija en `headers()` y evita scripts en línea.

Recuerda: el middleware pone cabeceras, pero **no** es tu control de acceso. La sesión se comprueba dentro de cada ruta.

## Cookies propias

```
Set-Cookie: sesion=…; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
```
Prefijo `__Host-` (exige `Secure`, `Path=/` y sin `Domain`) para la cookie de sesión si el framework lo permite.
