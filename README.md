# WebPro CRM PWA

Aplicación web para recibir y administrar solicitudes de la landing de WebPro.

## Puesta en marcha

1. Instala Node.js 20 o superior.
2. Copia `.env.example` como `.env`.
3. Define `ADMIN_PASSWORD` y `SESSION_SECRET`.
4. Configura SMTP para enviar correos al administrador y al cliente.
5. Ejecuta:

```powershell
npm install
npm start
```

Abre `http://localhost:3000/` para la landing y `http://localhost:3000/admin` para el CRM.

Para Gmail, usa una contraseña de aplicación de 16 caracteres en `SMTP_PASSWORD`; la contraseña normal de Gmail no funciona con SMTP.

Las solicitudes se guardan inicialmente en `data/leads.json`. Para producción conviene reemplazarlo por PostgreSQL, SQLite o un servicio administrado y usar HTTPS.

## Integración con el ecosistema

Configura `N8N_WEBHOOK_URL` con la URL del webhook de n8n. Cada solicitud enviada emite un evento `lead.created` y cada cambio de estado desde el CRM emite `lead.status_updated`.

Si defines `N8N_WEBHOOK_SECRET`, el backend incluye la firma HMAC SHA-256 en el encabezado `x-webpro-signature`. En n8n puedes usar el evento para crear el contacto en el CRM, enviar alertas por correo o Slack, iniciar WhatsApp, generar una reserva en Calendar y crear el checkout de Flow, Stripe o Mercado Pago.

El workflow base para importar en n8n está en `n8n/webpro-ecosystem.json`. Configura `WEBPRO_WEBHOOK_SECRET` en n8n con el mismo valor de `N8N_WEBHOOK_SECRET`. Si tu instancia restringe módulos en nodos Code, permite el módulo integrado `crypto` con `NODE_FUNCTION_ALLOW_BUILTIN=crypto` y reinicia n8n.
