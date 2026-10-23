// Chat em tempo real: sala geral e mensagens diretas, com fotos, GIF e anexos (até 50 MB).
import { h, toast } from './util.js?v=v6a';
import { uploadFile, MAX_BYTES } from './upload.js?v=v6a';

const NEAR_BOTTOM_PX = 80;
const MEDIA = /^\/media\/[a-f0-9]{32}$/;

const fmtSize = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export class Chat {
  /** @param {{socket:any, list:HTMLElement, form:HTMLFormElement, input:HTMLInputElement, jump:HTMLElement}} deps */
  constructor({ socket, list, form, input, jump, getUser, onProfile, onDm, getPid }) {
    this.socket = socket;
    this.list = list;
    this.input = input;
    this.jump = jump;
    this.getUser = getUser || (() => null);
    this.onProfile = onProfile || (() => {});
    this.onDm = onDm || (() => {});
    this.getPid = getPid || (() => '');
    this.view = 'geral';
    this.buckets = new Map();
    this.seen = new Set();
    this.pending = [];
    this.sending = false;

    this.file = document.getElementById('chat-file');
    this.pendingBox = document.getElementById('chat-pending');
    this.attachBtn = document.getElementById('chat-attach');

    socket.on('chat:history', (msgs) => {
      this.buckets.set('geral', msgs || []);
      if (this.view === 'geral') this.#repaint();
    });
    socket.on('chat:msg', (m) => this.#push('geral', m));
    socket.on('dm:history', ({ pid, messages } = {}) => {
      if (!pid) return;
      this.buckets.set(pid, messages || []);
      if (this.view === pid) this.#repaint();
    });
    socket.on('dm:msg', (m) => { if (m?.peer) this.#push(m.peer, m); });
    socket.on('srv:history', ({ id, messages } = {}) => {
      if (!id) return;
      this.buckets.set(`s:${id}`, messages || []);
      if (this.view === `s:${id}`) this.#repaint();
    });
    socket.on('srv:msg', (m) => { if (m?.srv) this.#push(`s:${m.srv}`, m); });
    socket.on('chat:limited', () => toast('Calma! Mensagens demais em pouco tempo.', 'warn', 2500));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.#send();
    });
    this.attachBtn?.addEventListener('click', () => this.file?.click());
    this.file?.addEventListener('change', () => {
      for (const file of this.file.files || []) this.#addPending(file);
      this.file.value = '';
    });
    this.input.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f) => this.#addPending(f));
    });
    const panel = document.getElementById('chat');
    panel?.addEventListener('dragover', (e) => {
      if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
    });
    panel?.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f) => this.#addPending(f));
    });

    this.list.addEventListener('scroll', () => { if (this.#nearBottom()) this.jump.hidden = true; });
    this.jump.addEventListener('click', () => this.scrollToEnd());
  }

  showGeral() {
    this.view = 'geral';
    this.#repaint();
  }

  showDm(pid) {
    this.view = pid;
    this.#repaint();
    this.socket.emit('dm:open', { pid });
  }

  showServer(id) {
    this.view = `s:${id}`;
    this.#repaint();
    this.socket.emit('srv:open', { id });
  }

  #addPending(file) {
    if (file.size > MAX_BYTES) { toast(`"${file.name}" passa de 50 MB.`, 'warn'); return; }
    if (this.pending.length >= 8) { toast('No máximo 8 anexos por mensagem.', 'warn'); return; }
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    this.pending.push({ file, url });
    this.#paintPending();
  }

  #paintPending() {
    const box = this.pendingBox;
    if (!box) return;
    box.hidden = !this.pending.length;
    box.replaceChildren(...this.pending.map((p, i) => {
      const chip = h('span', { class: 'pending-chip' },
        p.url ? h('img', { src: p.url, alt: '' }) : null,
        h('span', { class: 'pending-name' }, `${p.file.name} · ${fmtSize(p.file.size)}`),
        h('button', { type: 'button', class: 'icon-btn', title: 'Remover', 'data-sfx': 'none' }, '×'));
      chip.querySelector('button').onclick = () => {
        if (p.url) URL.revokeObjectURL(p.url);
        this.pending.splice(i, 1);
        this.#paintPending();
      };
      return chip;
    }));
  }

  async #send() {
    if (this.sending) return;
    const text = this.input.value.trim();
    const files = this.pending.slice();
    if (!text && !files.length) return;
    this.sending = true;
    this.input.disabled = true;
    const attachments = [];
    try {
      for (let i = 0; i < files.length; i++) {
        toast(`Enviando ${i + 1}/${files.length}…`, 'info', 1600);
        const up = await uploadFile(files[i].file, 'chat');
        attachments.push({ url: up.url });
      }
      const payload = { text, attachments };
      if (this.view === 'geral') this.socket.emit('chat:send', payload);
      else if (this.view.startsWith('s:')) this.socket.emit('srv:send', { ...payload, id: this.view.slice(2) });
      else this.socket.emit('dm:send', { ...payload, pid: this.view });
      this.input.value = '';
      files.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url); });
      this.pending = [];
      this.#paintPending();
      this.mineNext = true;
    } catch (err) {
      toast(err.message || 'Não consegui enviar o anexo.', 'error');
    }
    this.sending = false;
    this.input.disabled = false;
    this.input.focus();
  }

  #push(key, m) {
    if (!m?.id || this.seen.has(`${key}:${m.id}`)) return;
    this.seen.add(`${key}:${m.id}`);
    const arr = this.buckets.get(key) || [];
    arr.push(m);
    if (arr.length > 300) arr.shift();
    this.buckets.set(key, arr);
    if (this.view === key) this.#paint(m);
  }

  #repaint() {
    this.list.replaceChildren();
    for (const m of this.buckets.get(this.view) || []) this.#paint(m, false);
    this.scrollToEnd();
  }

  #nearBottom() {
    const l = this.list;
    return l.scrollHeight - l.scrollTop - l.clientHeight < NEAR_BOTTOM_PX;
  }

  scrollToEnd() {
    this.list.scrollTop = this.list.scrollHeight;
    this.jump.hidden = true;
  }

  #attachmentNode(a) {
    if (!a || !MEDIA.test(a.url || '')) return null;
    const mime = a.mime || '';
    if (mime.startsWith('image/')) {
      const img = h('img', { class: 'msg-img', src: a.url, alt: a.name || 'imagem' });
      img.onclick = () => openLight(a.url);
      return img;
    }
    if (mime.startsWith('video/')) return h('video', { class: 'msg-video', src: a.url, controls: true, playsinline: true, preload: 'metadata' });
    if (mime.startsWith('audio/')) return h('audio', { class: 'msg-audio', src: a.url, controls: true, preload: 'metadata' });
    return h('a', { class: 'msg-file', href: a.url, download: a.name || 'arquivo' },
      h('strong', {}, a.name || 'Arquivo'),
      h('span', {}, fmtSize(a.size || 0)));
  }

  #paint(m, stick = true) {
    const wasNear = this.#nearBottom();
    const time = new Date(m.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    let node;
    if (m.type === 'system') {
      node = h('div', { class: 'msg system' }, m.text);
    } else {
      const mine = m.from === this.socket.id || m.from === this.getPid();
      const live = this.getUser(m.from);
      const av = h('div', { class: 'avatar sm' });
      paintMini(av, live?.name || m.name, live?.avatar || m.avatar);
      const pid = m.fromPid || (m.from && m.from !== this.socket.id ? m.from : '');
      const who = h('strong', {}, m.name);
      const openCard = () => {
        if (live && live.id !== this.socket.id) this.onProfile(live.id);
        else if (pid && pid !== this.getPid()) this.onDm(pid);
      };
      if ((live && live.id !== this.socket.id) || (pid && pid !== this.getPid())) {
        av.classList.add('clickable');
        av.title = 'Ver perfil';
        av.onclick = openCard;
        who.classList.add('clickable');
        who.title = 'Ver perfil';
        who.onclick = openCard;
      }
      const files = (m.attachments || []).map((a) => this.#attachmentNode(a)).filter(Boolean);
      node = h('div', { class: `msg${mine ? ' mine' : ''}` },
        av,
        h('div', { class: 'msg-body' },
          h('div', { class: 'msg-head' }, who, h('time', {}, time)),
          m.text ? h('div', { class: 'msg-text' }, m.text) : null,
          files.length ? h('div', { class: 'msg-files' }, ...files) : null));
    }
    this.list.append(node);
    if (!stick) return;
    if (wasNear || (this.mineNext && (m.from === this.socket.id || m.from === this.getPid()))) {
      this.scrollToEnd();
      this.mineNext = false;
    } else this.jump.hidden = false;
  }
}

function paintMini(el, name, avatar) {
  el.style.background = '';
  el.replaceChildren();
  if (avatar && MEDIA.test(avatar)) el.append(h('img', { src: avatar, alt: '', draggable: 'false' }));
  else {
    const ch = (name || '?').trim()[0] || '?';
    el.textContent = ch.toUpperCase();
    let hash = 0;
    for (const c of name || '') hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    el.style.background = `hsl(${270 + (hash % 70) - 20} 65% ${52 + (hash % 12)}%)`;
  }
}

function openLight(url) {
  let box = document.getElementById('lightbox');
  if (!box) {
    box = h('div', { id: 'lightbox', class: 'lightbox' });
    box.onclick = () => { box.hidden = true; box.replaceChildren(); };
    document.body.append(box);
  }
  box.replaceChildren(h('img', { src: url, alt: '' }));
  box.hidden = false;
}
