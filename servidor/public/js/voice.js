// Chamada de voz: microfone, mute/ensurdecer, volume individual e indicador de fala.
import { Emitter, store } from './util.js?v=v6a';

const SPEAK_ON = 0.04;
const SPEAK_OFF = 0.02;
const SPEAK_HOLD = 480; // segura o brilho entre as sílabas, senão parece o mic falhando

export function audioPrefs() {
  return {
    mic: store.get('audio.mic', '') || '',
    out: store.get('audio.out', '') || '',
    noise: store.get('audio.noise', true) !== false,
    echo: store.get('audio.echo', true) !== false,
    gain: store.get('audio.gain', true) !== false,
  };
}

/** Manda um <audio>/<video> para o fone escolhido. Sem id, volta ao padrão do sistema. */
export async function applyOutput(el) {
  if (!el || typeof el.setSinkId !== 'function') return false;
  try {
    await el.setSinkId(audioPrefs().out || '');
    return true;
  } catch {
    return false;
  }
}

export class Voice extends Emitter {
  /** @param {{socket:any, hub:import('./peers.js').PeerHub, nameOf:(id:string)=>string}} deps */
  constructor({ socket, hub, nameOf }) {
    super();
    this.socket = socket;
    this.hub = hub;
    this.nameOf = nameOf;

    this.inCall = false;
    this.muted = false;
    this.deaf = false;
    this.mic = null;
    this.audios = new Map(); // id -> HTMLAudioElement
    this.meters = new Map(); // id -> {analyser, data, speaking, source}
    this.ctx = null;
    this.timer = null;
    this.mutedBeforeDeaf = false;

    hub.register('voice', {
      accept: () => this.inCall,
      prepare: (pc) => this.mic?.getTracks().forEach((t) => pc.addTrack(t, this.mic)),
      ontrack: (ev, id) => this.#attach(id, ev.streams[0] || new MediaStream([ev.track])),
    });

    // quem entra liga para todos que já estavam na chamada
    socket.on('call:peers', (ids) => ids.forEach((id) => this.hub.connect(id, 'voice').catch(console.warn)));
  }

  /* ---------------- entrar / sair ---------------- */

  async join() {
    if (this.inCall) return;
    this.mic = await this.#openMic();
    this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume?.();

    this.inCall = true;
    this.muted = false;
    this.deaf = false;
    this.#applyMute();
    this.#watch('me', this.mic);
    this.timer = setInterval(() => this.#measure(), 100);
    this.socket.emit('call:join');
    this.emit('change');
  }

  leave({ silent = false } = {}) {
    if (!this.inCall) return;
    this.inCall = false;
    clearInterval(this.timer);
    this.hub.closeKind('voice');
    for (const id of [...this.audios.keys()]) this.#detach(id);
    this.meters.clear();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    if (!silent) this.socket.emit('call:leave');
    this.emit('speaking', 'me', false);
    this.emit('change');
  }

  /* ---------------- mute / ensurdecer ---------------- */

  toggleMute() {
    if (!this.inCall) return;
    if (this.deaf) return this.toggleDeaf(); // sair do "ensurdecido" também reativa o mic
    this.muted = !this.muted;
    this.#applyMute();
    this.#publish();
  }

  toggleDeaf() {
    if (!this.inCall) return;
    this.deaf = !this.deaf;
    if (this.deaf) { this.mutedBeforeDeaf = this.muted; this.muted = true; }
    else this.muted = this.mutedBeforeDeaf;
    this.#applyMute();
    this.audios.forEach((a) => { a.muted = this.deaf; });
    this.#publish();
  }

  #applyMute() { this.mic?.getAudioTracks().forEach((t) => { t.enabled = !this.muted; }); }
  #publish() {
    this.socket.emit('call:state', { muted: this.muted, deaf: this.deaf });
    this.emit('change');
  }

  /* ---------------- dispositivos e filtros ---------------- */

