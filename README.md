# blindaje

Una skill para que tu agente de IA (Claude Code, Codex, Cursor y cualquiera compatible con Agent Skills) revise la **seguridad** y lo **legal** de lo que construye: webs, landings, cursos online, áreas de miembros, APIs y automatizaciones.

Pensada para quien vende cursos, mentorías o productos digitales y construye con agentes. El agente escribe rápido; esta skill hace que no se deje la puerta abierta.

## Qué hace

**1. Auditoría.** Recorre el proyecto entero (frontend, backend, base de datos, pagos, correo, IA, despliegue) y deja un `AUDITORIA-SEGURIDAD.md` con una lista de mejoras priorizada: Crítico, Alto, Medio, Bajo. Cada punto dice qué pasa, dónde (fichero y línea), por qué importa, cómo arreglarlo y cómo comprobar que quedó arreglado.

**2. Construcción segura.** Mientras el agente programa, aplica reglas por defecto: claves solo en el servidor, sesión y permiso en cada ruta, RLS en cada tabla, webhooks firmados, vídeo de pago con URLs que caducan, nada de analítica antes del consentimiento.

**3. Legal.** Crea o revisa aviso legal, privacidad, cookies (con un banner de Aceptar, Rechazar y Configurar al mismo nivel), condiciones de venta (desistimiento de 14 días y la excepción del contenido digital), página `/seguridad` y `/.well-known/security.txt`. Plantillas para España con [CORCHETES] donde van tus datos.

Incluye un escáner local en Node, sin dependencias, que busca claves expuestas, rutas sin login, webhooks sin firma, vídeos públicos, analítica antes de tiempo, source maps y, si le das una URL, cabeceras, cookies y ficheros expuestos.

## Instalación

Con el instalador de skills (detecta tu agente):
```bash
npx skills add Uriel-Iglesias/blindaje
```

Claude Code, a mano:
```bash
git clone https://github.com/Uriel-Iglesias/blindaje ~/.claude/skills/blindaje
```

Codex:
```bash
git clone https://github.com/Uriel-Iglesias/blindaje ~/.codex/skills/blindaje
```

claude.ai: descarga `blindaje.zip` y súbelo en **Ajustes → Capacidades → Skills**.

## Cómo usarla

Pídeselo con tus palabras. Por ejemplo:

- «Revisa la seguridad de mi web antes de publicar.»
- «Haz una auditoría de este proyecto y dime qué arreglo primero.»
- «¿Está bien protegido el vídeo de mi curso?»
- «Revisa que el webhook de Stripe sea seguro.»
- «Hazme el aviso legal, la privacidad y el banner de cookies.»
- «Mi academia usa Supabase: comprueba que un alumno no pueda ver los datos de otro.»
- «Revisa las cabeceras de https://midominio.com.»

El escáner también funciona solo:
```bash
node ~/.claude/skills/blindaje/scripts/escaner.mjs . --url https://midominio.com
```
Lee tus ficheros en local y solo hace peticiones a la URL que le pases. No envía nada a ningún otro sitio.

## Qué NO hace

- **No es asesoría legal.** Las plantillas son una base de trabajo. Revísalas con un abogado antes de publicar, y el IVA con tu asesor fiscal.
- **No es un pentest.** Encuentra los fallos habituales y los que más daño hacen, no todos.
- **No ataca a nadie.** Solo revisa código y URLs que son tuyos.
- **No toca nada sin permiso.** Rotar claves, borrar historial, cambiar DNS o tocar producción: te lo propone con el comando exacto y espera tu sí.
- **No sustituye a tus paneles.** Lo que vive fuera del código (2FA, permisos en Supabase o Stripe, backups) te lo lista para que lo compruebes tú.

## Qué hay dentro

```
SKILL.md                    instrucciones para el agente
references/                 se cargan solo cuando hacen falta
  frontend.md               XSS, secretos en el bundle, cabeceras, SRI, formularios, consentimiento
  backend.md                auth, IDOR, RLS, inyección, SSRF, subidas, CORS, logs, backups
  cursos-pagos-correo.md    vídeo firmado, paywall, cuentas compartidas, Stripe, SPF/DKIM/DMARC
  ia-y-agentes.md           inyección de prompt, claves, límites de gasto, agentes con herramientas
  despliegue.md             .env e historial, previews, DNS, 2FA, mínimos privilegios
  fallos-codigo-ia.md       28 fallos típicos del código generado con IA
  cabeceras.md              Vercel, Netlify, Cloudflare Pages, Nginx, Apache y Next.js
  informe.md                formato fijo del informe
  legal.md                  qué aplica y qué revisar (RGPD, LSSI, consumo, accesibilidad, IA)
  plantillas/               aviso legal, privacidad, cookies + banner, condiciones, /seguridad, security.txt
scripts/escaner.mjs         escáner local sin dependencias
```

Referencias usadas: OWASP Top 10 2025, OWASP ASVS 5.0, OWASP Top 10 para aplicaciones LLM 2025, RFC 9116, guía de cookies de la AEPD, RGPD, LOPDGDD, LSSI-CE, TRLGDCU y Ley 11/2023 de accesibilidad.

## Licencia

MIT. Úsala, cámbiala y compártela.

---

Hecho por Uriel Iglesias · NF6 · uriel@nf6.ai
