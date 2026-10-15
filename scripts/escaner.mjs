#!/usr/bin/env node
// blindaje · escáner local de seguridad. Sin dependencias (Node 18+).
// Lee ficheros de la carpeta indicada y, si se pasa --url, hace como mucho 5 peticiones GET
// a ese mismo dominio (página, versión http, security.txt, /.env y /.git/HEAD).
// No envía nada a ningún otro sitio. No modifica ningún fichero.
//
// Uso:  node escaner.mjs <carpeta> [--url https://tudominio.com] [--json]
// Salida: hallazgos por nivel. Código de salida 1 si hay Crítico o Alto.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const NIVELES = ['Crítico', 'Alto', 'Medio', 'Bajo'];
const MAX_BYTES = 2 * 1024 * 1024;
const SALTAR_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'vendor', '.venv', 'venv', '__pycache__', '.turbo', '.cache', 'coverage', '.vercel', '.netlify', '.idea', '.vscode']);
const DIRS_BUILD = /(^|\/)(\.next|dist|build|out|_site|\.output|\.svelte-kit)(\/|$)/;
const EXT_TEXTO = /\.(m?[jt]sx?|cjs|vue|svelte|astro|html?|json|ya?ml|toml|sql|rules|php|py|rb|go|conf|xml|txt|md|env(\..*)?)$|(^|\/)(\.env[^/]*|\.htaccess|_headers|_redirects|Dockerfile|firestore\.rules|storage\.rules|database\.rules\.json)$/i;
const EXT_CODIGO = /\.(m?[jt]sx?|cjs|vue|svelte|astro|html?|php|py|rb|go)$/i;
const EXT_MEDIA = /\.(mp4|webm|mov|m4v|mkv|avi|m3u8|mp3|m4a|wav)$/i;
const PALABRAS_CURSO = /(curso|course|modulo|module|leccion|lesson|clase|class|premium|miembros|members|alumnos|students|paid|pago)/i;
const DIRS_PUBLICOS = /(^|\/)(public|static|www|assets|dist|build|out|_site)(\/|$)/;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Uso: node escaner.mjs <carpeta> [--url https://tudominio.com] [--json]');
  process.exit(0);
}
const urlIdx = args.indexOf('--url');
const URL_OBJ = urlIdx >= 0 ? args[urlIdx + 1] : null;
const JSON_OUT = args.includes('--json');
const RAIZ = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--url') || '.');

const hallazgos = [];
const vistos = new Set();
function anota(nivel, regla, titulo, donde, detalle, arreglo) {
  const clave = `${regla}|${donde}`;
  if (vistos.has(clave)) return;
  vistos.add(clave);
  hallazgos.push({ nivel, regla, titulo, donde, detalle, arreglo });
}
const enmascara = (s) => (s.length <= 12 ? s.slice(0, 4) + '…' : s.slice(0, 8) + '…' + s.slice(-3));
const linea = (txt, idx) => txt.slice(0, idx).split('\n').length;

// ---------- recorrido ----------
function recorre(dir, salida = []) {
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return salida; }
  for (const e of entradas) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(RAIZ, abs).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (SALTAR_DIRS.has(e.name) || rel === '.next/cache' || rel.endsWith('/.next/cache')) continue;
      recorre(abs, salida);
    } else if (e.isFile()) salida.push(rel);
  }
  return salida;
}
if (!fs.existsSync(RAIZ) || !fs.statSync(RAIZ).isDirectory()) {
  console.error(`No existe la carpeta: ${RAIZ}`);
  process.exit(2);
}
const ficheros = recorre(RAIZ);
const leer = (rel) => {
  try {
    const st = fs.statSync(path.join(RAIZ, rel));
    if (st.size > MAX_BYTES) return null;
    return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  } catch { return null; }
};

