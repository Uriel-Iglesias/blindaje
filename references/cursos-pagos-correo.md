# Cursos, contenido de pago, pagos y correo

Lo que se vende es contenido. Si se puede ver sin pagar, se puede piratear con un clic.

## 1. Vídeo de pago

**Mal**
- `public/curso/modulo-1.mp4`, `static/videos/…`, o cualquier MP4 en la carpeta pública.
- Bucket público (`…/storage/v1/object/public/…mp4`, `s3.amazonaws.com/…mp4` sin firma).
- YouTube «oculto»: cualquiera con el enlace lo ve y lo reenvía.
- Vimeo sin restricción de dominio.

**Bien**
- Proveedor de vídeo con reproducción firmada: Mux (signed playback IDs), Cloudflare Stream (signed URLs), Bunny Stream (token authentication), Vimeo con privacidad por dominio y sin descarga, o S3/R2 privado con URL prefirmada.
- La URL firmada se genera **en el servidor**, tras comprobar sesión y compra, y caduca pronto (1 a 4 horas para vídeo; minutos para descargas).
- HLS en vez de MP4 completo: más difícil de bajar de una vez.
- Restricción de dominio (referer/embed) como capa extra, no como única.
- Marca de agua dinámica (correo del alumno) si el contenido es caro: disuade de compartir.

**Verificar**: copia la URL del vídeo desde DevTools, ábrela en una ventana privada sin sesión y otra vez pasado el plazo. Debe fallar.

## 2. Paywall en servidor

- El acceso a cada lección se decide en el servidor consultando la base de datos (`compras` o `matriculas` del usuario), no con un `if (user.pagado)` en el componente.
- Las lecciones de pago no viajan en el HTML ni en el JSON de la página para quien no ha pagado. Con Next.js: comprobar en el Server Component o la ruta antes de leer el contenido.
- Los PDFs, plantillas y recursos descargables, igual que el vídeo: bucket privado + URL firmada corta.
- La página de «gracias» no concede acceso. El acceso lo da el webhook de la pasarela o una consulta a la pasarela desde el servidor (`checkout.sessions.retrieve(id)` comprobando `payment_status === 'paid'` y que la sesión es de ese usuario).
- Cupones y precios: el precio sale del servidor (ID de precio de la pasarela), nunca del formulario.
- Reembolsos y contracargos (`charge.refunded`, `charge.dispute.created`): retiran el acceso.

**Verificar**: con una cuenta sin compra, pide directamente la URL de la lección 5, su API y su vídeo. Todo debe negar.

## 3. Compartir cuentas

- Límite de sesiones activas por cuenta (por ejemplo 2 o 3), cerrando la más antigua.
- Aviso si una cuenta abre sesión desde muchos países o IPs en poco tiempo.
- Marca de agua con el correo del alumno en vídeo y PDF.
- No bloquees a ciegas: un alumno legítimo usa móvil y portátil. Avisa antes de cortar.
- Si lo haces, dilo en las condiciones de venta (uso personal e intransferible).

## 4. Enlaces mágicos y accesos por correo

- Token aleatorio de ≥ 128 bits, guardado con hash, de un solo uso, caduca en ≤ 15 minutos.
- Ligado al correo que lo pidió. Al usarlo, crea sesión y lo invalida.
- Enlaces de acceso permanentes del tipo `/curso?token=…` en correos: prohibidos (se reenvían y quedan en el historial).

## 5. Pagos

- Datos de tarjeta solo en la pasarela: Stripe Checkout o Payment Element, Paddle, Lemon Squeezy, PayPal, Redsys con su TPV. Así tu alcance PCI DSS es el mínimo (SAQ A). Nunca un `<input>` propio para el número.
- Claves: `pk_` en el cliente; `sk_` solo en servidor; mejor una clave restringida `rk_` con los permisos justos.
- Modo prueba y modo real separados por entorno.
- 2FA en la cuenta de la pasarela. Alertas de pagos raros (Radar en Stripe).
- Suscripciones: portal de cliente para cancelar (cancelar tan fácil como contratar).

### Webhook de Stripe (Next.js App Router)
```ts
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const cuerpo = await req.text();               // crudo, antes de parsear
  const firma = req.headers.get('stripe-signature') ?? '';
  let evento: Stripe.Event;
  try {
    evento = stripe.webhooks.constructEvent(cuerpo, firma, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('Firma no válida', { status: 400 });
  }
  if (await yaProcesado(evento.id)) return new Response('ok');
  // conceder o retirar acceso según evento.type
  await marcarProcesado(evento.id);
  return new Response('ok');
}
```
Express: `express.raw({ type: 'application/json' })` en esa ruta, nunca `express.json()` antes.

### Otros proveedores
- Paddle, Lemon Squeezy, Resend, GitHub y la mayoría: HMAC SHA-256 del cuerpo crudo con su secreto; comparar con `crypto.timingSafeEqual`.
- Svix (lo usan Clerk, Resend y otros): `new Webhook(secret).verify(cuerpo, cabeceras)`.
- PayPal: verificar con su API de verificación de firma.

**Verificar**: `curl -X POST https://tudominio.com/api/webhook -d '{"type":"checkout.session.completed"}'` debe devolver 400. Con la CLI de Stripe (`stripe trigger checkout.session.completed`) debe funcionar.

## 6. Correo

### Dominio que envía
- **SPF**: un único registro TXT `v=spf1 include:<proveedor> -all` (o `~all` mientras pruebas). Máximo 10 consultas DNS.
- **DKIM**: activado en cada proveedor que envía por ti (correo del equipo, boletín, transaccional).
- **DMARC**: `_dmarc.tudominio.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@tudominio.com"` para empezar; tras 2-4 semanas de informes limpios, `p=quarantine` y luego `p=reject`.
- Gmail, Yahoo y Microsoft exigen SPF, DKIM y DMARC a quien envía en volumen, y baja en un clic (`List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058) en correos comerciales.
- Dominios que no envían correo: `v=spf1 -all` y DMARC `p=reject` para que nadie los suplante.

**Verificar**: `dig +short TXT tudominio.com`, `dig +short TXT _dmarc.tudominio.com`, y un correo de prueba a una bandeja de Gmail → «Mostrar original»: SPF, DKIM y DMARC en PASS.

### Formularios y relé de spam
- Destinatario fijo en el servidor. Nunca un campo `to` en el formulario.
- El texto del usuario no entra en cabeceras. Quitar saltos de línea de nombre y asunto.
- Honeypot + límite por IP. Sin esto, el formulario acaba mandando miles de correos y tu dominio en listas negras.
- Correo de «gracias» automático: texto fijo, sin repetir lo que escribió el usuario (si no, sirve para mandar spam a terceros desde tu dominio).

### Boletín y marketing
- Doble opt-in recomendado. Casilla sin marcar. Baja en cada correo.
- A clientes que ya compraron puedes escribir de productos similares si se les dio opción de negarse al comprar (LSSI art. 21.2). Al resto, solo con consentimiento.
