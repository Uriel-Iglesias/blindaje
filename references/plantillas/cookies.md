# Política de cookies y banner

> Dos piezas: la página `/cookies` y el banner. Sustituye cada [CORCHETE]. La tabla tiene que coincidir con lo que la web carga de verdad: compruébalo en una ventana privada (DevTools → Application → Cookies, y la pestaña Network). Revísalo con un abogado antes de publicar.

## Parte 1 · Página `/cookies`

### Qué son las cookies
Pequeños ficheros que una web guarda en tu navegador para recordar cosas: que has iniciado sesión, qué has elegido sobre las cookies o cómo usas la web.

### Qué cookies usamos

| Cookie | De quién | Para qué | Duración | Tipo |
|---|---|---|---|---|
| [sesion] | [DOMINIO] (propia) | Mantener tu sesión iniciada | [7 días] | Necesaria |
| [consentimiento-cookies] | [DOMINIO] (propia) | Recordar lo que has elegido aquí | 12 meses | Necesaria |
| [_ga, _ga_*] | Google (tercero) | Medir visitas de forma agregada | [2 años] | Analítica · solo si aceptas |
| [_fbp] | Meta (tercero) | Medir campañas de anuncios | [3 meses] | Publicidad · solo si aceptas |
| [ ] | [ ] | [ ] | [ ] | [ ] |

Las necesarias no requieren tu permiso porque sin ellas la web no funciona. El resto solo se activan si las aceptas.

### Terceros fuera de la UE
[Google] y [Meta] pueden tratar datos en EE. UU. con las garantías del marco de privacidad UE-EE. UU. Más información en sus políticas: [enlaces].

### Cómo cambiar tu elección
Cuando quieras, en **[Configurar cookies]** (enlace en el pie de todas las páginas). También puedes borrarlas desde tu navegador.

Última actualización: [FECHA]

---

## Parte 2 · El banner

### Requisitos (guía de cookies de la AEPD)
1. Primera capa con **Aceptar**, **Rechazar** y **Configurar**, los tres con el mismo tamaño, estilo y visibilidad.
2. Antes de elegir, solo funcionan las cookies necesarias. Ningún script de analítica, píxel ni vídeo de terceros.
3. Hacer scroll, seguir navegando o cerrar con la X no es aceptar.
4. Configuración por finalidad (analítica, publicidad…), con las casillas desmarcadas.
5. «Configurar cookies» siempre accesible en el pie para cambiar o retirar el consentimiento.
6. Recordar la elección y volver a preguntar como mucho a los 24 meses (aquí, 12) o si cambian las cookies (sube `VERSION`).
7. Usable con teclado y lector de pantalla; no tapa los enlaces legales.

### Cómo marcar los scripts no esenciales
Cambia cada script de terceros para que no se ejecute hasta que haya permiso:

```html
<!-- antes -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
<!-- después -->
<script type="text/plain" data-categoria="analitica" data-src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
<script type="text/plain" data-categoria="analitica">
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXX');
</script>
```
Si tu CSP no permite scripts en línea, deja solo los `data-src` y mueve la configuración (`gtag('config', …)`) a un fichero propio que también se active por `data-src`.

Vídeos de YouTube o Vimeo: muestra una imagen con botón «Ver vídeo (carga contenido de [YouTube])» y crea el iframe al pulsar, o cárgalo solo si se aceptó la categoría correspondiente.

### Banner mínimo sin dependencias

Pega el HTML al final del `<body>`, el CSS en tu hoja de estilos y el JS en un fichero propio (`/js/cookies.js`, cargado con `defer`). Ajusta textos y colores a la marca, manteniendo los tres botones iguales.

```html
<div id="ck" class="ck" role="dialog" aria-modal="false" aria-labelledby="ck-t" hidden>
  <p id="ck-t" class="ck-t">Cookies</p>
  <p>Usamos cookies necesarias para que la web funcione y, si aceptas, otras para medir visitas y campañas. <a href="/cookies">Más información</a>.</p>
  <div id="ck-cfg" hidden>
    <label><input type="checkbox" checked disabled> Necesarias (siempre activas)</label>
    <label><input type="checkbox" data-cat="analitica"> Analítica</label>
    <label><input type="checkbox" data-cat="publicidad"> Publicidad</label>
  </div>
  <div class="ck-b">
    <button type="button" data-ck="rechazar">Rechazar</button>
    <button type="button" data-ck="configurar">Configurar</button>
    <button type="button" data-ck="aceptar">Aceptar</button>
  </div>
</div>
<!-- en el pie de todas las páginas -->
<button type="button" data-ck="abrir">Configurar cookies</button>
```

