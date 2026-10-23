// Cartão de perfil: foto, banner (GIF incluso), bio e nome.
import { $, h, colorFor, initial, toast, store } from './util.js?v=v6a';
import { uploadFile } from './upload.js?v=v6a';

const MEDIA = /^\/media\/[a-f0-9]{32}$/;

let socket = null;
let getUser = () => null;
let edit = false;
let viewing = null;
let avatarUrl = '';
let bannerUrl = '';
let avatarTouched = false;
let bannerTouched = false;
let busy = false;
let pickKind = 'avatar'; // faltava declarar: sem isso trocar foto/banner dava erro
let c1 = '';
let c2 = '';
let colorTouched = false;
let onDm = null;

export function paintAvatar(el, user) {
  if (!el) return;
  const name = user?.name || '?';
  el.style.background = colorFor(name);
  el.replaceChildren();
  if (user?.avatar && MEDIA.test(user.avatar)) {
    el.append(h('img', { src: user.avatar, alt: '', draggable: 'false' }));
  } else {
    el.append(document.createTextNode(initial(name)));
  }
}

function paintBanner(url) {
  const box = $('#pf-banner');
  box.replaceChildren();
  if (url && MEDIA.test(url)) box.append(h('img', { src: url, alt: '' }));
  box.classList.toggle('has', !!(url && MEDIA.test(url)));
}

function paintTheme() {
  const card = document.querySelector('.profile-card');
  if (!card) return;
  const on = !!(c1 || c2);
  card.classList.toggle('has-theme', on);
  card.style.setProperty('--pf1', c1 || c2 || '#9d4edd');
  card.style.setProperty('--pf2', c2 || c1 || '#2a1650');
  const a = $('#pf-c1'), b = $('#pf-c2');
  if (a) a.value = c1 || '#9d4edd';
  if (b) b.value = c2 || '#2a1650';
}

function show() {
  const u = viewing;
  if (!u) return;
  const mine = u.id === socket.id;
  $('#pf-edit-btn').hidden = !mine || edit;
  const dmBtn = $('#pf-dm');
  if (dmBtn) dmBtn.hidden = mine || edit || !u.pid;
  $('#pf-edit').hidden = !edit;
  $('#pf-banner-btn').hidden = !edit;
  $('#pf-avatar-btn').hidden = !edit;
  $('#pf-name').hidden = edit;
  $('#pf-bio').hidden = edit;
  $('#pf-name').textContent = u.name;
  $('#pf-bio').textContent = u.bio || (mine ? 'Você ainda não escreveu uma bio.' : 'Sem bio.');
  $('#pf-bio').classList.toggle('empty', !u.bio);
  if (!edit) {
    avatarUrl = u.avatar || '';
    bannerUrl = u.banner || '';
    c1 = u.c1 || '';
    c2 = u.c2 || '';
  }
  paintTheme();
  paintAvatar($('#pf-avatar'), { name: edit ? ($('#pf-name-input').value || u.name) : u.name, avatar: avatarUrl });
  paintBanner(bannerUrl);
  if (edit) {
    $('#pf-name-input').value = u.name || '';
    $('#pf-bio-input').value = u.bio || '';
  }
  document.querySelector('.profile-card')?.classList.toggle('editing', edit);
  $('#profile').hidden = false;
}

export function openProfile(id, { edit: startEdit = false } = {}) {
  const u = getUser(id);
  if (!u) { toast('Essa pessoa não está mais na sala.', 'info', 2200); return; }
  viewing = u;
  edit = startEdit && u.id === socket.id;
  avatarTouched = false;
  bannerTouched = false;
  colorTouched = false;
  avatarUrl = u.avatar || '';
  bannerUrl = u.banner || '';
  c1 = u.c1 || '';
  c2 = u.c2 || '';
  show();
}

function close() { $('#profile').hidden = true; edit = false; }

async function pick(kind) {
  pickKind = kind;
  const input = $('#pf-file');
  input.value = '';
  input.click();
}

async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || busy) return;
  busy = true;
  try {
    const up = await uploadFile(file, pickKind);
    if (pickKind === 'avatar') { avatarUrl = up.url; avatarTouched = true; }
    else { bannerUrl = up.url; bannerTouched = true; }
    paintAvatar($('#pf-avatar'), { name: $('#pf-name-input').value || viewing?.name, avatar: avatarUrl });
    paintBanner(bannerUrl);
  } catch (err) { toast(err.message, 'error'); }
  busy = false;
}

function save() {
  if (!socket?.connected || busy) return;
  const patch = {
    name: $('#pf-name-input').value.trim(),
    bio: $('#pf-bio-input').value,
  };
  if (avatarTouched) patch.avatar = avatarUrl || '';
  if (bannerTouched) patch.banner = bannerUrl || '';
  if (colorTouched) { patch.c1 = c1; patch.c2 = c2; }
  busy = true;
  socket.emit('profile:update', patch, (res) => {
    busy = false;
    if (!res?.ok) { toast(res?.error || 'Não consegui salvar o perfil.', 'error'); return; }
    toast('Perfil atualizado.', 'ok', 1800);
    if (res.name) store.set('name', res.name);
    edit = false;
    if (viewing && viewing.id === socket.id) {
      viewing = { ...viewing, ...res };
    }
    avatarTouched = false;
    bannerTouched = false;
    colorTouched = false;
    show();
  });
}

export function initProfile({ socket: s, getUser: gu, onDm: dm }) {
  socket = s;
  getUser = gu;
  onDm = dm || null;
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
  on('#pf-close', 'click', close);
  on('#profile', 'click', (e) => { if (e.target.id === 'profile') close(); });
  on('#pf-edit-btn', 'click', () => { edit = true; show(); });
  on('#pf-dm', 'click', () => {
    const pid = viewing?.pid;
    close();
    if (pid) onDm?.(pid);
  });
  on('#pf-avatar-btn', 'click', () => pick('avatar'));
  on('#pf-banner-btn', 'click', () => pick('banner'));
  on('#pf-avatar', 'click', () => { if (edit) pick('avatar'); });
  on('#pf-banner', 'click', () => { if (edit) pick('banner'); });
  on('#pf-file', 'change', onFile);
  on('#pf-clear-avatar', 'click', () => { avatarUrl = ''; avatarTouched = true; paintAvatar($('#pf-avatar'), { name: $('#pf-name-input').value, avatar: '' }); });
  on('#pf-clear-banner', 'click', () => { bannerUrl = ''; bannerTouched = true; paintBanner(''); });
  on('#pf-c1', 'input', (e) => { c1 = e.target.value; if (!c2) c2 = '#2a1650'; colorTouched = true; paintTheme(); });
  on('#pf-c2', 'input', (e) => { c2 = e.target.value; if (!c1) c1 = '#9d4edd'; colorTouched = true; paintTheme(); });
  on('#pf-clear-colors', 'click', () => { c1 = ''; c2 = ''; colorTouched = true; paintTheme(); });
  on('#pf-save', 'click', save);
  on('#pf-name-input', 'input', () => {
    paintAvatar($('#pf-avatar'), { name: $('#pf-name-input').value, avatar: avatarUrl });
  });
}
