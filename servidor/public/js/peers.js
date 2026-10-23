// PeerHub: gerencia as RTCPeerConnection (uma por par + tipo) e a sinalização via Socket.IO.
//
// Tipos ("kind"): 'voice' (chamada) e 'live' (transmissão de tela).
// Papéis fixos evitam "glare": quem liga (initiator) cria o offer; o outro só responde.
//
// Para trocar o mesh por um SFU no futuro, este é o único módulo que precisa mudar.

export class PeerHub {
  /** @param {import('socket.io-client').Socket} socket @param {RTCIceServer[]} iceServers */
  constructor(socket, iceServers) {
    this.socket = socket;
    this.iceServers = iceServers;
    this.peers = new Map(); // `${id}|${kind}` -> entry
    this.handlers = {};
    socket.on('rtc:signal', (msg) => this.#onSignal(msg).catch((e) => console.warn('[rtc]', e)));
  }

  /**
   * @param {'voice'|'live'} kind
   * @param {{accept:(from:string)=>boolean, prepare?:(pc:RTCPeerConnection,id:string,role:'offer'|'answer')=>void,
   *          ontrack?:(ev:RTCTrackEvent,id:string)=>void, onstate?:(state:string,id:string)=>void}} handler
   */
  register(kind, handler) { this.handlers[kind] = handler; }

  #key = (id, kind) => `${id}|${kind}`;
  has(id, kind) { return this.peers.has(this.#key(id, kind)); }
  get(id, kind) { return this.peers.get(this.#key(id, kind))?.pc; }
  /** Lista as conexões de um tipo: [{id, initiator, pc}] */
  list(kind) { return [...this.peers.values()].filter((e) => e.kind === kind); }

  #send(id, kind, data) { this.socket.emit('rtc:signal', { to: id, kind, data }); }

  #make(id, kind, initiator) {
    const handler = this.handlers[kind];
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const entry = { id, kind, initiator, pc, queue: [], remoteSet: false, prepared: false };
    this.peers.set(this.#key(id, kind), entry);

    pc.onicecandidate = (e) => { if (e.candidate) this.#send(id, kind, { candidate: e.candidate }); };
    pc.ontrack = (e) => handler?.ontrack?.(e, id);
    pc.onconnectionstatechange = () => {
      handler?.onstate?.(pc.connectionState, id);
      if (pc.connectionState === 'failed' && entry.initiator) this.#iceRestart(entry);
    };
    return entry;
  }

  /** Liga para `id` (somos o offerer). Retorna a RTCPeerConnection depois do offer enviado. */
  async connect(id, kind) {
    this.close(id, kind);
    const entry = this.#make(id, kind, true);
    this.handlers[kind]?.prepare?.(entry.pc, id, 'offer');
    entry.prepared = true;
    await this.#offer(entry);
    return entry.pc;
  }

  async #offer(entry, options) {
    const offer = await entry.pc.createOffer(options);
    await entry.pc.setLocalDescription(offer);
    this.#send(entry.id, entry.kind, { description: entry.pc.localDescription });
  }

  async #iceRestart(entry) {
    try { await this.#offer(entry, { iceRestart: true }); } catch { /* o par pode ter saído */ }
  }

  async #flush(entry) {
    entry.remoteSet = true;
    for (const c of entry.queue.splice(0)) await entry.pc.addIceCandidate(c).catch(() => {});
  }

  async #onSignal({ from, kind, data }) {
    const handler = this.handlers[kind];
    if (!handler || !data) return;
    let entry = this.peers.get(this.#key(from, kind));

    if (data.description) {
      const desc = data.description;
      if (desc.type === 'offer') {
        if (!handler.accept(from)) return;
        if (!entry || entry.initiator) entry = this.#make(from, kind, false); // novo (ou reiniciado) como answerer
        await entry.pc.setRemoteDescription(desc);
        if (!entry.prepared) { handler.prepare?.(entry.pc, from, 'answer'); entry.prepared = true; }
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        this.#send(from, kind, { description: entry.pc.localDescription });
        await this.#flush(entry);
      } else if (desc.type === 'answer' && entry) {
        await entry.pc.setRemoteDescription(desc);
        await this.#flush(entry);
      }
    } else if (data.candidate && entry) {
      if (entry.remoteSet) await entry.pc.addIceCandidate(data.candidate).catch(() => {});
      else entry.queue.push(data.candidate);
    }
  }

  close(id, kind) {
    const k = this.#key(id, kind);
    const entry = this.peers.get(k);
    if (!entry) return;
    this.peers.delete(k);
    entry.pc.onicecandidate = entry.pc.ontrack = entry.pc.onconnectionstatechange = null;
    try { entry.pc.close(); } catch { /* já fechada */ }
  }

  /** Fecha todas as conexões de um tipo (opcionalmente filtradas). */
  closeKind(kind, filter = () => true) {
    for (const e of this.list(kind)) if (filter(e)) this.close(e.id, kind);
  }
}
