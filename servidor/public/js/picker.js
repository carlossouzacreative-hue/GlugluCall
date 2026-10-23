// Seletor de transmissão no estilo de um "ir ao vivo": telas e janelas com miniatura,
// resolução e fps escolhidos aqui. No aplicativo isso substitui o pop-up do Chrome.
import { $, h, store, toast } from './util.js?v=v6a';
import { makeQuality } from './live.js?v=v6a';

export function createPicker({ live }) {
  const modal = $('#picker');
  const grid = $('#pk-grid');
  const startBtn = $('#pk-start');
  const native = !!window.native?.isElectron;

  let selected = null;
  let tab = store.get('shareTab', 'screen');
  let timer = null;
  let last = [];
  const cards = new Map();

  $('#pk-native').hidden = !native;
  $('#pk-tabs').hidden = !native;
  $('#pk-browser').hidden = native;
  $('#pk-res').value = store.get('shareRes', '1080');
  $('#pk-fps').value = store.get('shareFps', '30');
  $('#pk-audio').checked = store.get('shareAudio', true);
  startBtn.disabled = native;

  function paintPrecise() {
    const q = makeQuality($('#pk-res').value, $('#pk-fps').value);
    $('#pk-precise').textContent = `Pede ${q.label} e segura essa nitidez. Não usa o seletor padrão do Chrome.`;
  }
  paintPrecise();
  $('#pk-res').addEventListener('change', paintPrecise);
  $('#pk-fps').addEventListener('change', paintPrecise);

  function select(id) {
    selected = id;
    cards.forEach((c, cid) => c.btn.classList.toggle('selected', cid === id));
    startBtn.disabled = native && !selected;
  }

  function setTab(next) {
    tab = next === 'window' ? 'window' : 'screen';
    store.set('shareTab', tab);
    document.querySelectorAll('.pk-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    render(last);
  }

  function render(sources) {
    last = sources;
    const list = sources.filter((s) => (tab === 'screen' ? s.isScreen : !s.isScreen));
    const ids = new Set(list.map((s) => s.id));
    for (const [id, c] of cards) if (!ids.has(id)) { c.btn.remove(); cards.delete(id); }
    if (selected && !ids.has(selected)) select(null);
    if (!list.length) {
      grid.replaceChildren(h('p', { class: 'muted' }, tab === 'screen' ? 'Nenhuma tela encontrada.' : 'Nenhuma janela encontrada.'));
      cards.clear();
      return;
    }
    const note = grid.querySelector('p');
    if (note) note.remove();
    list.forEach((s) => {
      let c = cards.get(s.id);
      if (!c) {
        const img = h('img', { alt: '' });
        const label = h('span', { class: 'pk-name' }, s.icon ? h('img', { class: 'pk-icon', src: s.icon, alt: '' }) : null, s.name || (s.isScreen ? 'Tela' : 'Janela'));
        const btn = h('button', {
          type: 'button',
          class: 'pk-card',
          onclick: () => select(s.id),
          ondblclick: () => { select(s.id); start(); },
        }, h('div', { class: 'pk-thumb' }, img), label);
        c = { btn, img };
        cards.set(s.id, c);
        grid.append(btn);
      }
      if (s.thumbnail && c.img.src !== s.thumbnail) c.img.src = s.thumbnail;
    });
  }

  async function refresh() {
    try { render(await window.native.getSources()); } catch (e) { console.warn(e); }
  }

  function open() {
    modal.hidden = false;
    selected = null;
    startBtn.disabled = native;
    startBtn.textContent = live.streaming ? 'Trocar tela' : 'Ir ao vivo';
    paintPrecise();
    if (native) {
      grid.replaceChildren(h('p', { class: 'muted' }, 'Procurando telas…'));
      cards.clear();
      setTab(tab);
      refresh();
      timer = setInterval(refresh, 1500);
    }
  }

  function close() {
    modal.hidden = true;
    clearInterval(timer);
    cards.clear();
    grid.replaceChildren();
  }

  async function start() {
    if (native && !selected) return;
    const quality = makeQuality($('#pk-res').value, $('#pk-fps').value);
    const audio = $('#pk-audio').checked;
    store.set('shareRes', $('#pk-res').value);
    store.set('shareFps', $('#pk-fps').value);
    store.set('shareAudio', audio);
    startBtn.disabled = true;
    try {
      await live.start({ sourceId: selected, quality, audio });
      close();
    } catch (e) {
      startBtn.disabled = native && !selected;
      if (e?.name !== 'NotAllowedError') toast(e.message || 'Não foi possível iniciar a live.', 'error');
    }
  }

  document.querySelectorAll('.pk-tab').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
  $('#pk-close').addEventListener('click', close);
  $('#pk-cancel').addEventListener('click', close);
  startBtn.addEventListener('click', start);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  return { open, close };
}
