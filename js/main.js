// main.js — Integración de la visualización con la interfaz
import { ConstellationSpiral } from './constellation.js';
import { historicalData, CATEGORIES } from './data.js';

// Iconos SVG de cada forma, usados en la leyenda, el tooltip y el panel
const SHAPE_ICONS = {
  esfera: '<circle cx="8" cy="8" r="6"/>',
  cubo: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/>',
  octaedro: '<path d="M8 1.5 14.5 8 8 14.5 1.5 8Z"/>',
  tetraedro: '<path d="M8 2 14.5 14H1.5Z"/>',
  dodecaedro: '<path d="M8 1.5 14.2 6 11.8 13.5H4.2L1.8 6Z"/>'
};

function shapeIcon(cat) {
  return `<svg class="shape-icon" viewBox="0 0 16 16" aria-hidden="true" style="--cat:${cat.color}">${SHAPE_ICONS[cat.forma]}</svg>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const METADATA_LABELS = {
  lugar: 'Lugar',
  obra: 'Obra',
  formato: 'Formato',
  aporte: 'Aporte'
};

class ChefConstellationApp {
  constructor() {
    this.constellation = new ConstellationSpiral('canvas-container');
    this.categoryById = new Map(CATEGORIES.map(c => [c.id, c]));
    this.events = historicalData.events;

    this.tooltip = document.getElementById('tooltip');
    this.infoPanel = document.getElementById('info-panel');

    this.computeLinks();
    this.initData();
    this.buildLegend();
    this.setupInteraction();
    this.animate();
  }

  // Conexiones entrantes y salientes de cada evento (impacto causal)
  computeLinks() {
    const ids = new Set(this.events.map(e => e.id));
    this.outgoing = new Map();
    this.incoming = new Map();
    this.events.forEach(e => {
      const valid = (e.conexiones || []).filter(id => {
        if (!ids.has(id)) console.warn(`Conexión a un nodo inexistente: ${e.id} → ${id}`);
        return ids.has(id);
      });
      this.outgoing.set(e.id, valid);
      valid.forEach(t => {
        if (!this.incoming.has(t)) this.incoming.set(t, []);
        this.incoming.get(t).push(e.id);
      });
    });
  }

  impactOf(id) {
    return (this.outgoing.get(id)?.length || 0) + (this.incoming.get(id)?.length || 0);
  }

  initData() {
    this.events.forEach(event => {
      this.constellation.addNodeWithShader(event, this.impactOf(event.id));
    });
    this.constellation.addCausalConnections(this.outgoing);
    this.connectionCount = this.constellation.connections.length;

    document.getElementById('node-count').textContent =
      `${this.events.length} eventos en ${CATEGORIES.length} niveles · ${this.connectionCount} conexiones causales`;
  }

  // La leyenda también indica la profundidad: muestra sobre qué nivel está la cámara
  // y permite descender directamente a uno de ellos.
  buildLegend() {
    const list = document.getElementById('legend-list');
    this.legendRows = [];
    // De arriba hacia abajo, en el mismo orden en que la cámara los atraviesa
    [...CATEGORIES].reverse().forEach(cat => {
      const index = CATEGORIES.indexOf(cat);
      const count = this.events.filter(e => e.categoria === cat.id).length;
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'legend-row';
      btn.style.setProperty('--cat', cat.color);
      btn.title = cat.descripcion;
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `${shapeIcon(cat)}<span class="legend-name">${cat.nombre}</span><span class="legend-count">${count}</span>`;
      btn.addEventListener('click', () => this.toggleFocusLevel(index));
      li.appendChild(btn);
      list.appendChild(li);
      this.legendRows.push({ index, btn });
    });
    this.depthMarker = document.getElementById('depth-marker');
    this.legendTrack = document.querySelector('.legend-track');
  }

  // Clic en un nivel: se muestra solo ese nivel; otro clic vuelve a mostrar todos
  toggleFocusLevel(index) {
    const next = this.constellation.focusLevel === index ? null : index;
    this.constellation.setFocusLevel(next);
    this.legendRows.forEach(row => {
      row.btn.setAttribute('aria-pressed', String(row.index === next));
    });
    document.querySelector('.legend').classList.toggle('has-focus', next !== null);
  }

  updateLegendDepth() {
    const { weight, levelPosition, reveals } = this.constellation.getDepthState();
    const superior = weight > 0.5;
    this.legendTrack.classList.toggle('is-active', superior);

    // Fila 0 = nivel superior. La marca se ubica entre filas según la altura de la cámara.
    const rowHeight = this.legendRows[0].btn.offsetHeight + 2;
    const pos = Math.max(-0.5, Math.min(this.legendRows.length - 0.5, levelPosition));
    this.depthMarker.style.transform = `translateY(${(pos + 0.5) * rowHeight}px)`;

    let current = -1;
    if (superior) {
      let best = 0.35;
      this.legendRows.forEach((row, i) => {
        if (reveals[row.index] > best) { best = reveals[row.index]; current = i; }
      });
    }
    this.legendRows.forEach((row, i) => {
      row.btn.style.setProperty('--reveal', superior ? reveals[row.index].toFixed(2) : '0');
      row.btn.classList.toggle('is-current', i === current);
    });
  }

  setViewButtons(name) {
    document.querySelectorAll('[data-view]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.view === name));
    });
  }

  setupInteraction() {
    this.constellation.onNodeHover = (data, event) => this.updateTooltip(data, event);
    this.constellation.onNodeClick = (data) => this.showEventInfo(data);

    // Vistas: un clic en la vista activa la restablece
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setViewButtons(btn.dataset.view);
        this.constellation.setView(btn.dataset.view);
      });
    });

    // Modo alternativo: todas las conexiones a la vez
    const toggle = document.getElementById('toggle-connections');
    toggle.addEventListener('click', () => {
      const on = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(on));
      this.constellation.setShowAllConnections(on);
    });

    document.getElementById('info-close').addEventListener('click', () => this.closeInfo());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeInfo();
    });
  }

  // ─────────────────────────── Tooltip ───────────────────────────
  updateTooltip(data, event) {
    const tip = this.tooltip;
    if (!data) {
      tip.hidden = true;
      this.tooltipFor = null;
      return;
    }
    if (this.tooltipFor !== data.id) {
      this.tooltipFor = data.id;
      const cat = this.categoryById.get(data.categoria);
      const meta = Object.entries(data.metadata || {})
        .filter(([k]) => k !== 'obra' || data.personaje)
        .slice(0, 2)
        .map(([k, v]) => `<dt>${METADATA_LABELS[k] || k}</dt><dd>${escapeHtml(v)}</dd>`)
        .join('');
      const impact = this.impactOf(data.id);
      tip.innerHTML = `
        <div class="tt-head" style="--cat:${cat.color}">
          ${shapeIcon(cat)}<span>${cat.nombre}</span>
          <span class="tt-year">${escapeHtml(data.fecha_texto || data.año)}</span>
        </div>
        <h3 class="tt-title">${escapeHtml(data.nombre)}</h3>
        <p class="tt-summary">${escapeHtml(data.resumen)}</p>
        ${meta ? `<dl class="tt-meta">${meta}</dl>` : ''}
        <p class="tt-foot">
          ${data.personaje ? '<span class="tt-badge">Personaje</span>' : ''}
          <span>${impact} ${impact === 1 ? 'conexión causal' : 'conexiones causales'}</span>
        </p>`;
      tip.hidden = false;
    }
    if (event) this.positionTooltip(event.clientX, event.clientY);
  }

  positionTooltip(x, y) {
    const tip = this.tooltip;
    const pad = 16;
    const { offsetWidth: w, offsetHeight: h } = tip;
    let left = x + pad;
    let top = y + pad;
    if (left + w > window.innerWidth - 8) left = x - w - pad;
    if (top + h > window.innerHeight - 8) top = y - h - pad;
    tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }

  // ─────────────────────── Panel de información ───────────────────────
  showEventInfo(data) {
    const cat = this.categoryById.get(data.categoria);
    const panel = this.infoPanel;
    panel.style.setProperty('--cat', cat.color);

    panel.querySelector('.info-cat').innerHTML = `${shapeIcon(cat)}<span>${cat.nombre}</span>`;
    panel.querySelector('.info-year').textContent = data.fecha_texto || data.año;
    panel.querySelector('.info-title').textContent = data.nombre;
    panel.querySelector('.info-summary').textContent = data.resumen;

    const meta = panel.querySelector('.info-meta');
    meta.innerHTML = Object.entries(data.metadata || {})
      .map(([k, v]) => `<dt>${METADATA_LABELS[k] || k}</dt><dd>${escapeHtml(v)}</dd>`)
      .join('');

    this.renderLinkList(panel.querySelector('.info-out'), this.outgoing.get(data.id) || [], 'No influyó en otros eventos de la constelación.');
    this.renderLinkList(panel.querySelector('.info-in'), this.incoming.get(data.id) || [], 'Es un punto de partida en la constelación.');

    panel.querySelector('.info-character').hidden = !data.personaje;

    panel.hidden = false;
    panel.classList.add('is-open');
    document.body.classList.add('info-open');
  }

  renderLinkList(listEl, ids, emptyText) {
    listEl.innerHTML = '';
    if (!ids.length) {
      const li = document.createElement('li');
      li.className = 'link-empty';
      li.textContent = emptyText;
      listEl.appendChild(li);
      return;
    }
    ids.forEach(id => {
      const ev = this.events.find(e => e.id === id);
      const cat = this.categoryById.get(ev.categoria);
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'link-btn';
      btn.innerHTML = `${shapeIcon(cat)}<span>${escapeHtml(ev.nombre)}</span><span class="link-year">${escapeHtml(ev.fecha_texto || ev.año)}</span>`;
      btn.addEventListener('click', () => {
        const node = this.constellation.findNode(id);
        this.constellation.select(node);
        this.constellation.focusNode(node);
        this.showEventInfo(ev);
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  closeInfo() {
    this.infoPanel.classList.remove('is-open');
    this.infoPanel.hidden = true;
    document.body.classList.remove('info-open');
    this.constellation.select(null);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.constellation.animate();
    this.updateLegendDepth();
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ChefConstellationApp();
});
