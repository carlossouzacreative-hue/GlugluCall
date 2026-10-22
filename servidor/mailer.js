'use strict';
/**
 * Envio de e-mail (código de verificação).
 *
 * Configure SMTP_HOST (e usuário/senha) no .env para enviar de verdade.
 * Sem SMTP configurado o servidor entra em MODO TESTE: o código aparece só na
 * janela do servidor (terminal) e nada sai pela internet.
 */
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* instalado com npm install */ }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let transport = null;
let warned = false;

function config() {
  const host = (process.env.SMTP_HOST || '').trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';
  const secure = /^(1|true|yes|sim)$/i.test(process.env.SMTP_SECURE || '') || port === 465;
  const from = (process.env.MAIL_FROM || '').trim() || user;
  return { host, port, user, pass, secure, from };
}

/** true quando o e-mail realmente sai pela internet. */
function enabled() {
  return !!(config() && nodemailer);
}

function getTransport() {
  if (transport) return transport;
  const c = config();
  transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transport;
}

function codeEmail(username, code) {
  const text = [
    `Olá, ${username}!`,
    '',
    `Seu código de verificação do GlugluCall é: ${code}`,
    '',
    'Ele vale por 15 minutos. Se não foi você que criou a conta, ignore este e-mail.',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0f0c1b;font-family:Segoe UI,Arial,sans-serif;color:#ece6f7">
<div style="max-width:420px;margin:0 auto;background:#161228;border:1px solid #2c2347;border-radius:10px;padding:28px">
<h2 style="margin:0 0 8px;font-size:20px;color:#c77dff">GlugluCall</h2>
<p style="margin:0 0 18px;color:#cfc6e6">Olá, ${esc(username)}! Use o código abaixo para confirmar seu e-mail:</p>
<div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#0f0c1b;border-radius:8px;padding:16px 0;color:#fff">${esc(code)}</div>
<p style="margin:18px 0 0;color:#9a90b3;font-size:13px">O código vale por 15 minutos. Se não foi você que criou a conta, ignore este e-mail.</p>
</div></body></html>`;
  return { subject: `${code} é o seu código do GlugluCall`, text, html };
}

/**
 * Envia o código de verificação.
 * -> { dev: boolean }   (dev = true: só foi mostrado no terminal)
 * Lança erro se o SMTP estiver configurado e o envio falhar.
 */
async function sendVerification({ to, username, code, log = console.log }) {
  if (!enabled()) {
    if (config() && !nodemailer && !warned) {
      warned = true;
      log('AVISO: SMTP_HOST está no .env mas o pacote "nodemailer" não está instalado. Rode "npm install" na pasta do servidor.');
    }
    log(`✉  [MODO TESTE] Código de verificação de ${username} <${to}>: ${code}`);
    return { dev: true };
  }
  const c = config();
  const msg = codeEmail(username, code);
  await getTransport().sendMail({ from: c.from, to, ...msg });
  log(`✉  Código enviado para ${to}`);
  return { dev: false };
}

module.exports = { sendVerification, enabled };