// ---------- 1. secretos ----------
const SECRETOS = [
  { re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/g, que: 'Clave secreta de Stripe (live)', grave: true },
  { re: /\bsk_test_[0-9A-Za-z]{20,}\b/g, que: 'Clave secreta de Stripe (test)', grave: false },
  { re: /\bwhsec_[0-9A-Za-z]{20,}\b/g, que: 'Secreto de webhook de Stripe', grave: true },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, que: 'Clave de Anthropic', grave: true },
  { re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g, que: 'Clave de OpenAI', grave: true },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, que: 'Clave de acceso de AWS', grave: true },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/g, que: 'Token de GitHub', grave: true },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, que: 'Token de Slack', grave: true },
  { re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, que: 'Clave de SendGrid', grave: true },
  { re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g, que: 'Clave secreta de Supabase', grave: true },
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----\s*[A-Za-z0-9+\/=]{40,}/g, que: 'Clave privada', grave: true },
];
const RE_JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const RE_GENERICO = /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN)[A-Z0-9_]*)\s*[:=]\s*['"]([^'"\s]{12,})['"]/g;
const PLACEHOLDER = /(process\.env|import\.meta|xxx|your[_-]|tu[_-]|<|\$\{|example|ejemplo|changeme|placeholder|dummy|\*\*\*)/i;
const RE_PUBLICO_SECRETO = /\b(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_)[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|OPENAI|ANTHROPIC|SK_LIVE|WEBHOOK|ADMIN_KEY)[A-Z0-9_]*\b/g;

const esEnv = (rel) => /(^|\/)\.env(\.|$)/.test(rel) && !/\.(example|sample|template|dist)$/.test(rel);
const esCliente = (rel, txt) =>
  /\.(html?|vue|svelte|jsx|tsx)$/i.test(rel) && !/(^|\/)(api|server)\//.test(rel) && !/route\.(t|j)sx?$/.test(rel)
  || /(^|\/)(public|static|components|\.next\/static|dist|build|out)\//.test(rel)
  || /^\s*['"]use client['"]/m.test(txt || '');

for (const rel of ficheros) {
  if (!EXT_TEXTO.test(rel) && !esEnv(rel)) continue;
  const txt = leer(rel);
  if (txt == null) continue;
  const env = esEnv(rel);
  const cliente = !env && esCliente(rel, txt);
  const doc = /\.md$/i.test(rel);

  for (const s of SECRETOS) {
    for (const m of txt.matchAll(s.re)) {
      if (env) continue; // en .env es su sitio; se revisa abajo si .env está en git
      const nivel = cliente ? 'Crítico' : (s.grave ? 'Alto' : 'Medio');
      anota(nivel, 'secreto', `${s.que} escrita en ${cliente ? 'código que llega al navegador' : doc ? 'documentación' : 'el código'}`,
        `${rel}:${linea(txt, m.index)}`, `Valor: ${enmascara(m[0])}`,
        'Rótala en el proveedor ya. Muévela a una variable de entorno sin prefijo público y úsala solo en el servidor.');
    }
  }
  for (const m of txt.matchAll(RE_JWT)) {
    try {
      const carga = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString('utf8'));
      if (carga && carga.role === 'service_role') {
        anota(cliente ? 'Crítico' : env ? 'Medio' : 'Alto', 'service_role', 'JWT de Supabase con rol service_role (se salta la RLS)',
          `${rel}:${linea(txt, m.index)}`, `Valor: ${enmascara(m[0])}`,
          cliente ? 'Rótala (Supabase → Settings → API) y úsala solo en el servidor.' : 'Comprueba que nunca llega al cliente ni al repo.');
      }
    } catch { /* no es JSON */ }
  }
  for (const m of txt.matchAll(RE_PUBLICO_SECRETO)) {
    if (doc || /PUBLISHABLE|ANON/.test(m[0])) continue; // en documentación se nombran como ejemplo
    anota('Crítico', 'publico-secreto', `Variable pública con nombre de secreto: ${m[0]}`,
      `${rel}:${linea(txt, m.index)}`, 'Todo lo que lleva ese prefijo se mete en el JavaScript que descarga el visitante.',
      'Quita el prefijo público, usa la variable solo en el servidor y rota la clave.');
  }
  if (!env && EXT_CODIGO.test(rel) && !DIRS_BUILD.test(rel)) {
    for (const m of txt.matchAll(RE_GENERICO)) {
      if (PLACEHOLDER.test(m[2])) continue;
      anota('Medio', 'secreto-generico', `Posible secreto escrito en el código (${m[1]})`, `${rel}:${linea(txt, m.index)}`,
        `Valor: ${enmascara(m[2])}`, 'Si es real: variable de entorno en el servidor y rotarlo.');
    }
  }
}

// ---------- 2. .env en git y .gitignore ----------
const envs = ficheros.filter(esEnv);
const gitignore = leer('.gitignore') || '';
const ignoraEnv = /^\s*(\.env\*?|\*\.env|\.env\.\*|\.env\.local|\.env\*\.local)\s*$/m.test(gitignore);
const hayGit = fs.existsSync(path.join(RAIZ, '.git'));
let trackeados = [], historial = [];
if (hayGit) {
  try {
    trackeados = execFileSync('git', ['-C', RAIZ, 'ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter((f) => esEnv(f));
    historial = [...new Set(execFileSync('git', ['-C', RAIZ, 'log', '--all', '--format=', '--name-only', '--diff-filter=A'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 50 * 1024 * 1024 })
      .split('\n').filter((f) => esEnv(f)))];
  } catch { /* sin git */ }
}
for (const f of trackeados) anota('Crítico', 'env-git', `${f} está subido al repositorio`, f, 'Cualquiera con acceso al repo tiene tus claves.',
  'Rota todas las claves que contiene, añade .env* a .gitignore y haz git rm --cached ' + f + '.');
for (const f of historial.filter((f) => !trackeados.includes(f))) anota('Alto', 'env-historial', `${f} estuvo en el historial de git`, f,
  'Aunque ya no esté, sigue en commits anteriores.', 'Rota las claves. Limpiar el historial (git filter-repo) solo con permiso.');
if (envs.length && !ignoraEnv) anota(hayGit ? 'Alto' : 'Medio', 'gitignore', '.gitignore no excluye los ficheros .env', '.gitignore',
  `Hay ${envs.length} fichero(s) .env en el proyecto.`, 'Añade «.env*» y «!.env.example» a .gitignore.');

// ---------- 3. rutas de servidor ----------
const RE_RUTA = /((^|\/)app\/(.*\/)?route\.(m?[jt]s)$)|((^|\/)pages\/api\/.*\.(m?[jt]sx?)$)|(^(src\/)?api\/.*\.(m?[jt]s)$)|((^|\/)netlify\/functions\/)|((^|\/)supabase\/functions\/.*\.(t|j)s$)|((^|\/)server\/api\/)|((^|\/)routes\/.*\+server\.(t|j)s$)|((^|\/)src\/pages\/api\/)/;
const RE_WEBHOOK_PISTA = /webhook|stripe-signature|checkout\.session\.completed|invoice\.paid|payment_intent\.succeeded|customer\.subscription/i;
const RE_FIRMA = /constructEvent(Async)?\s*\(|webhooks\.verify|new\s+Webhook\s*\(|verifySignature|verifyWebhook|validateWebhook|timingSafeEqual|svix|verifyHeader|unwrap\s*\(/;
const RE_AUTH = /getServerSession|\bauth\s*\(\s*\)|currentUser|getUser\s*\(|getSession\s*\(|getClaims\s*\(|verifyIdToken|jwt\.verify|jwtVerify|requireAuth|withAuth|requireUser|getAuth\s*\(|clerk|validateRequest|lucia|authorization|CRON_SECRET|x-api-key|apiKey\s*!==|session\?\.user|locals\.user|event\.locals\.(user|session)/i;
const RE_DATOS = /\.from\(|findMany|findUnique|findFirst|\bselect\b|\bprisma\b|\bdb\.|collection\(|getDocs|query\(|sql`|\.execute\(/i;
for (const rel of ficheros) {
  if (!RE_RUTA.test(rel) || DIRS_BUILD.test(rel) || !EXT_CODIGO.test(rel)) continue;
  const txt = leer(rel);
  if (txt == null) continue;
  const esWebhook = /webhook/i.test(rel) || RE_WEBHOOK_PISTA.test(txt);
  if (esWebhook) {
    if (!RE_FIRMA.test(txt)) {
      anota('Crítico', 'webhook-sin-firma', 'Webhook que no verifica la firma', rel,
        'Cualquiera puede mandarle un evento falso de «pago completado» y obtener acceso gratis.',
        'Verifica con stripe.webhooks.constructEvent(cuerpoCrudo, firma, secreto) o el método de tu proveedor; guarda event.id para no repetir.');
    } else if (/req(uest)?\.json\(\)/.test(txt) && /constructEvent/.test(txt) && txt.search(/\.json\(\)/) < txt.search(/constructEvent/)) {
      anota('Alto', 'webhook-cuerpo', 'El webhook parsea el JSON antes de verificar la firma', rel,
        'La firma se calcula sobre el cuerpo crudo; parsearlo antes rompe la verificación o invita a saltársela.', 'Usa await req.text() y verifica antes de parsear.');
    }
    continue;
  }
  if (!RE_AUTH.test(txt)) {
    const tocaDatos = RE_DATOS.test(txt);
    anota(tocaDatos ? 'Alto' : 'Medio', 'ruta-sin-auth', `Ruta de servidor sin comprobación de sesión visible${tocaDatos ? ' (y lee o escribe datos)' : ''}`, rel,
      'Por confirmar: si es pública a propósito (contacto, salud), que tenga validación y límite de peticiones.',
      'Al principio del handler: obtén la sesión, devuelve 401 si no hay, y filtra los datos por el id del usuario de la sesión.');
  }
  if (/to\s*:\s*(req\.body|body|data|formData|input|values)\b/.test(txt)) {
    anota('Alto', 'rele-spam', 'El destinatario del correo sale del formulario (relé de spam)', rel, '', 'Destinatario fijo en el servidor; el correo del usuario solo en Reply-To validado.');
  }
}

// ---------- 4. terceros antes del consentimiento ----------
const RE_TRACKER = /(googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|fbevents\.js|static\.hotjar\.com|clarity\.ms|analytics\.tiktok\.com|snap\.licdn\.com|px\.ads\.linkedin\.com|doubleclick\.net|static\.ads-twitter\.com)/i;
const RE_CONSENT = /cookieconsent|cookiebot|onetrust|klaro|iubenda|termly|usercentrics|complianz|gtag\(\s*['"]consent|data-categoria|data-category|data-cookieconsent|hasConsent|consentGiven|useConsent|consentimiento-cookies/i;
for (const rel of ficheros) {
  if (!/\.(html?|jsx|tsx|vue|svelte|astro|php)$/i.test(rel) || DIRS_BUILD.test(rel)) continue;
  const txt = leer(rel);
  if (txt == null) continue;
  const reTag = /<(script|Script)\b[^>]*>/g;
  for (const m of txt.matchAll(reTag)) {
    const tag = m[0];
    const resto = txt.slice(m.index, m.index + 600);
    if (!RE_TRACKER.test(tag) && !/(gtag\(\s*['"]config|fbq\(\s*['"]init|hj\(|clarity\()/.test(resto.split(/<\/script>/i)[0])) continue;
    if (/type\s*=\s*["']text\/plain["']|data-(categoria|category|cookieconsent)/i.test(tag)) continue;
    const conGestor = RE_CONSENT.test(txt);
    anota(conGestor ? 'Medio' : 'Alto', 'tracker-sin-consentimiento',
      conGestor ? 'Script de analítica o publicidad: comprueba que solo carga tras aceptar' : 'Analítica o píxel que carga antes del consentimiento',
      `${rel}:${linea(txt, m.index)}`, 'LSSI art. 22.2 y guía de cookies de la AEPD: nada no esencial antes de aceptar.',
      'Cámbialo a <script type="text/plain" data-categoria="analitica" data-src="…"> y actívalo desde el banner (plantillas/cookies.md).');
  }
  const yt = txt.search(/youtube\.com\/embed\//);
  if (yt >= 0) anota('Medio', 'youtube-embed', 'Vídeo de YouTube incrustado sin modo de privacidad', `${rel}:${linea(txt, yt)}`,
    'Pone cookies de terceros al cargar la página.', 'Usa youtube-nocookie.com y carga el iframe al pulsar o tras el consentimiento.');
  for (const m of txt.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi)) {
    if (RE_TRACKER.test(m[1])) continue;
    if (/^http:\/\//i.test(m[1])) anota('Medio', 'script-http', 'Script cargado por http://', `${rel}:${linea(txt, m.index)}`, m[1], 'Cárgalo por https:// o sírvelo desde tu dominio.');
    else if (!/\bintegrity\s*=/.test(m[0])) anota('Bajo', 'sri', 'Script de CDN sin integridad (SRI)', `${rel}:${linea(txt, m.index)}`, m[1],
      'Fija la versión y añade integrity="sha384-…" crossorigin="anonymous", o sírvelo desde tu dominio.');
  }
}

// ---------- 5. contenido de pago público ----------
const sitioEstatico = fs.existsSync(path.join(RAIZ, 'index.html')) && !fs.existsSync(path.join(RAIZ, 'package.json'));
for (const rel of ficheros) {
  const publico = DIRS_PUBLICOS.test(rel) || sitioEstatico;
  if (!publico) continue;
  if (EXT_MEDIA.test(rel)) {
    anota(PALABRAS_CURSO.test(rel) ? 'Crítico' : 'Alto', 'media-publica', 'Vídeo o audio servido como fichero público', rel,
      'Cualquiera con la URL lo descarga y lo comparte, sin pagar ni iniciar sesión.',
      'Súbelo a un proveedor con URLs firmadas que caducan (Mux, Cloudflare Stream, Bunny Stream, bucket privado con URL prefirmada) y genera la URL en el servidor tras comprobar la compra.');
  } else if (/\.(pdf|zip|epub)$/i.test(rel) && PALABRAS_CURSO.test(rel)) {
    anota('Alto', 'descarga-publica', 'Material de pago descargable sin control de acceso', rel, '', 'Bucket privado + URL firmada de pocos minutos, generada en el servidor.');
  }
}
for (const rel of ficheros) {
  if (!EXT_CODIGO.test(rel) || DIRS_BUILD.test(rel)) continue;
  const txt = leer(rel);
  if (txt == null) continue;
  for (const m of txt.matchAll(/https?:\/\/[^\s'"`)]+?(?:\/storage\/v1\/object\/public\/|\.s3[.-][^\s'"`]*amazonaws\.com\/|\.r2\.dev\/|\.b-cdn\.net\/)[^\s'"`)]*\.(?:mp4|webm|mov|m3u8|pdf|zip)\b(?![^\s'"`]*(X-Amz-Signature|token=))/gi)) {
    anota('Alto', 'media-bucket-publico', 'Enlace a vídeo o descarga en un almacenamiento público', `${rel}:${linea(txt, m.index)}`, m[0].slice(0, 120),
      'Bucket privado y URL firmada con caducidad, generada en el servidor.');
  }
}

// ---------- 6. security.txt ----------
const stxt = ficheros.find((f) => /(^|\/)\.well-known\/security\.txt$/.test(f));
const esWeb = ['package.json', 'index.html', 'public', 'static'].some((f) => fs.existsSync(path.join(RAIZ, f)));
if (!stxt && esWeb) {
  anota('Bajo', 'security-txt', 'Falta /.well-known/security.txt', '.well-known/security.txt (en la carpeta pública)',
    'Quien encuentre un fallo no sabe a quién avisar (RFC 9116).', 'Crea el fichero desde references/plantillas/security.txt con Contact y Expires.');
} else if (stxt) {
  const t = leer(stxt) || '';
  const exp = t.match(/^Expires:\s*(\S+)/mi);
  if (!/^Contact:/mi.test(t) || !exp) anota('Bajo', 'security-txt', 'security.txt sin Contact o Expires', stxt, '', 'Ambos campos son obligatorios.');
  else {
    const d = new Date(exp[1]);
    if (isNaN(d) || d < new Date()) anota('Bajo', 'security-txt', 'security.txt caducado o con fecha no válida', stxt, exp[1], 'Pon Expires a menos de un año vista.');
    else if (d - Date.now() > 366 * 864e5) anota('Bajo', 'security-txt', 'security.txt con Expires a más de un año', stxt, exp[1], 'El RFC recomienda menos de un año.');
  }
}

// ---------- 7. source maps ----------
const mapas = ficheros.filter((f) => /\.(js|css)\.map$/.test(f) && (DIRS_BUILD.test(f) || DIRS_PUBLICOS.test(f)));
if (mapas.length) anota('Medio', 'source-maps', `${mapas.length} source map(s) en carpetas que se publican`, mapas.slice(0, 3).join(', '),
  'Dejan leer tu código original.', 'Desactívalos en el build de producción o súbelos solo a tu herramienta de errores.');
for (const rel of ficheros.filter((f) => /(next|vite|nuxt|astro)\.config\.(m?[jt]s)$/.test(f))) {
  const txt = leer(rel) || '';
  const i = txt.search(/productionBrowserSourceMaps\s*:\s*true|sourcemap\s*:\s*true/);
  if (i >= 0) anota('Medio', 'source-maps', 'Source maps activados para producción', `${rel}:${linea(txt, i)}`, '', 'Ponlo a false (o "hidden" en Vite).');
  const j = txt.search(/poweredByHeader\s*:\s*true/);
  if (j >= 0) anota('Bajo', 'version', 'Cabecera X-Powered-By activada', `${rel}:${linea(txt, j)}`, '', 'poweredByHeader: false.');
}

// ---------- 8. patrones peligrosos ----------
const PATRONES = [
  { re: /dangerouslySetInnerHTML/g, nivel: 'Medio', t: 'HTML sin escapar en React (dangerouslySetInnerHTML)', a: 'Si lleva datos del usuario o del modelo: DOMPurify.sanitize() o texto plano.', salvo: /DOMPurify|sanitize/ },
  { re: /\.(innerHTML|outerHTML)\s*=\s*(?!\s*['"`]\s*['"`]\s*;?)/g, nivel: 'Medio', t: 'Asignación a innerHTML', a: 'Usa textContent o sanea con DOMPurify.', salvo: /DOMPurify|sanitize/ },
  { re: /\beval\s*\(|new\s+Function\s*\(/g, nivel: 'Medio', t: 'eval o new Function', a: 'Elimínalo; nunca con datos externos.' },
  { re: /\bexec(Sync)?\s*\(\s*(`[^`]*\$\{|[^'"`),]+\+)/g, nivel: 'Alto', t: 'Comando del sistema montado con datos variables', a: 'execFile con argumentos en array y lista blanca.' },
  { re: /\$(queryRawUnsafe|executeRawUnsafe)|\bsql\.unsafe\s*\(/g, nivel: 'Alto', t: 'Consulta SQL sin parametrizar', a: 'Usa la versión parametrizada ($queryRaw con plantilla etiquetada).' },
  { re: /\b(query|execute|raw)\s*\(\s*`[^`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/gi, nivel: 'Alto', t: 'SQL montado con interpolación de texto', a: 'Parámetros ($1, ?) u ORM.' },
  { re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/g, nivel: 'Medio', t: 'Verificación TLS desactivada', a: 'Quítalo; arregla el certificado.' },
  { re: /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*['"]|origin\s*:\s*['"]\*['"]/g, nivel: 'Medio', t: 'CORS abierto a cualquier origen', a: 'Quita CORS si no hace falta o usa lista blanca.' },
  { re: /origin\s*:\s*true[\s\S]{0,80}credentials\s*:\s*true|credentials\s*:\s*true[\s\S]{0,80}origin\s*:\s*true/g, nivel: 'Alto', t: 'CORS refleja cualquier origen con credenciales', a: 'Lista blanca de orígenes.' },
  { re: /\bjwt\.decode\s*\(/g, nivel: 'Medio', t: 'JWT leído sin verificar (jwt.decode)', a: 'jwt.verify con el algoritmo fijado.' },
  { re: /createHash\(\s*['"](md5|sha1)['"]\s*\)/g, nivel: 'Medio', t: 'Hash débil (MD5/SHA-1)', a: 'Para contraseñas: Argon2id o bcrypt. Para firmas: HMAC-SHA256.' },
  { re: /localStorage\.setItem\(\s*['"][^'"]*(token|jwt|session|auth)[^'"]*['"]/gi, nivel: 'Medio', t: 'Token de sesión en localStorage', a: 'Cookie HttpOnly; Secure; SameSite.' },
];
for (const rel of ficheros) {
  if (!EXT_CODIGO.test(rel) || DIRS_BUILD.test(rel) || /\.min\.js$/.test(rel)) continue;
  const txt = leer(rel);
  if (txt == null) continue;
  for (const p of PATRONES) {
    if (p.salvo && p.salvo.test(txt)) continue;
    for (const m of txt.matchAll(p.re)) anota(p.nivel, 'patron:' + p.t, p.t, `${rel}:${linea(txt, m.index)}`, '', p.a);
  }
}

// ---------- 9. Firebase y Supabase ----------
for (const rel of ficheros.filter((f) => /(firestore|storage|database)\.rules(\.json)?$/.test(f))) {
  const txt = leer(rel) || '';
  for (const m of txt.matchAll(/allow\s+[\w, ]+:\s*if\s+true\s*;|".read"\s*:\s*true|".write"\s*:\s*true/g))
    anota('Crítico', 'firebase-abierto', 'Regla de Firebase abierta a todo el mundo', `${rel}:${linea(txt, m.index)}`, m[0],
      'Exige request.auth != null y que el usuario sea el dueño del documento.');
  for (const m of txt.matchAll(/request\.time\s*<\s*timestamp/g))
    anota('Alto', 'firebase-prueba', 'Reglas de Firebase en «modo prueba» con fecha', `${rel}:${linea(txt, m.index)}`, '', 'Sustitúyelas por reglas por usuario.');
}
const sqls = ficheros.filter((f) => /\.sql$/i.test(f));
if (sqls.length) {
  const tablas = new Map(); const conRls = new Set();
  for (const rel of sqls) {
    const txt = leer(rel) || '';
    for (const m of txt.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gi)) {
      if (m[1] && !/^public$/i.test(m[1])) continue;
      if (!tablas.has(m[2].toLowerCase())) tablas.set(m[2].toLowerCase(), `${rel}:${linea(txt, m.index)}`);
    }
    for (const m of txt.matchAll(/alter\s+table\s+(?:only\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi)) conRls.add(m[1].toLowerCase());
    for (const m of txt.matchAll(/disable\s+row\s+level\s+security/gi))
      anota('Crítico', 'rls-off', 'Se desactiva la RLS de una tabla', `${rel}:${linea(txt, m.index)}`, '', 'Actívala y define políticas por operación.');
    for (const m of txt.matchAll(/using\s*\(\s*true\s*\)/gi))
      anota('Alto', 'rls-true', 'Política RLS que deja pasar a todos: using (true)', `${rel}:${linea(txt, m.index)}`, 'Por confirmar: solo vale para datos públicos de lectura.', 'using (auth.uid() = user_id).');
  }
  const esSupabase = fs.existsSync(path.join(RAIZ, 'supabase')) || ficheros.some((f) => /supabase/i.test(f));
  for (const [t, donde] of tablas) if (!conRls.has(t) && esSupabase)
    anota('Crítico', 'rls-falta', `Tabla «${t}» sin RLS activada en las migraciones`, donde,
      'Con la clave anon (pública) se puede leer y escribir entera.', `alter table public.${t} enable row level security; y políticas por operación.`);
}

// ---------- 10. dependencias ----------
if (fs.existsSync(path.join(RAIZ, 'package.json'))) {
  const lock = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'].some((f) => fs.existsSync(path.join(RAIZ, f)));
  if (!lock) anota('Medio', 'lockfile', 'Sin lockfile: cada instalación puede traer versiones distintas', 'package.json', '', 'Genera y sube el lockfile; despliega con npm ci.');
  anota('Bajo', 'audit', 'Revisa vulnerabilidades conocidas de las dependencias', 'package.json',
    'Este escáner no consulta bases de vulnerabilidades (no envía nada fuera).', 'Ejecuta tú: npm audit --omit=dev (o pnpm audit / osv-scanner).');
}

// ---------- 11. URL publicada ----------
async function revisaUrl(u) {
  let base;
  try { base = new URL(u); } catch { anota('Bajo', 'url', 'URL no válida', u, '', ''); return; }
  const ua = { 'user-agent': 'blindaje-escaner/1.0 (+auditoria propia)' };
  const pide = (x, extra = {}) => fetch(x, { headers: ua, signal: AbortSignal.timeout(10000), ...extra });
  let res, html = '';
  try { res = await pide(base.href); html = (await res.text()).slice(0, 500000); }
  catch (e) { anota('Alto', 'url', 'No se pudo cargar la URL', base.href, String(e.message || e), ''); return; }
  const h = (n) => res.headers.get(n);
  const donde = base.origin;
  if (base.protocol === 'https:') {
    const hsts = h('strict-transport-security');
    if (!hsts) anota('Medio', 'hsts', 'Falta Strict-Transport-Security (HSTS)', donde, '', 'Ver references/cabeceras.md.');
    else if (+((hsts.match(/max-age=(\d+)/) || [])[1] || 0) < 15552000) anota('Bajo', 'hsts', 'HSTS con max-age corto', donde, hsts, 'max-age=63072000; includeSubDomains');
    try {
      const r2 = await pide('http://' + base.host + base.pathname, { redirect: 'manual' });
      const loc = r2.headers.get('location') || '';
      if (!(r2.status >= 300 && r2.status < 400 && loc.startsWith('https://'))) anota('Medio', 'http', 'La versión http:// no redirige a https://', 'http://' + base.host, `Estado ${r2.status}`, 'Redirección 301 a https en el servidor o el hosting.');
    } catch { /* puerto 80 cerrado: correcto */ }
  } else anota('Crítico', 'https', 'La web se sirve sin HTTPS', donde, '', 'Activa TLS (Let\'s Encrypt o el del hosting) y redirige.');
  const csp = h('content-security-policy');
  if (!csp) anota('Medio', 'csp', 'Falta Content-Security-Policy', donde, h('content-security-policy-report-only') ? 'Hay versión Report-Only.' : '', 'Ver references/cabeceras.md (empieza en Report-Only).');
  else if (/script-src[^;]*'unsafe-(inline|eval)'/.test(csp)) anota('Bajo', 'csp', 'La CSP permite scripts en línea o eval', donde, '', 'Usa nonce o hashes.');
  if (!(csp && /frame-ancestors/.test(csp)) && !h('x-frame-options')) anota('Medio', 'clickjacking', 'Sin protección contra iframes (frame-ancestors / X-Frame-Options)', donde, '', "frame-ancestors 'none' en la CSP y X-Frame-Options: DENY.");
  if ((h('x-content-type-options') || '').toLowerCase() !== 'nosniff') anota('Bajo', 'nosniff', 'Falta X-Content-Type-Options: nosniff', donde, '', '');
  if (!h('referrer-policy')) anota('Bajo', 'referrer', 'Falta Referrer-Policy', donde, '', 'strict-origin-when-cross-origin');
  if (!h('permissions-policy')) anota('Bajo', 'permissions', 'Falta Permissions-Policy', donde, '', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  if (h('x-powered-by')) anota('Bajo', 'version', 'Cabecera X-Powered-By expone la tecnología', donde, h('x-powered-by'), 'Quítala.');
  if (/\d/.test(h('server') || '')) anota('Bajo', 'version', 'La cabecera Server expone la versión', donde, h('server'), 'server_tokens off / ServerTokens Prod.');
  if (h('access-control-allow-origin') === '*') anota('Medio', 'cors', 'La página responde con Access-Control-Allow-Origin: *', donde, '', 'Quítalo salvo que sea una API pública sin credenciales.');
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of cookies) {
    const nombre = c.split('=')[0];
    const falta = [];
    if (!/;\s*secure/i.test(c) && base.protocol === 'https:') falta.push('Secure');
    if (!/;\s*samesite/i.test(c)) falta.push('SameSite');
    if (/sess|auth|token|sid/i.test(nombre) && !/;\s*httponly/i.test(c)) falta.push('HttpOnly');
    if (falta.length) anota('Medio', 'cookie:' + nombre, `Cookie «${nombre}» sin ${falta.join(', ')}`, donde, '', 'Set-Cookie con HttpOnly; Secure; SameSite=Lax.');
  }
  if (cookies.length) anota('Medio', 'cookies-primera-carga', `La primera respuesta ya pone ${cookies.length} cookie(s)`, donde, cookies.map((c) => c.split('=')[0]).join(', '),
    'Por confirmar: si no son estrictamente necesarias, no pueden ponerse antes del consentimiento.');
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    if (RE_TRACKER.test(m[0]) && !/type\s*=\s*["']text\/plain["']/i.test(m[0]))
      anota('Alto', 'tracker-url', 'La página publicada carga analítica o píxeles antes del consentimiento', donde, (m[0].match(RE_TRACKER) || [''])[0],
        'Bloquéalos hasta que acepten (plantillas/cookies.md).');
  }
  try {
    const r = await pide(base.origin + '/.well-known/security.txt');
    const t = r.ok ? await r.text() : '';
    if (!r.ok || !/^Contact:/mi.test(t)) anota('Bajo', 'security-txt-url', 'No se publica /.well-known/security.txt', base.origin + '/.well-known/security.txt', `Estado ${r.status}`, 'Plantilla en references/plantillas/security.txt.');
  } catch { /* nada */ }
  try {
    const r = await pide(base.origin + '/.env', { redirect: 'manual' });
    const t = r.ok ? (await r.text()).slice(0, 2000) : '';
    if (r.ok && /^[A-Z0-9_]+\s*=/m.test(t) && !/<html/i.test(t)) anota('Crítico', 'env-publico', 'El fichero /.env se puede descargar', base.origin + '/.env', '', 'Bloquéalo en el servidor, sácalo de la carpeta pública y rota todas las claves.');
  } catch { /* nada */ }
  try {
    const r = await pide(base.origin + '/.git/HEAD', { redirect: 'manual' });
    const t = r.ok ? (await r.text()).slice(0, 200) : '';
    if (r.ok && /^ref:\s*refs\//m.test(t)) anota('Crítico', 'git-publico', 'La carpeta /.git se sirve en la web', base.origin + '/.git/HEAD', '', 'Bloquea /.git en el servidor: se puede reconstruir todo el código y su historial.');
  } catch { /* nada */ }
}

// ---------- salida ----------
if (URL_OBJ) await revisaUrl(URL_OBJ);
hallazgos.sort((a, b) => NIVELES.indexOf(a.nivel) - NIVELES.indexOf(b.nivel));
const cuenta = Object.fromEntries(NIVELES.map((n) => [n, hallazgos.filter((h) => h.nivel === n).length]));
if (JSON_OUT) {
  console.log(JSON.stringify({ carpeta: RAIZ, url: URL_OBJ, ficheros: ficheros.length, cuenta, hallazgos }, null, 2));
} else {
  console.log(`\nblindaje · escáner local\nCarpeta: ${RAIZ}${URL_OBJ ? `\nURL: ${URL_OBJ}` : ''}\nFicheros revisados: ${ficheros.length}`);
  console.log(`Crítico ${cuenta['Crítico']} · Alto ${cuenta['Alto']} · Medio ${cuenta['Medio']} · Bajo ${cuenta['Bajo']}\n`);
  for (const n of NIVELES) {
    const del = hallazgos.filter((h) => h.nivel === n);
    if (!del.length) continue;
    console.log(`== ${n} (${del.length}) ==`);
    for (const x of del) {
      console.log(`- ${x.titulo}\n    dónde: ${x.donde}${x.detalle ? `\n    ${x.detalle}` : ''}${x.arreglo ? `\n    arreglo: ${x.arreglo}` : ''}`);
    }
    console.log('');
  }
  console.log('Esto es un primer barrido por patrones. No ve: permisos reales en la base de datos, IDOR, lógica del paywall,');
  console.log('configuración de paneles (Supabase, Stripe, hosting, DNS), 2FA ni backups. Eso lo cubre la checklist del agente (SKILL.md).');
}
process.exitCode = cuenta['Crítico'] || cuenta['Alto'] ? 1 : 0;
