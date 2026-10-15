# Despliegue, cuentas y DNS

## 1. `.env` fuera de git y del historial

**Comprobar**
```bash
git ls-files | grep -E '(^|/)\.env'                       # ¿está en el repo ahora?
git log --all --oneline -- '.env' '.env.local' '.env.production'   # ¿estuvo alguna vez?
git log --all -p | grep -nE "sk_live_|sk-proj-|sk-ant-|service_role|BEGIN .*PRIVATE KEY" | head
```
Herramientas dedicadas (locales): `gitleaks detect`, `trufflehog git file://.`.

**Arreglar**
1. **Rotar** todas las claves que estuvieron en el repo. Esto es lo primero y lo único que de verdad cierra el problema: si el repo fue público aunque sea un minuto, asume que están copiadas.
2. Añadir `.env*` (y `!.env.example`) a `.gitignore`; `git rm --cached .env`.
3. Limpiar el historial solo si hace falta y con permiso (reescribe commits y obliga a todo el equipo a volver a clonar): `git filter-repo --path .env --invert-paths`, luego push forzado. Pídelo explícitamente al usuario.
4. Activar en GitHub: Secret scanning y Push protection (gratis en repos públicos).

## 2. Hosting

- **Previews protegidas**: Vercel (Deployment Protection), Netlify (protección por contraseña o login), Cloudflare Pages (Access). Las previews suelen usar datos reales y se indexan.
- Variables de entorno separadas por entorno; las de producción no se exponen a previews de ramas de terceros (pull requests desde forks).
- Dominios por defecto (`*.vercel.app`, `*.netlify.app`): redirigir al dominio propio o `noindex`.
- Directory listing apagado (Nginx `autoindex off`, Apache `Options -Indexes`).
- Que no se sirvan: `/.env`, `/.git/`, `/backup.zip`, `/*.sql`, `/node_modules/`. El escáner con `--url` prueba los dos primeros.
- HTTPS en todo, con redirección 301 de HTTP y HSTS.
- Firewall o WAF del proveedor activado con límites básicos; reglas de bots si hay formularios.

## 3. DNS y dominio

- 2FA y bloqueo de transferencia (registrar lock) en el registrador.
- Renovación automática y tarjeta válida: un dominio caducado lo compra otro y recibe tus correos.
- Registros que apuntan a servicios que ya no usas (CNAME a un Heroku, Netlify o bucket borrado): eliminarlos. Son la puerta para tomar un subdominio (subdomain takeover).
- CAA: `tudominio.com CAA 0 issue "letsencrypt.org"` (y la autoridad que use tu hosting) para limitar quién emite certificados.
- SPF, DKIM y DMARC: ver `cursos-pagos-correo.md`.
- DNSSEC si el registrador lo ofrece sin complicaciones.

## 4. Cuentas y accesos

- **2FA en todo**: GitHub, hosting, registrador, pasarela de pagos, base de datos, correo, proveedor de IA, gestor de contraseñas, redes sociales con las que se inicia sesión. Mejor llave física o app que SMS.
- Gestor de contraseñas para el equipo; nada de claves en notas, chats ni hojas de cálculo.
- **Mínimos privilegios**: cada persona y cada integración con el rol justo. Colaboradores puntuales, con fecha de fin.
- Revisión trimestral: quién tiene acceso a qué, tokens de acceso personal caducados, apps OAuth conectadas a GitHub y Google.
- Al salir alguien: quitar accesos el mismo día y rotar las claves que conocía.
- Correo de recuperación de las cuentas críticas: uno del dominio propio protegido con 2FA, no uno personal antiguo.

## 5. CI y cadena de suministro

- GitHub Actions: `permissions:` mínimos en cada workflow; acciones de terceros fijadas por SHA; nunca `pull_request_target` con checkout del código del PR.
- Secretos de CI solo en los workflows que los necesitan.
- Ramas protegidas en `main`: sin push directo, revisión obligatoria si hay equipo.
- `npm ci` en despliegue; `npm audit` o `osv-scanner` en CI.

## 6. Antes de pulsar «publicar»

- [ ] `npm run build` limpio, sin avisos de secretos.
- [ ] Escáner sin Críticos ni Altos.
- [ ] Cabeceras puestas y comprobadas con `curl -sI`.
- [ ] Banner de cookies probado en ventana privada.
- [ ] Páginas legales enlazadas en el pie y el checkout.
- [ ] `/.well-known/security.txt` publicado y con `Expires` futuro.
- [ ] Backups activados y una restauración probada.
- [ ] 2FA en todas las cuentas de la lista.
