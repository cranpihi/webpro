# Estado de WebPro CRM

Fecha de revisión: 2026-09-13

## Resumen

El proyecto tiene una landing PWA con formulario de cotización, un backend Express y un CRM administrativo privado. Las solicitudes se guardan actualmente en `data/leads.json` y pueden enviarse por correo y por un webhook de n8n cuando se configuren las credenciales externas.

Estado general: **base funcional lista; integraciones externas pendientes de credenciales y workflows**.

## Qué ya funciona

| Área | Estado | Detalle |
|---|---|---|
| Landing y formulario | Listo | Selección de plan, extras, checklist, ubicación y envío a `/api/leads`. |
| Datos estructurados | Listo | Se guardan extras, checklist, progreso, mensaje y ubicación. |
| Persistencia local | Listo para desarrollo | Usa `data/leads.json`. |
| CRM privado | Listo para desarrollo | Disponible en `/admin`, con login y cambio de estado. |
| Sesiones administrativas | Funcional localmente | Tokens en memoria; se pierden al reiniciar el servidor. |
| Correo | Preparado | Nodemailer envía al administrador y al cliente cuando SMTP está configurado. |
| Integración n8n | Preparada | Emite `lead.created` y `lead.status_updated`, con firma HMAC opcional. |
| IA Gemini | Preparada | Existe `/api/ai`; requiere `GEMINI_API_KEY`. |
| Google Maps | Parcial | El frontend contempla Places; requiere una clave válida y restricciones. |
| PWA | Funcional | Incluye manifest y service worker. |

## Qué falta para integrar todas las herramientas

### 1. Correo al cliente y al administrador

**Bloqueador actual:** falta `SMTP_PASSWORD` en `.env`.

La cuenta Gmail ya está preparada con `smtp.gmail.com`, puerto `587` y `cranpihi@gmail.com`. Falta crear una contraseña de aplicación de Gmail y colocarla en:

```env
SMTP_PASSWORD="xxxx xxxx xxxx xxxx"
```

Después hay que reiniciar el servidor y probar una solicitud real. No se debe usar la contraseña normal de Gmail.

### 2. n8n como orquestador

**Workflow base creado:** [n8n/webpro-ecosystem.json](n8n/webpro-ecosystem.json).

Importa ese JSON en n8n desde **Workflows > Import from File**. Incluye entrada webhook, validación HMAC, normalización y separación de eventos. Después de importarlo, activa el workflow y copia la URL de producción del nodo `Entrada WebPro`.

**Bloqueador actual:** falta `N8N_WEBHOOK_URL` y conectar las credenciales de los servicios finales.

Crear en n8n un workflow con un nodo **Webhook** que reciba `POST` y copiar su URL a:

```env
N8N_WEBHOOK_URL=https://dominio-n8n/webhook/webpro-leads
N8N_WEBHOOK_SECRET=una-clave-compartida
```

El workflow debe validar `x-webpro-signature` y enrutar según `event`:

- `lead.created`: alta del contacto, alertas y seguimiento inicial.
- `lead.status_updated`: sincronización del estado del lead.

### 3. CRM externo

**Pendiente:** elegir el CRM destino y crear el workflow n8n.

Opciones posibles: HubSpot, Pipedrive, Zoho o Airtable como etapa inicial. Se necesita:

- Cuenta y token/API key.
- Mapeo de nombre, correo, teléfono, plan, total, ubicación y estado.
- Regla para evitar duplicados por correo.
- ID del contacto/oportunidad guardado en el lead local.

### 4. WhatsApp

**Pendiente:** proveedor y plantilla de mensajes.

Para automatización real se necesita WhatsApp Business Platform/Meta, Twilio o un proveedor equivalente. Se deben definir:

- Número remitente.
- Token y URL en n8n.
- Plantillas aprobadas por Meta si se inicia una conversación.
- Mensaje de confirmación y mensajes por cambio de estado.

### 5. Google Calendar

**Pendiente:** calendario y flujo de reserva.

