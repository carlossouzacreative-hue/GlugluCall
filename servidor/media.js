'use strict';
/**
 * Perfis (foto, banner, bio) e anexos do chat.
 * Arquivos ficam em ./data — a pasta já está no .gitignore.
 * Limite: 50 MB por arquivo. GIF entra como imagem e anima no navegador.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');

const MAX_BYTES = 50 * 1024 * 1024;
const { DATA } = require('./paths'); // pasta de dados fora do código (sobrevive a atualizações)
const UPLOADS = path.join(DATA, 'uploads');
const PROFILE_FILE = path.join(DATA, 'profiles.json');
const INDEX_FILE = path.join(DATA, 'files.json');

const BLOCKED = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll', 'js', 'mjs', 'cjs', 'html', 'htm',
  'svg', 'php', 'sh', 'ps1', 'jar', 'vbs', 'apk', 'dmg', 'app',
]);
const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/zip': 'zip',
};

const tokens = new Map(); // token -> socket

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function sniff(buf, origExt) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  const h6 = buf.subarray(0, Math.min(6, buf.length)).toString('ascii');
  if (h6 === 'GIF87a' || h6 === 'GIF89a') return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return origExt === 'm4a' ? 'audio/mp4' : 'video/mp4';
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'audio/mpeg';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) return 'application/zip';
  return null;
}
function looksLikeText(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
    return n > 0;
  } finally { fs.closeSync(fd); }
}
const safeName = (n) => String(n || 'arquivo').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '').trim().slice(0, 120) || 'arquivo';
const extOf = (name) => (path.extname(name).slice(1).toLowerCase().replace(/[^a-z0-9]/g, '') || '').slice(0, 8);

function createMedia(app) {
  fs.mkdirSync(UPLOADS, { recursive: true });
  const profiles = readJson(PROFILE_FILE);
  const files = readJson(INDEX_FILE);
  const saveProfiles = () => fs.writeFileSync(PROFILE_FILE, JSON.stringify(profiles));
  const saveFiles = () => fs.writeFileSync(INDEX_FILE, JSON.stringify(files));

  function getProfile(pid) {
    const p = profiles[pid] || {};
    return {
      bio: typeof p.bio === 'string' ? p.bio : '',
      avatar: typeof p.avatar === 'string' ? p.avatar : '',
      banner: typeof p.banner === 'string' ? p.banner : '',
      c1: /^#[0-9a-f]{6}$/i.test(p.c1) ? p.c1 : '',
      c2: /^#[0-9a-f]{6}$/i.test(p.c2) ? p.c2 : '',
    };
  }
  function owned(pid, url) {
    const m = String(url || '').match(/^\/media\/([a-f0-9]{32})$/);
    if (!m) return null;
    const f = files[m[1]];
    if (!f || f.pid !== pid) return null;
    return { url: `/media/${m[1]}`, name: f.name, mime: f.mime, size: f.size };
  }
  function setProfile(pid, patch) {
    const cur = getProfile(pid);
    const next = { ...cur };
    if (typeof patch.bio === 'string') {
      next.bio = patch.bio.replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, '').trim().slice(0, 190);
    }
    if (patch.avatar === '') next.avatar = '';
    else if (typeof patch.avatar === 'string' && patch.avatar) {
      const f = owned(pid, patch.avatar);
      if (f?.mime.startsWith('image/')) next.avatar = f.url;
    }
    if (patch.banner === '') next.banner = '';
    else if (typeof patch.banner === 'string' && patch.banner) {
      const f = owned(pid, patch.banner);
      if (f?.mime.startsWith('image/')) next.banner = f.url;
    }
    for (const k of ['c1', 'c2']) {
      if (patch[k] === '') next[k] = '';
      else if (/^#[0-9a-f]{6}$/i.test(patch[k])) next[k] = patch[k].toLowerCase();
    }
    profiles[pid] = next;
    saveProfiles();
    return next;
  }

  function issue(socket) {
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, socket);
    socket.on('disconnect', () => { if (tokens.get(token) === socket) tokens.delete(token); });
    return token;
  }

  app.get('/media/:id', (req, res) => {
    const id = String(req.params.id || '').replace(/\..*$/, '');
    const f = /^[a-f0-9]{32}$/.test(id) ? files[id] : null;
    const filePath = f && path.join(UPLOADS, `${id}.${f.ext}`);
    if (!f || !filePath || !fs.existsSync(filePath)) return res.status(404).end();
    const inline = /^(image|video|audio)\//.test(f.mime) || f.mime === 'application/pdf';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(filePath);
  });

  app.post('/api/upload', (req, res) => {
    const socket = tokens.get(req.get('x-upload-token') || '');
    if (!socket?.connected) return res.status(401).json({ error: 'Sessão expirada. Entre na sala de novo.' });
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_BYTES + 256 * 1024) return res.status(413).json({ error: 'O arquivo passa de 50 MB.' });
    const kind = req.query.kind === 'avatar' || req.query.kind === 'banner' ? req.query.kind : 'chat';
    let finished = false;
    let got = false;
    const fail = (code, error) => {
      if (finished) return;
      finished = true;
      res.status(code).json({ error });
    };
    let bb;
    try { bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES, fields: 0 } }); }
    catch { return fail(400, 'Não consegui ler o arquivo.'); }

    bb.on('file', (_field, stream, info) => {
      if (got) { stream.resume(); return; }
      got = true;
      const name = safeName(info.filename);
      const origExt = extOf(name);
      if (BLOCKED.has(origExt)) { stream.resume(); return fail(415, 'Esse tipo de arquivo não é permitido.'); }
      const tmp = path.join(UPLOADS, `.tmp-${crypto.randomBytes(8).toString('hex')}`);
      const out = fs.createWriteStream(tmp);
      let limited = false;
      stream.on('limit', () => { limited = true; });
      stream.pipe(out);
      out.on('error', () => { fs.unlink(tmp, () => {}); fail(500, 'Não consegui guardar o arquivo.'); });
      out.on('finish', () => {
        const drop = () => fs.unlink(tmp, () => {});
        if (limited) { drop(); return fail(413, 'O arquivo passa de 50 MB.'); }
        let head;
        try {
          const fd = fs.openSync(tmp, 'r');
          head = Buffer.alloc(64);
          const n = fs.readSync(fd, head, 0, 64, 0);
          fs.closeSync(fd);
          head = head.subarray(0, n);
        } catch { drop(); return fail(500, 'Não consegui guardar o arquivo.'); }
        if (!head.length) { drop(); return fail(400, 'O arquivo está vazio.'); }
        let mime = sniff(head, origExt);
        let ext = mime ? EXT[mime] : '';
        if (!mime && origExt === 'txt' && looksLikeText(tmp)) { mime = 'text/plain'; ext = 'txt'; }
        if (!mime) {
          if (!origExt) { drop(); return fail(415, 'Esse tipo de arquivo não é permitido.'); }
          mime = 'application/octet-stream';
          ext = origExt;
        }
        if ((kind === 'avatar' || kind === 'banner') && !mime.startsWith('image/')) {
          drop();
          return fail(415, 'Foto e banner precisam ser PNG, JPG, WEBP ou GIF.');
        }
        const id = crypto.randomBytes(16).toString('hex');
        try { fs.renameSync(tmp, path.join(UPLOADS, `${id}.${ext}`)); }
        catch { drop(); return fail(500, 'Não consegui guardar o arquivo.'); }
        const size = fs.statSync(path.join(UPLOADS, `${id}.${ext}`)).size;
        files[id] = { pid: socket.data.pid, name, mime, size, ext };
        saveFiles();
        if (finished) return;
        finished = true;
        res.json({ url: `/media/${id}`, name, mime, size });
      });
    });
    bb.on('error', () => fail(400, 'Não consegui ler o arquivo.'));
    bb.on('finish', () => { if (!got) fail(400, 'Nenhum arquivo.'); });
    req.pipe(bb);
  });

  function resolveList(pid, list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const item of list) {
      if (out.length >= 8) break;
      const url = typeof item === 'string' ? item : item?.url;
      const f = owned(pid, url);
      if (f) out.push(f);
    }
    return out;
  }

  return { getProfile, setProfile, owned, resolveList, issue, MAX_BYTES };
}

module.exports = { createMedia };