```css
.ck{position:fixed;inset:auto 16px 16px 16px;max-width:560px;margin:0 auto;padding:20px;background:#fff;color:#111;border:1px solid #ddd;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.12);z-index:9999;font:15px/1.5 system-ui,sans-serif}
.ck-t{font-weight:600;margin:0 0 6px}
.ck label{display:block;margin:6px 0}
.ck-b{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ck-b button{flex:1 1 140px;min-height:44px;padding:10px 14px;border:1px solid #111;border-radius:8px;background:#111;color:#fff;font:inherit;cursor:pointer}
.ck-b button:focus-visible,[data-ck="abrir"]:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
```

```js
// /js/cookies.js — sin dependencias. Guarda la elección (cookie necesaria) y activa
// los <script type="text/plain" data-categoria="..."> solo si su categoría está aceptada.
(() => {
  const CLAVE = 'consentimiento-cookies';
  const VERSION = 1;                        // súbela si cambias las cookies: se vuelve a preguntar
  const DIAS = 365;
  const caja = document.getElementById('ck');
  const cfg = document.getElementById('ck-cfg');
  const casillas = [...document.querySelectorAll('#ck-cfg [data-cat]')];

  const leer = () => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + CLAVE + '=([^;]*)'));
    try { const v = m && JSON.parse(decodeURIComponent(m[1])); return v && v.v === VERSION ? v : null; }
    catch { return null; }
  };
  const guardar = (cats) => {
    const v = { v: VERSION, fecha: new Date().toISOString(), cats };
    document.cookie = `${CLAVE}=${encodeURIComponent(JSON.stringify(v))}; Max-Age=${DIAS * 86400}; Path=/; SameSite=Lax; Secure`;
    return v;
  };
  const activar = (cats) => {
    document.querySelectorAll('script[type="text/plain"][data-categoria]').forEach((viejo) => {
      if (!cats.includes(viejo.dataset.categoria) || viejo.dataset.activado) return;
      const nuevo = document.createElement('script');
      if (viejo.dataset.src) { nuevo.src = viejo.dataset.src; nuevo.async = true; }
      else nuevo.textContent = viejo.textContent;
      viejo.dataset.activado = '1';
      viejo.after(nuevo);
    });
  };
  const cerrar = (cats) => {
    const anterior = leer();
    guardar(cats);
    caja.hidden = true;
    // Retirar un permiso ya dado: los scripts cargados no se pueden «descargar»; recarga para que dejen de ejecutarse.
    if (anterior && anterior.cats.some((c) => !cats.includes(c))) location.reload();
    else activar(cats);
  };
  const abrir = () => {
    const actual = leer();
    casillas.forEach((c) => { c.checked = !!actual && actual.cats.includes(c.dataset.cat); });
    caja.hidden = false;
    caja.querySelector('button').focus();
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ck]');
    if (!b) return;
    const accion = b.dataset.ck;
    if (accion === 'aceptar') cerrar(casillas.map((c) => c.dataset.cat));
    if (accion === 'rechazar') cerrar([]);
    if (accion === 'abrir') abrir();
    if (accion === 'configurar') {
      if (cfg.hidden) { cfg.hidden = false; b.textContent = 'Guardar selección'; }
      else cerrar(casillas.filter((c) => c.checked).map((c) => c.dataset.cat));
    }
  });

  const actual = leer();
  if (actual) activar(actual.cats); else caja.hidden = false;
})();
```

### Con Google (Consent Mode v2)
Si usas etiquetas de Google, añade esto **antes** de cualquier script de Google, en el `<head>`, y llama a `gtag('consent','update', …)` cuando el usuario acepte:

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', wait_for_update: 500
  });
</script>
```
Consent Mode no sustituye al bloqueo: con el modo «avanzado» Google se carga igualmente y envía pings sin cookies. Si quieres el criterio más prudente, no cargues `gtag` hasta que acepten (lo que hace el banner de arriba).

### Prueba antes de publicar
1. Ventana privada → la web abre con el banner y **sin** cookies de terceros ni peticiones a dominios de analítica.
2. Rechazar → sigue sin cookies de terceros; recarga y el banner no vuelve a salir.
3. Configurar cookies (pie) → aceptar analítica → aparece `_ga` y peticiones a Google.
4. Volver a configurar y quitar analítica → recarga y deja de enviar.
5. Todo con teclado (Tab, Enter) y foco visible.