Se necesita decidir si el cliente agenda mediante Calendly/Cal.com o directamente con Google Calendar. Luego configurar en n8n:

- OAuth de Google Calendar.
- Calendario destino.
- Duración y horarios disponibles.
- URL de agenda enviada al cliente.
- Evento asociado al lead.

### 6. Pagos

**Pendiente:** proveedor y flujo de checkout.

El formulario recoge Flow, Mercado Pago o Stripe, pero todavía no crea pagos. Para cada proveedor se necesita:

- Cuenta comercial y credenciales.
- Producto/precio o monto dinámico.
- URL de retorno y webhook de confirmación.
- Estados de pago: pendiente, pagado, rechazado y reembolsado.
- Actualización del estado del lead tras confirmación segura del proveedor.

No se debe marcar un lead como pagado solo por volver desde la pantalla de checkout; debe validarse el webhook del proveedor.

### 7. Google Maps

**Pendiente:** clave real de Google Maps.

Configurar `GOOGLE_MAPS_API_KEY`, habilitar Places API y restringir la clave por dominio. En producción no se debe dejar `TU_API_KEY_MAPS` en el HTML.

### 8. Gemini

**Pendiente:** clave de producción.

Configurar `GEMINI_API_KEY` y definir límites de uso. El endpoint actual expone la IA a través del backend, pero conviene añadir control de tamaño, rate limit y monitoreo antes de producción.

### 9. Base de datos de producción

**Pendiente antes de publicar.**

`data/leads.json` sirve para desarrollo, pero no es adecuado para varios procesos o despliegues. Migrar a PostgreSQL, SQLite administrado o un servicio equivalente. También hace falta:

- Copias de seguridad.
- Índice único por lead/contacto cuando corresponda.
- Historial de eventos e intentos de integración.
- Variables secretas en un gestor seguro.

### 10. Seguridad y operación

**Pendiente antes de producción.**

- Cambiar `SESSION_SECRET` por un secreto aleatorio fuerte.
- Persistir sesiones o usar una solución de sesión adecuada.
- Añadir rate limiting para login, leads e IA.
- Validar estados contra una lista permitida.
- Usar HTTPS y configurar CORS solo si se separa el frontend.
- Añadir logs estructurados y alertas para fallos de correo/n8n.
- No versionar `.env` ni exponer contraseñas en el repositorio.

## Variables de entorno necesarias

```env
# Correo
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-correo@gmail.com
SMTP_PASSWORD=contraseña-de-aplicación
SMTP_FROM=WebPro <tu-correo@gmail.com>
ADMIN_EMAIL=destino-de-alertas@example.com

# Automatización
N8N_WEBHOOK_URL=https://tu-n8n/webhook/webpro-leads
N8N_WEBHOOK_SECRET=secreto-compartido

# IA y ubicación
GEMINI_API_KEY=...
GOOGLE_MAPS_API_KEY=...

# Administración
ADMIN_PASSWORD=...
SESSION_SECRET=...
```

## Orden recomendado de implementación

1. Configurar y probar SMTP con un correo real.
2. Crear el webhook n8n y verificar la firma HMAC.
3. Conectar el CRM externo y evitar duplicados.
4. Añadir alertas por correo/Slack y WhatsApp.
5. Integrar Calendar o una herramienta de agenda.
6. Integrar el proveedor de pagos y sus webhooks.
7. Sustituir `leads.json` por una base de datos.
8. Aplicar seguridad, monitoreo y pruebas de producción.

## Contratos actuales del backend

- `POST /api/leads`: guarda un lead, intenta enviar correos y emite `lead.created`.
- `POST /api/ai`: proxy controlado hacia Gemini.
- `POST /api/admin/login`: inicia sesión administrativa.
- `GET /api/admin/leads`: lista leads autenticados.
- `PATCH /api/admin/leads/:id`: cambia el estado y emite `lead.status_updated`.
- `GET /api/config`: expone configuración pública no sensible de Maps.
- `GET /admin`: abre el CRM privado.
