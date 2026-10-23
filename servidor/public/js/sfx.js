// Efeitos sonoros do app, sintetizados na hora com Web Audio (sem arquivos de áudio).
// Vantagens: zero download, funciona com a CSP atual e dá para ajustar tudo aqui.
import { store } from './util.js?v=v6a';

let ctx = null;
let master = null;
let enabled = store.get('sfx', true);
let volume = store.get('sfxVol', 70) / 100;
const last = new Map(); // nome -> instante do último som (evita metralhadora)

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor(); // segura picos quando vários sons se sobrepõem
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Uma nota: frequência f (opcionalmente deslizando até `to`), duração d, volume v, atraso `at` (s). */
function tone({ f, to, d = 0.12, type = 'sine', v = 0.18, at = 0 }) {
  const c = ctx;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + d);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(v, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + d + 0.03);
}

// notas (Hz)
const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, A4: 440, E4: 329.63, G4: 392, C4: 261.63 };

const SOUNDS = {
  // --- interface ---
  click: () => tone({ f: 1100, to: 760, d: 0.045, type: 'triangle', v: 0.07 }),
  error: () => { tone({ f: 220, to: 160, d: 0.16, type: 'square', v: 0.07 }); tone({ f: 200, to: 140, d: 0.18, type: 'square', v: 0.07, at: 0.12 }); },
  connect: () => [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone({ f, d: 0.16, v: 0.14, at: i * 0.07, type: 'triangle' })),
  disconnect: () => { tone({ f: N.G4, to: N.C4, d: 0.28, type: 'triangle', v: 0.16 }); },

  // --- chamada (você) ---
  selfJoin: () => [N.C5, N.E5, N.G5].forEach((f, i) => tone({ f, d: 0.2, v: 0.17, at: i * 0.085, type: 'triangle' })),
  selfLeave: () => [N.G5, N.E5, N.C5].forEach((f, i) => tone({ f, d: 0.2, v: 0.15, at: i * 0.085, type: 'triangle' })),

  // --- chamada (outros) ---
  peerJoin: () => { tone({ f: N.E5, d: 0.12, v: 0.13 }); tone({ f: N.A5, d: 0.2, v: 0.13, at: 0.09 }); },
  peerLeave: () => { tone({ f: N.A5, d: 0.12, v: 0.11 }); tone({ f: N.E5, d: 0.2, v: 0.11, at: 0.09 }); },
  roomJoin: () => tone({ f: N.A5, to: N.C6, d: 0.14, v: 0.08 }),
  roomLeave: () => tone({ f: N.C6, to: N.A5, d: 0.14, v: 0.07 }),

  // --- microfone / fone ---
  mute: () => tone({ f: 520, to: 300, d: 0.13, type: 'triangle', v: 0.16 }),
  unmute: () => tone({ f: 300, to: 560, d: 0.13, type: 'triangle', v: 0.16 }),
  deaf: () => { tone({ f: 420, to: 240, d: 0.15, type: 'triangle', v: 0.16 }); tone({ f: 320, to: 180, d: 0.18, type: 'triangle', v: 0.14, at: 0.1 }); },
  undeaf: () => { tone({ f: 240, to: 420, d: 0.15, type: 'triangle', v: 0.16 }); tone({ f: 330, to: 560, d: 0.18, type: 'triangle', v: 0.14, at: 0.1 }); },

  // --- live ---
  liveStart: () => { tone({ f: 380, to: 1200, d: 0.28, type: 'sawtooth', v: 0.06 }); tone({ f: N.C6, d: 0.3, v: 0.13, at: 0.22 }); tone({ f: N.E6, d: 0.35, v: 0.12, at: 0.3 }); },
  liveStop: () => { tone({ f: 1200, to: 380, d: 0.3, type: 'sawtooth', v: 0.06 }); tone({ f: N.E5, d: 0.3, v: 0.12, at: 0.18 }); },
  watchStart: () => { tone({ f: N.G5, d: 0.1, v: 0.12 }); tone({ f: N.C6, d: 0.18, v: 0.12, at: 0.08 }); },
  watchStop: () => { tone({ f: N.C6, d: 0.1, v: 0.1 }); tone({ f: N.G5, d: 0.18, v: 0.1, at: 0.08 }); },
  viewerJoin: () => { tone({ f: N.A5, d: 0.25, v: 0.12 }); tone({ f: N.E6, d: 0.35, v: 0.09, at: 0.07 }); },
  viewerLeave: () => tone({ f: N.E5, to: N.C5, d: 0.22, v: 0.1 }),

  // --- chat ---
  msgIn: () => tone({ f: 760, to: 520, d: 0.09, type: 'triangle', v: 0.14 }),
  msgOut: () => tone({ f: 520, to: 780, d: 0.07, type: 'triangle', v: 0.09 }),

  // --- bot de música ---
  musicAdd: () => { tone({ f: N.E5, d: 0.14, v: 0.12, type: 'triangle' }); tone({ f: N.G5, d: 0.2, v: 0.12, at: 0.08, type: 'triangle' }); },
  musicNext: () => [N.G4, N.C5, N.E5].forEach((f, i) => tone({ f, d: 0.22, v: 0.13, at: i * 0.07, type: 'triangle' })),
  musicPause: () => tone({ f: 480, to: 340, d: 0.12, v: 0.12, type: 'triangle' }),
  musicResume: () => tone({ f: 340, to: 520, d: 0.12, v: 0.12, type: 'triangle' }),
  musicSkip: () => { tone({ f: 600, d: 0.06, v: 0.1, type: 'triangle' }); tone({ f: 900, d: 0.1, v: 0.1, at: 0.06, type: 'triangle' }); },
};

export const sfx = {
  play(name) {
    if (!enabled) return;
    const fn = SOUNDS[name];
    if (!fn || !ensure()) return;
    const now = performance.now();
    if (now - (last.get(name) || 0) < 45) return;
    last.set(name, now);
    try { fn(); } catch { /* áudio indisponível: ignora */ }
  },
  /** Chame num gesto do usuário (clique/tecla) para o navegador liberar o áudio. */
  unlock() { ensure(); },
  get enabled() { return enabled; },
  setEnabled(on) { enabled = !!on; store.set('sfx', enabled); if (enabled) this.play('click'); },
  toggle() { this.setEnabled(!enabled); return enabled; },
  get volume() { return Math.round(volume * 100); },
  setVolume(percent) {
    volume = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
    store.set('sfxVol', Math.round(volume * 100));
    if (master) master.gain.value = volume;
  },
};

/**
 * Feedback sonoro para qualquer clique em botão/canal/seletor.
 * Elementos com data-sfx="none" ficam de fora (eles tocam um som próprio, mais específico).
 */
export function installClickSounds() {
  const unlock = () => sfx.unlock();
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('button, [role="button"], select, .channel, .pk-card');
    if (!el || el.disabled || el.closest('[data-sfx="none"]')) return;
    sfx.play('click');
  }, true);
}
