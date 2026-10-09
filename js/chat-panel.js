// chat-panel.js — Panel de chat con los personajes históricos
import { LLMClient, LLMError, DEFAULT_TEMPERATURE } from './llm-client.js';
import { Narrator } from './narrator.js';

const SPEAKER_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5"/></svg>';

const KEY_STORAGE = 'chef-en-el-aire.gemini-key';

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Texto del modelo → HTML seguro (párrafos, **negrita** y *cursiva*)
function formatReply(text) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map(p => `<p>${p
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function readStoredKey() {
  try { return sessionStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

function storeKey(value) {
  try { sessionStorage.setItem(KEY_STORAGE, value); } catch { /* sin almacenamiento */ }
}

/**
 * Carga la API key: js/config.js (generado desde .env por server.js) o la sesión.
 * También informa por qué no se encontró, para mostrar un mensaje útil.
 */
async function loadConfig() {
  let key = '';
  let model = 'auto';
  let problem = '';
  try {
    const config = await import('./config.js');
    key = (config.API_KEY || '').trim();
    model = config.MODEL || 'auto';
    if (!key || /pega_aqui/i.test(key)) {
      key = '';
      problem = config.SOURCE === 'server'
        ? 'El servidor no encontró la key en el archivo .env. Revisa que tenga una línea como GEMINI_API_KEY=tu_api_key (sin comillas ni espacios) y reinicia node server.js. La terminal del servidor indica qué variables leyó.'
        : 'js/config.js no tiene una API key. Pega tu key en ese archivo o bórralo para usar .env con node server.js.';
    }
  } catch {
    problem = 'No se pudo cargar js/config.js. Inicia la app con node server.js (no con Live Server ni con python -m http.server) para que lea la key del archivo .env.';
  }
  if (!key) key = readStoredKey();
  return { key, model, problem };
}

export class CharacterChat {
  /**
   * @param {object} options
   * @param {(cat: string) => object} options.categoryOf  Devuelve la categoría de un evento
   * @param {() => void} [options.onClose]
   */
  constructor({ categoryOf, onClose }) {
    this.categoryOf = categoryOf;
    this.onClose = onClose;
    this.panel = document.getElementById('chat-panel');
    this.messages = document.getElementById('chat-messages');
    this.suggestions = document.getElementById('chat-suggestions');
    this.form = document.getElementById('chat-form');
    this.input = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('chat-send');
    this.modelLabel = document.getElementById('chat-model');
    this.tempInput = document.getElementById('chat-temp');
    this.tempValue = document.getElementById('chat-temp-value');
    this.temperature = DEFAULT_TEMPERATURE;
    this.turnMeta = new WeakMap(); // respuesta del historial → { temperature, model }
    this.narrator = new Narrator();
    this.autoRead = false;
    this.voiceBtn = document.getElementById('chat-voice');
    this.voiceBtn.hidden = !this.narrator.supported;

    this.current = null;          // personaje abierto
    this.histories = new Map();   // memoria por personaje: id → historial de Gemini
    this.busy = false;
    this.llm = null;

    this.ready = loadConfig().then(({ key, model, problem }) => {
      this.model = model;
      this.configProblem = problem;
      if (key) this.createClient(key);
    });

    this.setupEvents();
  }

  createClient(key) {
    this.llm = new LLMClient(key, this.model);
    this.llm.setTemperature(this.temperature);
    this.llm.onModelChange = (model, reason) => {
      this.addNote(`Se cambió al modelo ${model} (${reason}).`);
      this.updateModelLabel();
    };
  }

  setupEvents() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send(this.input.value);
    });
    // Enter envía; Shift + Enter hace un salto de línea
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send(this.input.value);
      }
    });
    this.input.addEventListener('input', () => this.autoGrow());

    // Temperatura: el valor se ve mientras se arrastra y se aplica al soltar
    this.tempInput.addEventListener('input', () => {
      this.tempValue.textContent = Number(this.tempInput.value).toFixed(1);
    });
    this.tempInput.addEventListener('change', () => this.setTemperature(Number(this.tempInput.value)));
    document.getElementById('chat-close').addEventListener('click', () => this.close());
    document.getElementById('chat-reset').addEventListener('click', () => this.reset());

    // Lectura automática de las respuestas en voz alta
    this.voiceBtn.addEventListener('click', () => {
      this.autoRead = !this.autoRead;
      this.voiceBtn.setAttribute('aria-pressed', String(this.autoRead));
      if (!this.autoRead) this.narrator.stop();
      if (this.current) {
        this.addNote(this.autoRead
          ? `Lectura en voz alta activada.${this.narrator.hasSpanishVoice ? '' : ' No se encontró una voz en español en este equipo; se usará la voz predeterminada.'}`
          : 'Lectura en voz alta desactivada.');
      }
    });
  }

  /** Cambia la temperatura de las siguientes respuestas (0 a 2). */
  setTemperature(value, { announce = true } = {}) {
    const t = Math.round(Math.max(0, Math.min(2, value)) * 10) / 10;
    const changed = t !== this.temperature;
    this.temperature = t;
    this.llm?.setTemperature(t);
    this.tempInput.value = String(t);
    this.tempValue.textContent = t.toFixed(1);
    if (announce && changed && this.current) this.addNote(`Temperatura: ${t.toFixed(1)}. Se aplica a las siguientes respuestas.`);
  }

  autoGrow() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 140)}px`;
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  // ───────────────────────── Abrir y cerrar ─────────────────────────
  async open(character) {
    await this.ready;
    // Guardar la memoria del personaje anterior y cargar la del nuevo
    if (this.llm && this.current) this.histories.set(this.current.id, this.llm.conversationHistory);
    this.current = character;
    if (this.llm) this.llm.conversationHistory = this.histories.get(character.id) || [];

    const cat = this.categoryOf(character.categoria);
    this.panel.style.setProperty('--cat', cat.color);
    const avatar = document.getElementById('chat-avatar');
    avatar.src = character.avatar;
    avatar.alt = '';
    document.getElementById('chat-name').textContent = character.nombre;
    document.getElementById('chat-meta').textContent = character.lugar_epoca || String(character.año);

    this.renderConversation();
    this.panel.hidden = false;
    this.panel.classList.add('is-open');
    document.body.classList.add('chat-open');
    this.updateModelLabel();
    if (this.llm) this.input.focus({ preventScroll: true });
  }

  close() {
    if (this.llm && this.current) this.histories.set(this.current.id, this.llm.conversationHistory);
    this.panel.hidden = true;
    this.panel.classList.remove('is-open');
    document.body.classList.remove('chat-open');
    this.current = null;
    this.narrator.stop();
    this.onClose?.();
  }

  reset() {
    if (!this.current) return;
    if (this.llm) this.llm.clearHistory();
    this.histories.delete(this.current.id);
    this.renderConversation();
  }

  // ───────────────────────── Render ─────────────────────────
  renderConversation() {
    const c = this.current;
    this.messages.innerHTML = '';
    this.addNote(`Conversas con ${c.nombre} tal como era en ${c.lugar_epoca || c.año}; no conoce nada de lo que pasó después.`);
    // Saludo fijo: no gasta una solicitud del plan gratuito cada vez que se abre el chat
    const greeting = this.addMessage('character', c.saludo || `Hola, soy ${c.nombre}.`);
    this.addReplyMeta(greeting, null, c.saludo);

    const history = this.llm ? this.llm.conversationHistory : [];
    history.forEach(turn => {
      const isUser = turn.role === 'user';
      const bubble = this.addMessage(isUser ? 'user' : 'character', turn.parts[0].text);
      if (!isUser) this.addReplyMeta(bubble, this.turnMeta.get(turn) || null, turn.parts[0].text);
    });

    this.renderSuggestions(history.length === 0 ? c.sugerencias || [] : []);
    if (!this.llm) this.showKeyForm(this.configProblem);
    this.setBusy(false);
  }

  renderSuggestions(list) {
    this.suggestions.innerHTML = '';
    list.forEach(text => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = text;
      btn.addEventListener('click', () => this.send(text));
      this.suggestions.appendChild(btn);
    });
    this.suggestions.hidden = list.length === 0;
  }

  scrollToEnd() {
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  addMessage(sender, text) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    if (sender === 'character') {
      div.innerHTML = formatReply(text);
    } else {
      div.textContent = text;
    }
    this.messages.appendChild(div);
    this.scrollToEnd();
    return div;
  }

  // Pie de cada respuesta: botón para escucharla y con qué temperatura y modelo se generó
  addReplyMeta(bubble, meta, text) {
    const row = document.createElement('div');
    row.className = 'reply-actions';
    if (this.narrator.supported && text) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'listen-btn';
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `${SPEAKER_ICON}<span>Escuchar</span>`;
      btn.addEventListener('click', () => this.toggleSpeech(btn, text));
      row.appendChild(btn);
      bubble.listenButton = btn;
    }
    if (meta) {
      const info = document.createElement('p');
      info.className = 'reply-meta';
      info.textContent = `Temperatura ${meta.temperature.toFixed(1)} · ${meta.model}`;
      row.appendChild(info);
    }
    if (row.childElementCount) bubble.appendChild(row);
  }

  // Leer o detener la lectura de una respuesta
  toggleSpeech(btn, text) {
    if (btn.getAttribute('aria-pressed') === 'true') {
      this.narrator.stop();
      return;
    }
    const label = btn.querySelector('span');
    this.narrator.speak(text, this.current?.voz, {
      onStart: () => { btn.setAttribute('aria-pressed', 'true'); label.textContent = 'Detener'; },
      onEnd: () => { btn.setAttribute('aria-pressed', 'false'); label.textContent = 'Escuchar'; }
    });
    // Algunos navegadores no disparan onstart: se marca de inmediato
    btn.setAttribute('aria-pressed', 'true');
    label.textContent = 'Detener';
  }

  addNote(text) {
    const p = document.createElement('p');
    p.className = 'message note';
    p.textContent = text;
    this.messages.appendChild(p);
    this.scrollToEnd();
  }

  addError(error, retry) {
    const div = document.createElement('div');
    div.className = 'message error';
    div.setAttribute('role', 'alert');
    const p = document.createElement('p');
    p.textContent = error.userMessage || 'No se pudo obtener la respuesta del personaje.';
    div.appendChild(p);
    if (retry && error.code !== 'invalid_key' && error.code !== 'quota') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-link';
      btn.textContent = 'Reintentar';
      btn.addEventListener('click', () => { div.remove(); retry(); });
      div.appendChild(btn);
    }
    this.messages.appendChild(div);
    this.scrollToEnd();
  }

  showTyping() {
    const div = document.createElement('div');
    div.className = 'message character typing';
    div.innerHTML = '<span class="visually-hidden">Escribiendo…</span><span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    this.messages.appendChild(div);
    this.scrollToEnd();
    return div;
  }

  // Formulario para pegar la key cuando no hay .env ni config.js
  showKeyForm(message, { title = 'Falta la API key de Gemini.', detail = '' } = {}) {
    const box = document.createElement('form');
    box.className = 'message key-form';
    box.innerHTML = `
      <p><strong>${title}</strong> ${escapeHtml(message || 'Agrégala en el archivo .env y reinicia el servidor.')}</p>
      ${detail ? `<p class="key-detail">Respuesta de Google: ${escapeHtml(detail)}</p>` : ''}
      <p class="key-alt">También puedes pegarla aquí para usarla solo en esta pestaña:</p>
      <label for="key-input" class="visually-hidden">API key de Gemini</label>
      <div class="key-row">
        <input id="key-input" type="password" autocomplete="off" placeholder="API key de Google AI Studio">
        <button type="submit" class="btn btn-small">Usar key</button>
      </div>`;
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = box.querySelector('input').value.trim();
      if (!value) return;
      storeKey(value);
      this.createClient(value);
      if (this.current) this.llm.conversationHistory = this.histories.get(this.current.id) || [];
      box.remove();
      this.addNote('API key guardada para esta pestaña.');
      this.setBusy(false);
      // Reenviar la pregunta que falló por la key
      const pending = this.pendingText;
      this.pendingText = null;
      if (pending) this.ask(pending);
      else this.input.focus();
    });
    this.messages.appendChild(box);
    this.scrollToEnd();
    this.setBusy(false);
  }

  setBusy(busy) {
    this.busy = busy;
    const disabled = busy || !this.llm;
    this.input.disabled = disabled;
    this.sendBtn.disabled = disabled;
    this.suggestions.querySelectorAll('button').forEach(b => { b.disabled = disabled; });
  }

  updateModelLabel() {
    this.modelLabel.textContent = this.llm && this.llm.modelName !== 'auto'
      ? `Modelo: ${this.llm.modelName}.`
      : '';
  }

  // ───────────────────────── Envío ─────────────────────────
  async send(rawText) {
    const text = rawText.trim();
    if (!text || this.busy || !this.current) return;

    // Comando para fijar la temperatura desde el chat: /temp 0.5 o /temperatura 1,5
    const command = text.match(/^\/temp(?:eratura)?\s+(\d+(?:[.,]\d+)?)$/i);
    if (command) {
      this.input.value = '';
      this.autoGrow();
      const value = Number(command[1].replace(',', '.'));
      if (value > 2) {
        this.addNote('La temperatura debe estar entre 0 y 2.');
      } else {
        this.setTemperature(value);
      }
      return;
    }
    if (!this.llm) return;

    this.input.value = '';
    this.autoGrow();
    this.renderSuggestions([]);
    this.addMessage('user', text);
    await this.ask(text);
  }

  async ask(text) {
    const character = this.current;
    this.setBusy(true);
    const typing = this.showTyping();

    try {
      const temperature = this.temperature;
      const reply = await this.llm.chat(text, character.prompt_personaje, temperature);
      typing.remove();
      const meta = { temperature, model: this.llm.modelName };
      const lastTurn = this.llm.conversationHistory[this.llm.conversationHistory.length - 1];
      if (lastTurn) this.turnMeta.set(lastTurn, meta);
      // Si el usuario cambió de personaje mientras esperaba, no mezclar respuestas
      if (this.current !== character) return;
      const bubble = this.addMessage('character', reply);
      this.addReplyMeta(bubble, meta, reply);
      if (this.autoRead && bubble.listenButton) this.toggleSpeech(bubble.listenButton, reply);
      this.updateModelLabel();
      this.onReply?.(reply, bubble, character);
    } catch (error) {
      typing.remove();
      const err = error instanceof LLMError ? error : new LLMError('unknown', 'Ocurrió un error inesperado al comunicarse con el personaje.', { detail: error.message });
      if (err.code === 'invalid_key') {
        this.pendingText = text;
        this.llm = null;
        try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* sin almacenamiento */ }
        this.showKeyForm(err.userMessage, { title: 'Google rechazó la API key.', detail: err.detail });
      } else {
        this.addError(err, () => this.ask(text));
      }
    } finally {
      this.setBusy(false);
      if (this.llm) this.input.focus({ preventScroll: true });
    }
  }
}
