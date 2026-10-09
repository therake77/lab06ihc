// llm-client.js — Cliente para la API de Gemini
//
// Basado en la clase LLMClient de la guía, con estos cambios:
// - El modelo se elige automáticamente entre los disponibles para la API key
//   (gemini-2.0-flash, el de la guía, ya fue retirado).
// - Se usa la temperatura configurada con setTemperature().
// - Se limita el "pensamiento" del modelo: en los modelos actuales consume
//   tokens de salida y, sin límite, puede dejar la respuesta vacía.
// - Los errores se traducen a mensajes claros (key inválida, cuota del plan
//   gratuito agotada, sin conexión, respuesta bloqueada, etc.).

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Temperatura por defecto. Google recomienda 1.0 para los modelos Gemini 3.x.
export const DEFAULT_TEMPERATURE = 1.0;

/** Error con un mensaje listo para mostrar en la interfaz. */
export class LLMError extends Error {
  constructor(code, userMessage, { retryAfter = null, status = null, detail = '' } = {}) {
    super(detail || userMessage);
    this.name = 'LLMError';
    this.code = code;               // invalid_key | quota | rate_limit | model | network | blocked | empty | server | bad_request
    this.userMessage = userMessage;
    this.retryAfter = retryAfter;   // segundos sugeridos para reintentar
    this.status = status;
    this.detail = detail;           // mensaje original de la API
  }
}

