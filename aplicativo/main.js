'use strict';
/**
 * GlugluCall (convidado) – processo principal do Electron.
 *
 * - Abre DOMAIN (do .env). Antes de carregar, confere /health: se o servidor
 *   estiver desligado mostra offline.html (erro + nova tentativa automática).
 * - Fornece o seletor de tela/janela NATIVO do app (sem o pop-up do navegador):
 *   a interface lista as fontes via IPC e o setDisplayMediaRequestHandler entrega
 *   a escolhida ao getDisplayMedia(), inclusive com áudio do sistema no Windows.
 */
const { app, BrowserWindow, ipcMain, session, desktopCapturer, shell, Menu, net, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const DEFAULT_DOMAIN = 'https://gluglutelas.website';
const DOMAIN = (process.env.DOMAIN || DEFAULT_DOMAIN).trim().replace(/\/+$/, '');
const ORIGIN = new URL(DOMAIN).origin;
const PROBE_TIMEOUT_MS = 7000;
const OFFLINE_FILE = path.join(__dirname, 'offline.html');

let win = null;
let pendingSource = null; // { id, audio, at } escolhido no seletor da interface
let retrying = false;

/* ------------------------------------------------------------------ */
/* Confiança                                                           */
/* ------------------------------------------------------------------ */

const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };
const originTrusted = (u) => originOf(u) === ORIGIN;
const isYouTube = (u) => {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h === 'youtu.be' || h.endsWith('.youtu.be') || h === 'youtube.com' || h.endsWith('.youtube.com')
      || h === 'youtube-nocookie.com' || h.endsWith('.youtube-nocookie.com');
  } catch { return false; }
};

function senderTrusted(event) {
  const u = event.senderFrame?.url || '';
  try {
    const x = new URL(u);
    if (x.protocol === 'file:') return path.resolve(fileURLToPath(x)) === path.resolve(OFFLINE_FILE);
    return originTrusted(u);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Servidor no ar?                                                     */
/* ------------------------------------------------------------------ */

/** Confere se o endereço responde como servidor GlugluCall. -> { ok } | { ok:false, error } */
async function probe() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await net.fetch(DOMAIN + '/health', { signal: ctrl.signal });
    const text = (await res.text()).trim();
    if (res.ok && text === 'ok') return { ok: true };
    const detail = text && text !== 'ok' ? ` (${text.slice(0, 80)})` : '';
    return {
      ok: false,
      error: `O site não abriu: erro ${res.status}${detail}. O servidor no PC está desligado ou caiu. Deixa a janela do iniciar-servidor.bat aberta.`,
    };
  } catch {
    return { ok: false, error: 'Sem resposta do servidor. Ele está desligado ou você está sem internet. Abre o iniciar-servidor.bat e deixa essa janela aberta.' };
  } finally {
    clearTimeout(timer);
  }
}

function showOffline(reason) {
  return win.loadFile(OFFLINE_FILE, { query: { domain: DOMAIN, reason: reason || '' } });
}

async function boot() {
  try { await session.defaultSession.clearCache(); } catch { /* segue com o que tiver */ }
  const p = await probe();
  if (!p.ok) return showOffline(p.error);
  await win.loadURL(DOMAIN + '/?v=' + Date.now()).catch((e) => showOffline(e.message));
}

/* ------------------------------------------------------------------ */
/* Janela                                                              */
/* ------------------------------------------------------------------ */

function windowIcon() {
  // No app instalado o ícone vem do .exe. Passar o PNG de 512 aqui faz o Windows
  // desenhar ele gigante por cima da janela e a tela não abre.
  if (app.isPackaged) return undefined;
  try {
    const file = path.join(__dirname, 'build', 'icon.ico');
    const img = nativeImage.createFromPath(fs.existsSync(file) ? file : path.join(__dirname, 'build', 'icon.png'));
    if (img.isEmpty()) return undefined;
    return img.resize({ width: 64, height: 64, quality: 'best' });
  } catch {
    return undefined;
  }
}