  /** Grava a preferência e, se já estiver na chamada, troca o mic/saída na hora. */
  async update(patch) {
    if ('mic' in patch) store.set('audio.mic', patch.mic || '');
    if ('out' in patch) store.set('audio.out', patch.out || '');
    if ('noise' in patch) store.set('audio.noise', !!patch.noise);
    if ('echo' in patch) store.set('audio.echo', !!patch.echo);
    if ('gain' in patch) store.set('audio.gain', !!patch.gain);
    const micChanged = 'mic' in patch || 'noise' in patch || 'echo' in patch || 'gain' in patch;
    if (micChanged && this.inCall) await this.#swapMic();
    if ('out' in patch) {
      const ok = await this.#sinkAll();
      if (!ok && patch.out) throw new Error('Não consegui usar essa saída de áudio.');
    }
  }

  async #openMic() {
    const prefs = audioPrefs();
    const base = {
      echoCancellation: prefs.echo,
      noiseSuppression: prefs.noise,
      autoGainControl: prefs.gain,
    };
    const audio = prefs.mic ? { ...base, deviceId: { exact: prefs.mic } } : base;
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: false });
    } catch (e) {
      if (prefs.mic && e?.name !== 'NotAllowedError') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: base, video: false });
          store.set('audio.mic', '');
          return stream;
        } catch (err) { e = err; }
      }
      const msg = e?.name === 'NotAllowedError' ? 'Permissão do microfone negada.' : 'Não encontrei um microfone.';
      throw new Error(msg);
    }
  }

  async #swapMic() {
    const next = await this.#openMic();
    const track = next.getAudioTracks()[0];
    const prev = this.mic;
    this.mic = next;
    for (const e of this.hub.list('voice')) {
      const sender = e.pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender && track) await sender.replaceTrack(track);
    }
    prev?.getTracks().forEach((t) => t.stop());
    this.#applyMute();
    this.#watch('me', this.mic);
  }

  async #sinkAll() {
    const results = await Promise.all([...this.audios.values()].map((a) => applyOutput(a)));
    return results.every(Boolean);
  }

  /* ---------------- volume individual ---------------- */

  volumeOf(id) { return store.get(`vol:${this.nameOf(id)}`, 100); }

  setVolume(id, percent) {
    const v = Math.max(0, Math.min(100, Number(percent) || 0));
    store.set(`vol:${this.nameOf(id)}`, v);
    const audio = this.audios.get(id);
    if (audio) audio.volume = v / 100;
  }

  /* ---------------- áudio remoto ---------------- */

  #attach(id, stream) {
    if (this.audios.get(id)?.srcObject === stream) return;
    this.#detach(id);
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    audio.volume = this.volumeOf(id) / 100;
    audio.muted = this.deaf;
    applyOutput(audio);
    audio.play().catch(() => {});
    this.audios.set(id, audio);
    this.#watch(id, stream);
  }

  #detach(id) {
    const a = this.audios.get(id);
    if (a) { a.pause(); a.srcObject = null; this.audios.delete(id); }
    this.meters.get(id)?.source?.disconnect();
    this.meters.delete(id);
    this.emit('speaking', id, false);
  }

  /** Chamado quando alguém sai da chamada. */
  drop(id) {
    this.hub.close(id, 'voice');
    this.#detach(id);
  }

  /* ---------------- indicador de fala ---------------- */

  #watch(id, stream) {
    if (!this.ctx || !stream.getAudioTracks().length) return;
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = this.ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    this.meters.get(id)?.source?.disconnect();
    this.meters.set(id, { analyser, data: new Uint8Array(analyser.fftSize), speaking: false, source, level: 0, until: 0 });
  }

  #measure() {
    const now = performance.now();
    for (const [id, m] of this.meters) {
      m.analyser.getByteTimeDomainData(m.data);
      let sum = 0;
      for (const v of m.data) { const x = (v - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / m.data.length);
      m.level = m.level * 0.62 + rms * 0.38;
      const silenced = id === 'me' && this.muted;
      const hot = !silenced && m.level > (m.speaking ? SPEAK_OFF : SPEAK_ON);
      if (hot) m.until = now + SPEAK_HOLD;
      const speaking = !silenced && (hot || now < m.until);
      if (speaking !== m.speaking) { m.speaking = speaking; this.emit('speaking', id, speaking); }
    }
  }
}
