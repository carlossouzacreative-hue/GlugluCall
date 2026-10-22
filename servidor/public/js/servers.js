// Aba de servidores: buscar servidores existentes ou criar um novo.
import { $, h, toast } from './util.js?v=v6a';

export function createServers({ socket, onOpen }) {
  const modal = $('#srv-modal');
  const list = $('#srv-list');
  const q = $('#srv-q');
  let timer = 0;

  const ask = (ev, data) => new Promise((res) => socket.emit(ev, data, res));

  function setTab(name) {
    document.querySelectorAll('#srv-tabs .pk-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $('#srv-pane-search').hidden = name !== 'search';
    $('#srv-pane-create').hidden = name !== 'create';
    if (name === 'search') search();
  }

  async function search() {
    const r = await ask('srv:search', { q: q.value });
    const items = r?.list || [];
    if (!items.length) {
      list.replaceChildren(h('p', { class: 'muted srv-empty' }, q.value ? 'Nenhum servidor encontrado.' : 'Ainda não há servidores. Crie o primeiro!'));
      return;
    }
    list.replaceChildren(...items.map((s) => {
      const btn = h('button', { type: 'button', class: s.joined ? 'btn ghost' : 'btn primary' }, s.joined ? 'Abrir' : 'Entrar');
      btn.onclick = async () => {
        if (!s.joined) {
          const res = await ask('srv:join', { id: s.id });
          if (!res?.ok) return toast(res?.error || 'Não consegui entrar.', 'error');
        }
        modal.hidden = true;
        onOpen(s.id);
      };
      return h('div', { class: 'srv-card' },
        h('div', { class: 'srv-badge' }, s.name[0].toUpperCase()),
        h('div', { class: 'srv-info' },
          h('strong', {}, s.name),
          h('span', { class: 'muted small' }, s.desc || 'Sem descrição'),
          h('span', { class: 'muted small' }, `${s.count} ${s.count === 1 ? 'membro' : 'membros'} · por ${s.ownerName}`)),
        btn);
    }));
  }

  $('#srv-create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#srv-error');
    err.textContent = '';
    const r = await ask('srv:create', { name: $('#srv-name').value, desc: $('#srv-desc').value });
    if (!r?.ok) { err.textContent = r?.error || 'Não consegui criar.'; return; }
    $('#srv-name').value = '';
    $('#srv-desc').value = '';
    modal.hidden = true;
    toast(`Servidor "${r.server.name}" criado.`, 'info');
    onOpen(r.server.id);
  });

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  document.querySelectorAll('#srv-tabs .pk-tab').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
  $('#srv-close').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  return { open: (tab = 'search') => { modal.hidden = false; setTab(tab); }, leave: (id) => ask('srv:leave', { id }) };
}