function createWindow() {
  const icon = windowIcon();
  win = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: true,
    title: 'GlugluCall',
    backgroundColor: '#0f0c1b',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f0c1b', symbolColor: '#c77dff', height: 32 },
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', // áudio da live toca sem clique extra
      backgroundThrottling: false, // a chamada continua fluida com a janela minimizada
    },
  });

  const reveal = () => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); };
  win.once('ready-to-show', reveal);
  setTimeout(reveal, 2500);

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  let opening = true;
  win.webContents.on('will-navigate', (e, url) => {
    const target = typeof url === 'string' ? url : (url && typeof url.url === 'string' ? url.url : '');
    if (!target || target.startsWith('file:')) return;
    if (opening && originTrusted(target)) return;
    const current = win.webContents.getURL() || '';
    // App já aberto: Enter num formulário (música/chat) ou o player do YouTube
    // tentando assumir a janela recarregava tudo e voltava para a tela de nome.
    if (current.startsWith('http')) {
      e.preventDefault();
      if (!originTrusted(target) && !isYouTube(target) && /^https?:\/\//i.test(target)) shell.openExternal(target);
      return;
    }
    if (originTrusted(target)) return;
    e.preventDefault();
    if (!isYouTube(target) && /^https?:\/\//i.test(target)) shell.openExternal(target);
  });

  win.webContents.on('did-finish-load', () => {
    const url = win.webContents.getURL() || '';
    if (url.startsWith('http')) opening = false;
  });

  // Falhas de rede depois da primeira ligação (queda de DNS, TLS, etc.)
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || typeof url !== 'string' || url.startsWith('file:')) return;
    if (!originTrusted(url)) return; // iframe do YouTube não pode derrubar o app
    showOffline(`Falha ao carregar (${desc}).`);
  });
  // 4xx/5xx do domínio (ex.: túnel sem servidor por trás) também caem na tela offline.
  win.webContents.on('did-navigate', (_e, url, httpCode) => {
    if (typeof url !== 'string' || !originTrusted(url)) return;
    if (httpCode >= 400) showOffline(`O servidor respondeu ${httpCode}.`);
  });

  boot();
}

/* ------------------------------------------------------------------ */
/* Seletor de tela nativo (substitui o pop-up do navegador)             */
/* ------------------------------------------------------------------ */

function setupDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler(
    // ⚠ ATENÇÃO (IA/futuras edições): o 1º parâmetro se chama `request` e é lido mais abaixo
    // (request.audioRequested). NÃO renomeie para `_request`: isso gerava ReferenceError, caía no
    // catch, devolvia callback({}) e a live nunca abria. Se mudar o nome aqui, mude lá também.
    async (request, callback) => {
      const pick = pendingSource;
      if (!pick || Date.now() - pick.at > 20000) return callback({});
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const video = sources.find((s) => s.id === pick.id);
        if (!video) return callback({});
        const streams = { video };
        const wantsAudio = pick.audio && request.audioRequested !== false;
        if (wantsAudio && process.platform === 'win32') {
          streams.audio = pick.mode === 'loopbackWithMute' ? 'loopbackWithMute' : 'loopback';
        }
        return callback(streams);
      } catch {
        return callback({});
      }
    },
    { useSystemPicker: false }
  );
}

function setupPermissions() {
  const ok = new Set(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) =>
    cb(ok.has(permission) && originTrusted(details.requestingUrl))
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => ok.has(permission) && originTrusted(origin));
}

function setupIpc() {
  ipcMain.handle('screen:sources', async (e) => {
    if (!senderTrusted(e)) return [];
    const list = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: true,
    });
    return list.map((s) => ({
      id: s.id,
      name: s.name,
      isScreen: s.id.startsWith('screen:'),
      thumbnail: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '',
    }));
  });

  ipcMain.handle('screen:select', (e, { id, audio, mode } = {}) => {
    if (!senderTrusted(e) || typeof id !== 'string') return false;
    pendingSource = {
      id,
      audio: !!audio,
      mode: mode === 'loopbackWithMute' ? 'loopbackWithMute' : 'loopback',
      at: Date.now(),
    };
    return true;
  });

  ipcMain.handle('screen:clear', (e) => {
    if (!senderTrusted(e)) return false;
    pendingSource = null;
    return true;
  });

  ipcMain.handle('app:info', (e) => {
    if (!senderTrusted(e)) return {};
    return { domain: DOMAIN, version: app.getVersion() };
  });

  // usado pela tela "servidor offline": se o servidor voltou, entra direto
  ipcMain.handle('app:retry', async (e) => {
    if (!senderTrusted(e)) return { ok: false };
    if (retrying) return { ok: false };
    retrying = true;
    try {
      const p = await probe();
      if (!p.ok) return p;
      try { await session.defaultSession.clearCache(); } catch { /* ignora */ }
      await win.loadURL(DOMAIN + '/?v=' + Date.now());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      retrying = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    // O player do YouTube recusa o embed (erro 153) e às vezes navega a janela
    // inteira se o Referer não for enviado. Garante o cabeçalho só nesses pedidos.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://youtu.be/*'] },
      (details, callback) => {
        const headers = details.requestHeaders;
        if (!headers.Referer && !headers.referer) headers.Referer = `${ORIGIN}/`;
        callback({ requestHeaders: headers });
      }
    );
    setupPermissions();
    setupDisplayMedia();
    setupIpc();
    createWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
