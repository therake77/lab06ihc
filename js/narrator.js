// narrator.js — Lectura en voz alta (TTS) de las respuestas de los personajes
//
// Usa la Web Speech API del navegador (speechSynthesis), sin costo ni API key.
// Cada personaje tiene su propio tono y velocidad (campo `voz` en data.js),
// y se prefiere una voz en español latinoamericano.

const PREFERRED_LANGS = ['es-PE', 'es-419', 'es-US', 'es-MX', 'es-CO', 'es-AR', 'es-CL', 'es-ES'];

// Quita marcas de formato que no deben leerse en voz alta
function speakableText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/[#_`>]/g, '')
    .replace(/…/g, '.')
    .trim();
}

export class Narrator {
  constructor() {
    this.supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    this.voice = null;
    this.speaking = null;   // { button } del mensaje que se está leyendo
    if (!this.supported) return;
    this.pickVoice();
    window.speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
  }

  pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    const spanish = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('es'));
    for (const lang of PREFERRED_LANGS) {
      const match = spanish.find(v => v.lang.toLowerCase() === lang.toLowerCase());
      if (match) { this.voice = match; return; }
    }
    this.voice = spanish[0] || null;
  }

  get hasSpanishVoice() {
    return Boolean(this.voice);
  }

  /**
   * Lee un texto con la voz del personaje.
   * @param {string} text
   * @param {{ tono?: number, velocidad?: number }} [voz]
   * @param {{ onStart?: Function, onEnd?: Function }} [events]
   */
  speak(text, voz = {}, { onStart, onEnd } = {}) {
    if (!this.supported) return;
    this.stop();
    const utterance = new SpeechSynthesisUtterance(speakableText(text));
    utterance.lang = this.voice?.lang || 'es-ES';
    if (this.voice) utterance.voice = this.voice;
    utterance.pitch = voz.tono ?? 1;
    utterance.rate = voz.velocidad ?? 1;
    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    this.current = { onEnd };
    window.speechSynthesis.speak(utterance);
  }

  stop() {
    if (!this.supported) return;
    const previous = this.current;
    this.current = null;
    window.speechSynthesis.cancel();
    previous?.onEnd?.();
  }
}
