# Formato del informe `AUDITORIA-SEGURIDAD.md`

Formato fijo. Así se puede comparar una auditoría con la siguiente y el usuario sabe dónde mirar.

## Reglas

- Español claro. Cada hallazgo se entiende sin saber de seguridad.
- IDs estables por nivel: `C-01`, `A-01`, `M-01`, `B-01`. Si reauditas, conserva los IDs de los hallazgos que siguen abiertos.
- Secretos siempre enmascarados (`sk_live_51Ab…9xQ`).
- «Dónde» con ruta relativa y línea (`app/api/alumnos/route.ts:12`) o URL completa.
- «Cómo arreglarlo» con diff, comando o configuración que se pueda pegar. Si hay que hacer algo en un panel (rotar una clave, activar 2FA), los pasos exactos.
- «Cómo verificarlo» con una prueba que cualquiera pueda repetir (`curl`, consulta SQL, ventana privada).
- Lo que no has podido revisar va en «Fuera de alcance». No supongas que está bien.
- Si el repo es público, recomienda no subir el informe hasta cerrar Críticos y Altos.

## Plantilla

````markdown
# Auditoría de seguridad · [nombre del proyecto]

- Fecha: [AAAA-MM-DD]
- Alcance: [carpetas, URL, entornos revisados]
- Versión revisada: [commit o fecha del despliegue]
- Stack: [framework · hosting · base de datos · pagos · correo · vídeo · IA]
- Método: revisión de código + escáner local de la skill blindaje [+ revisión de la URL publicada]

## Resumen

| Crítico | Alto | Medio | Bajo |
|---|---|---|---|
| [n] | [n] | [n] | [n] |

Lo más urgente:
1. [C-01 en una línea]
2. [C-02 o A-01 en una línea]
3. [siguiente en una línea]

## Hallazgos

| ID | Nivel | Título | Dónde | Estado |
|---|---|---|---|---|
| C-01 | Crítico | [título corto] | [fichero:línea] | Abierto |

### C-01 · [Título corto en llano]

- **Qué pasa:** [una o dos frases]
- **Dónde:** `[ruta:línea]` · [URL si aplica]
- **Por qué importa:** [una frase: qué podría hacer alguien y qué pierdes]
- **Cómo arreglarlo:**
  ```diff
  - [línea mala]
  + [línea buena]
  ```
  [pasos en paneles externos si los hay, numerados]
- **Cómo verificarlo:** [prueba repetible y resultado esperado]
- **Estado:** Abierto | Arreglado ([fecha]) | Aceptado ([motivo y quién lo decide])

[repetir por cada hallazgo, de Crítico a Bajo]

## Legal (revísalo con un abogado)

| Página | Estado | Qué falta |
|---|---|---|
| Aviso legal | Falta / Incompleta / Bien | [datos] |
| Privacidad | | |
| Cookies y banner | | |
| Condiciones de venta | | |
| /seguridad y security.txt | | |
| Accesibilidad | | |

## Fuera de alcance

- [lo que no se ha podido revisar y por qué: sin acceso al panel de Supabase, sin URL publicada, etc.]

## Siguientes pasos

1. [acción del usuario que no puede hacer el agente: rotar claves, activar 2FA, revisar con abogado]
2. [...]
3. Repetir la auditoría tras los arreglos y antes de cada lanzamiento.
````

## Ejemplo de un hallazgo bien escrito

### C-01 · La clave secreta de Stripe está en el código del navegador

- **Qué pasa:** `NEXT_PUBLIC_STRIPE_SECRET_KEY` se usa en un componente de cliente. Cualquiera que abra la web puede leerla.
- **Dónde:** `components/Checkout.tsx:8` · `.env.local:3`
- **Por qué importa:** con esa clave se pueden hacer reembolsos, ver clientes y crear cobros desde tu cuenta.
- **Cómo arreglarlo:**
  1. Stripe → Desarrolladores → Claves de API → «Rotar clave» de la clave secreta.
  2. Renombrar la variable a `STRIPE_SECRET_KEY` (sin prefijo público) en `.env.local` y en el hosting.
  3. Mover la creación de la sesión de pago a una ruta de servidor:
  ```diff
  - const stripe = new Stripe(process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY)
  + // app/api/checkout/route.ts
  + const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  ```
- **Cómo verificarlo:** `npm run build && grep -rn "sk_live_" .next/static` no devuelve nada; la clave vieja da error en Stripe.
- **Estado:** Abierto
