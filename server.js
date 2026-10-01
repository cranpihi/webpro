import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const dataFile = path.join(__dirname, 'data', 'leads.json');
const sessions = new Set();
const automationWebhookUrl = process.env.N8N_WEBHOOK_URL;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function readLeads() {
  try {
    return JSON.parse(await fs.readFile(dataFile, 'utf8'));
  } catch {
    return [];
  }
}

async function writeLeads(leads) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(leads, null, 2));
}

function normalizeChecklist(checklist) {
  if (!Array.isArray(checklist)) return [];

  return checklist.slice(0, 50).map(item => ({
    question: String(item?.question || '').slice(0, 200),
    answer: String(item?.answer || '').slice(0, 5000),
    completed: Boolean(item?.completed)
  })).filter(item => item.question);
}

function normalizeExtras(extras) {
  if (!Array.isArray(extras)) return [];

  return extras.slice(0, 20).map(item => ({
    name: String(item?.name || '').slice(0, 120),
    price: Number(item?.price || 0)
  })).filter(item => item.name && Number.isFinite(item.price) && item.price >= 0);
}

async function sendAutomationEvent(event, lead) {
  if (!automationWebhookUrl) {
    return { sent: false, reason: 'N8N_WEBHOOK_URL no configurada' };
  }

  const payload = JSON.stringify({
    event,
    occurredAt: new Date().toISOString(),
    source: 'webpro-crm',
    lead
  });
  const headers = { 'Content-Type': 'application/json' };

  if (process.env.N8N_WEBHOOK_SECRET) {
    headers['x-webpro-signature'] = crypto
      .createHmac('sha256', process.env.N8N_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
  }

  try {
    const response = await fetch(automationWebhookUrl, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return { sent: false, reason: `n8n respondió HTTP ${response.status}` };
    }
    return { sent: true, event };
  } catch (error) {
    console.error('Error enviando evento a n8n:', error.message);
    return { sent: false, reason: 'No se pudo conectar con n8n' };
  }
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

function createMailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
}

async function sendLeadEmails(lead) {
  const mailer = createMailer();
  if (!process.env.SMTP_PASSWORD) {
    return { sent: false, reason: 'Falta SMTP_PASSWORD: usa una contraseña de aplicación de Gmail' };
  }
  if (!mailer || !process.env.ADMIN_EMAIL) return { sent: false, reason: 'SMTP no configurado' };

  const summary = [
    `Cliente: ${lead.email}`,
    `Plan: ${lead.plan}`,
    `Total: $${lead.total} USD`,
    '',
    lead.message
  ].join('\n');

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL,
    replyTo: lead.email,
    subject: `Nueva solicitud WebPro - ${lead.plan}`,
    text: summary
  });

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: lead.email,
    subject: 'Hemos recibido tu solicitud de WebPro',
    text: `Hola, hemos recibido tu solicitud.\n\n${summary}\n\nTe contactaremos pronto.`
  });

  return { sent: true };
}

app.post('/api/leads', async (req, res) => {
  const { email, plan, total, message, location, extras, checklist } = req.body;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo válido' });
  }

  const normalizedChecklist = normalizeChecklist(checklist);
  const completedItems = normalizedChecklist.filter(item => item.completed).length;

  const lead = {
    id: crypto.randomUUID(),
    email,
    plan: plan || 'No seleccionado',
    total: Number(total || 0),
    extras: normalizeExtras(extras),
    checklist: normalizedChecklist,
    progress: {
      completed: completedItems,
      total: normalizedChecklist.length
    },
    message: String(message || '').slice(0, 20000),
    location: location && typeof location === 'object' ? {
      address: String(location.address || '').slice(0, 500),
      latitude: String(location.latitude || '').slice(0, 50),
      longitude: String(location.longitude || '').slice(0, 50)
    } : null,
    status: 'nuevo',
    createdAt: new Date().toISOString()
  };

  const leads = await readLeads();
  leads.unshift(lead);
  await writeLeads(leads);

  try {
    lead.emailResult = await sendLeadEmails(lead);
    await writeLeads(leads);
  } catch (error) {
    console.error('Error enviando correo:', error.message);
    lead.emailResult = { sent: false, reason: 'Error SMTP' };
    await writeLeads(leads);
  }

  lead.automationResult = await sendAutomationEvent('lead.created', lead);
  await writeLeads(leads);

  res.status(201).json({
    ok: true,
    id: lead.id,
    emailResult: lead.emailResult,
    automationResult: lead.automationResult
  });
});

app.post('/api/ai', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY no configurada' });
  }

  const { contents, systemInstruction } = req.body;
  if (!Array.isArray(contents) || !contents.length) {
    return res.status(400).json({ error: 'Solicitud de IA inválida' });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, systemInstruction })
    });
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    res.status(502).json({ error: 'No se pudo conectar con Gemini' });
  }
});

app.post('/api/admin/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD || req.body.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.add(token);
  res.json({ token });
});

app.get('/api/admin/leads', requireAdmin, async (req, res) => {
  res.json(await readLeads());
});

app.patch('/api/admin/leads/:id', requireAdmin, async (req, res) => {
  const leads = await readLeads();
  const lead = leads.find(item => item.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const previousStatus = lead.status;
  if (req.body.status) lead.status = req.body.status;
  await writeLeads(leads);

  if (lead.status !== previousStatus) {
    lead.automationResult = await sendAutomationEvent('lead.status_updated', lead);
    await writeLeads(leads);
  }
  res.json(lead);
});

app.get('/api/config', (req, res) => {
  res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(port, () => {
  console.log(`WebPro CRM disponible en http://localhost:${port}`);
});