// Ordena nombres como "gemini-3.5-flash-lite" por versión, de mayor a menor
function versionOf(name) {
  const m = name.match(/^gemini-(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
}

// Modelos de texto estables, en orden de preferencia para el plan gratuito:
// primero Flash-Lite (más cuota diaria), luego Flash.
function rankModels(names) {
  const stable = names.filter(n => !/preview|exp|tts|image|live|audio|transcribe|embedding|robotics|omni|customtools/.test(n));
  const byVersion = (a, b) => versionOf(b) - versionOf(a);
  const lite = stable.filter(n => /^gemini-[\d.]+-flash-lite$/.test(n)).sort(byVersion);
  const flash = stable.filter(n => /^gemini-[\d.]+-flash$/.test(n)).sort(byVersion);
  return [...lite, ...flash];
}

function parseRetryDelay(errorBody) {
  const info = errorBody?.error?.details?.find(d => (d['@type'] || '').includes('RetryInfo'));
  const raw = info?.retryDelay;
  if (!raw) return null;
  const seconds = parseFloat(String(raw).replace('s', ''));
  return Number.isFinite(seconds) ? Math.ceil(seconds) : null;
}

function isDailyQuota(errorBody) {
  const failure = errorBody?.error?.details?.find(d => (d['@type'] || '').includes('QuotaFailure'));
  return (failure?.violations || []).some(v => /PerDay|per_day|daily/i.test(`${v.quotaId} ${v.quotaMetric}`));
}

/** Convierte una respuesta HTTP con error en un LLMError con mensaje claro. */
function toLLMError(status, body, model) {
  const message = body?.error?.message || '';
  const apiStatus = body?.error?.status || '';

  if (status === 400 && /api key/i.test(message)) {
    return new LLMError('invalid_key', 'Revisa que la key esté copiada completa desde Google AI Studio, sin comillas ni espacios, y reinicia node server.js.', { status, detail: message });
  }
  if (status === 401 || status === 403) {
    return new LLMError('invalid_key', 'La API key no tiene permiso para usar la API de Gemini. Genera una nueva en Google AI Studio.', { status, detail: message });
  }
  if (status === 404) {
    return new LLMError('model', `El modelo ${model} no está disponible para esta API key.`, { status, detail: message });
  }
  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    const retryAfter = parseRetryDelay(body);
    if (isDailyQuota(body)) {
      return new LLMError('quota', `Se agotó la cuota diaria del plan gratuito para ${model}. Se reinicia a medianoche, hora del Pacífico.`, { status, retryAfter, detail: message });
    }
    const wait = retryAfter ? ` Espera ${retryAfter} s y vuelve a intentarlo.` : ' Espera un minuto y vuelve a intentarlo.';
    return new LLMError('rate_limit', `Se alcanzó el límite de solicitudes por minuto del plan gratuito.${wait}`, { status, retryAfter, detail: message });
  }
  if (status >= 500) {
    return new LLMError('server', 'El servicio de Gemini no está respondiendo en este momento. Intenta de nuevo en unos segundos.', { status, detail: message });
  }
  return new LLMError('bad_request', `La API rechazó la solicitud: ${message || 'error desconocido'}.`, { status, detail: message });
}

export class LLMClient {
  /**
   * @param {string} apiKey     API key de Google AI Studio
   * @param {string} modelName  Modelo a usar, o 'auto' para elegirlo según la key
   */
  constructor(apiKey, modelName = 'auto') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.autoModel = !modelName || modelName === 'auto';
    this.fallbackModels = [];
    this.baseUrl = BASE_URL;
    this.conversationHistory = []; // Memoria de la conversación
    this.temperature = DEFAULT_TEMPERATURE;
    // Margen amplio: en los modelos actuales el "pensamiento" también cuenta como salida
    this.maxOutputTokens = 4096;
    this.maxContinuations = 2;    // si aun así se corta, se pide que continúe
    this.thinkingSupported = true;
    this.onModelChange = null;     // callback(nuevoModelo, motivo)
  }

  headers() {
    // La key va en un encabezado y no en la URL, para que no quede en registros
    return { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey };
  }

  async request(url, options) {
    try {
      return await fetch(url, options);
    } catch (error) {
      throw new LLMError('network', 'No hay conexión con la API de Gemini. Revisa tu conexión a internet.', { detail: error.message });
    }
  }

  /**
   * Si el modelo es 'auto', consulta los modelos disponibles para la key y elige
   * el Flash-Lite estable más reciente. También sirve para validar la key.
   */
  async resolveModel() {
    if (!this.autoModel || this.resolved) return this.modelName;
    const response = await this.request(`${this.baseUrl}?pageSize=1000`, { headers: this.headers() });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw toLLMError(response.status, body, 'auto');

    const names = (body.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    const ranked = rankModels(names);
    if (!ranked.length) {
      throw new LLMError('model', 'No se encontró un modelo Gemini Flash disponible para esta API key.');
    }
    this.modelName = ranked[0];
    this.fallbackModels = ranked.slice(1);
    this.resolved = true;
    return this.modelName;
  }

  buildRequest(contents, systemPrompt, temperature) {
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: this.maxOutputTokens,
        topP: 0.95
      }
    };
    if (this.thinkingSupported) {
      // Pensamiento al mínimo: respuestas más rápidas y menos tokens del plan gratuito
      body.generationConfig.thinkingConfig = /^gemini-2\./.test(this.modelName)
        ? { thinkingBudget: 0 }
        : { thinkingLevel: 'low' };
    }
    return body;
  }

  extractReply(data) {
    if (data.promptFeedback?.blockReason) {
      throw new LLMError('blocked', 'Los filtros de seguridad de Gemini bloquearon el mensaje. Prueba reformulando la pregunta.');
    }
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new LLMError('empty', 'Gemini no devolvió ninguna respuesta. Intenta de nuevo.');
    }
    const text = (candidate.content?.parts || [])
      .filter(p => typeof p.text === 'string' && !p.thought)
      .map(p => p.text)
      .join('')
      .trim();

    if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(candidate.finishReason) && !text) {
      throw new LLMError('blocked', 'Los filtros de seguridad de Gemini bloquearon la respuesta. Prueba reformulando la pregunta.');
    }
    if (!text) {
      throw new LLMError('empty', 'La respuesta llegó vacía. Intenta de nuevo o haz una pregunta más corta.');
    }
    return { text, truncated: candidate.finishReason === 'MAX_TOKENS' };
  }

  /**
   * Si la respuesta se cortó por el límite de tokens, pide al modelo que continúe
   * desde donde quedó (hasta maxContinuations veces) y une los fragmentos.
   */
  async completeTruncated(baseContents, partial, systemPrompt, temperature) {
    let text = partial;
    for (let i = 0; i < this.maxContinuations; i++) {
      const contents = [
        ...baseContents,
        { role: 'model', parts: [{ text }] },
        { role: 'user', parts: [{ text: 'Continúa exactamente donde te quedaste, sin repetir nada de lo anterior.' }] }
      ];
      try {
        const response = await this.request(`${this.baseUrl}/${this.modelName}:generateContent`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(this.buildRequest(contents, systemPrompt, temperature))
        });
        if (!response.ok) break;
        const piece = this.extractReply(await response.json());
        const needsSpace = !/\s$/.test(text) && !/^[\s.,;:!?)»”]/.test(piece.text);
        text = `${text}${needsSpace ? ' ' : ''}${piece.text}`;
        if (!piece.truncated) break;
      } catch {
        break; // si la continuación falla, se muestra lo que ya llegó
      }
    }
    return text;
  }

  /**
   * Envía un mensaje al LLM con system instructions dinámicas.
   * El systemPrompt define la personalidad del personaje histórico.
   * @param {string} message
   * @param {string} systemPrompt
   * @param {number} [temperature]  Si se omite, usa la de setTemperature()
   * @param {{ remember?: boolean }} [options]  remember=false no guarda en la memoria
   */
  async chat(message, systemPrompt, temperature = this.temperature, { remember = true } = {}) {
    await this.resolveModel();

    let attempt = 0;
    while (true) {
      attempt++;
      const url = `${this.baseUrl}/${this.modelName}:generateContent`;
      const contents = [
        ...this.conversationHistory,
        { role: 'user', parts: [{ text: message }] }
      ];
      const response = await this.request(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.buildRequest(contents, systemPrompt, temperature))
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const first = this.extractReply(data);
        const reply = first.truncated
          ? await this.completeTruncated(contents, first.text, systemPrompt, temperature)
          : first.text;
        if (remember) {
          // Guardar en el historial para dar contexto a las siguientes preguntas
          this.conversationHistory.push(
            { role: 'user', parts: [{ text: message }] },
            { role: 'model', parts: [{ text: reply }] }
          );
          // Limitar el historial a los últimos 10 intercambios para no exceder tokens
          if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
          }
        }
        return reply;
      }

      const error = toLLMError(response.status, data, this.modelName);

      // Algunos modelos no aceptan la configuración de pensamiento: se reintenta sin ella
      if (error.code === 'bad_request' && /thinking/i.test(error.detail) && this.thinkingSupported) {
        this.thinkingSupported = false;
        continue;
      }
      // Cuota diaria agotada o modelo no disponible: probar el siguiente modelo
      if ((error.code === 'quota' || error.code === 'model') && this.autoModel && this.fallbackModels.length) {
        const previous = this.modelName;
        this.modelName = this.fallbackModels.shift();
        this.thinkingSupported = true;
        this.onModelChange?.(this.modelName, `${previous} sin cuota o no disponible`);
        continue;
      }
      // Servicio saturado: un reintento tras una pausa breve
      if (error.code === 'server' && attempt < 2) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      console.error('Error en LLMClient.chat:', error.detail || error);
      throw error;
    }
  }

  /**
   * Limpia el historial de conversación.
   * Útil al cambiar de personaje.
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Configura el nivel de creatividad de las respuestas (0 a 2).
   * Útil para experimentar con diferentes temperaturas.
   */
  setTemperature(value) {
    this.temperature = Math.max(0, Math.min(2, value));
  }
}
