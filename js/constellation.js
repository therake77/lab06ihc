// constellation.js — Escena 3D: espiral temporal, nodos luminosos y navegación
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as d3 from 'd3';
import { CATEGORIES, ERAS } from './data.js';

// ───────────────────────────── Shaders ─────────────────────────────
// Pulso luminoso (basado en el shader de la guía) + borde brillante (rim)
// calculado con la normal en espacio de vista.
const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float time;
  uniform float phase;
  uniform float pulseAmount;
  uniform vec3 baseColor;
  uniform float intensity;
  uniform float highlight;
  uniform float dimmed;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Pulso sinusoidal desfasado por nodo
    float pulse = 1.0 - pulseAmount + sin(time * 2.0 + phase) * pulseAmount;
    // Caras que miran a la cámara más claras; borde con halo
    float facing = clamp(dot(vNormal, vViewDir), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.2);

    vec3 color = baseColor * intensity * pulse * (0.55 + 0.45 * facing);
    color += mix(baseColor, vec3(1.0), 0.35) * rim * (0.8 + highlight);
    color += vec3(1.0) * highlight * 0.18;
    color *= mix(1.0, 0.18, dimmed);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

// Textura de halo radial reutilizada por todos los nodos
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Geometría según la forma de la categoría (información que no depende solo del color)
function geometryForShape(shape, r) {
  switch (shape) {
    case 'cubo': return new THREE.BoxGeometry(r * 1.45, r * 1.45, r * 1.45);
    case 'octaedro': return new THREE.OctahedronGeometry(r * 1.3);
    case 'tetraedro': return new THREE.TetrahedronGeometry(r * 1.5);
    case 'dodecaedro': return new THREE.DodecahedronGeometry(r * 1.15);
    default: return new THREE.SphereGeometry(r, 32, 24);
  }
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class ConstellationSpiral {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    const { width, height } = this.size();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x140f24, 0.0065);

    // El eje Z es "arriba": los niveles de categoría se ven como pisos
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.camera.up.set(0, 0, 1);
    // En pantallas angostas (celular) la cámara se aleja para que entre la espiral
    const fit = Math.min(1.8, Math.max(1, 0.85 / (width / height)));
    this.homePosition = new THREE.Vector3(0, -72, 46).multiplyScalar(fit);
    this.homeTarget = new THREE.Vector3(0, 0, -2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    // Renderer HTML para etiquetas de nombres, años y niveles
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.className = 'label-layer';
    this.container.appendChild(this.labelRenderer.domElement);

    this.nodes = [];        // Mallas visibles de los nodos
    this.hitTargets = [];   // Esferas invisibles para detectar el mouse con margen
    this.connections = [];  // Se llenan en la Fase 2
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.glowTexture = createGlowTexture();
    this.clock = new THREE.Clock();

    this.hovered = null;
    this.selected = null;
    this.flight = null;
    this.onNodeHover = null;   // callback(nodeData | null, event)
    this.onNodeClick = null;   // callback(nodeData)

    this.setupScales();
    this.setupLighting();
    this.setupControls();
    this.buildBackdrop();
    this.buildSpiralGuides();
    this.setupPointer();

    window.addEventListener('resize', () => this.onResize());
  }

  size() {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  // ─────────────────────────── Escalas D3 ───────────────────────────
  setupScales() {
    // Año → vueltas de la espiral (escala por tramos, no lineal en el tiempo)
    this.timeScale = d3.scaleLinear()
      .domain(ERAS.map(e => e.año))
      .range(ERAS.map(e => e.vuelta))
      .clamp(true);

    // Vueltas → radio (espiral de Arquímedes: el radio crece con el tiempo)
    this.radiusScale = d3.scaleLinear().domain([0, 6.6]).range([5, 34]);

    // Importancia (1–10) → radio del nodo
    this.nodeSizeScale = d3.scaleLinear().domain([1, 10]).range([0.45, 1.35]);

    // Impacto causal (n.º de conexiones) → intensidad luminosa
    this.intensityScale = d3.scaleSqrt().domain([0, 12]).range([0.75, 1.6]).clamp(true);

    this.categoryById = new Map(CATEGORIES.map((c, i) => [c.id, { ...c, index: i }]));
    this.levelGap = 8;
  }

  categoryIndex(category) {
    return this.categoryById.get(category)?.index ?? 0;
  }

  categoryColor(category) {
    return new THREE.Color(this.categoryById.get(category)?.color ?? '#ffffff');
  }

  levelZ(index) {
    return (index - (CATEGORIES.length - 1) / 2) * this.levelGap;
  }

  /**
   * Convierte coordenadas históricas (año, categoría) a posición 3D.
   * X-Y: espiral temporal. Z: nivel de la categoría.
   */
  historicalTo3D(year, categoryIndex) {
    const turns = this.timeScale(year);
    const angle = turns * 2 * Math.PI - Math.PI / 2;
    const r = this.radiusScale(turns);
    return new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), this.levelZ(categoryIndex));
  }

  // ─────────────────────── Escena y navegación ───────────────────────
  setupLighting() {
    this.scene.add(new THREE.AmbientLight(0x6a5f8a, 0.6));
    const point = new THREE.PointLight(0xfff1d6, 1.2, 0, 0);
    point.position.set(0, 0, 30);
    this.scene.add(point);
  }

  setupControls() {
    // OrbitControls: rotar (arrastrar), zoom (rueda), desplazar (clic derecho o Shift + arrastrar)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 170;
    this.controls.zoomSpeed = 0.9;
    this.controls.listenToKeyEvents(window); // flechas para desplazar

    // Animación de entrada: de vista cenital a vista inclinada
    if (prefersReducedMotion) {
      this.camera.position.copy(this.homePosition);
      this.controls.target.copy(this.homeTarget);
    } else {
      this.camera.position.set(0, -8, 120);
      this.controls.target.copy(this.homeTarget);
      this.flyTo(this.homePosition, this.homeTarget, 2600);
    }
    this.controls.update();
    this.controls.addEventListener('start', () => { this.flight = null; });
  }

  buildBackdrop() {
    // Polvo de estrellas tenue para dar profundidad
    const count = 1400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 140 + Math.random() * 220;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcfc6e6, size: 0.9, sizeAttenuation: true,
      transparent: true, opacity: 0.55, fog: false, depthWrite: false
    });
    this.scene.add(new THREE.Points(geo, mat));
  }

  buildSpiralGuides() {
    // Una espiral tenue por nivel + columnas verticales que marcan las épocas
    const maxTurns = ERAS[ERAS.length - 1].vuelta;
    const samples = 600;

    CATEGORIES.forEach((cat, index) => {
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        const turns = (i / samples) * maxTurns;
        const angle = turns * 2 * Math.PI - Math.PI / 2;
        const r = this.radiusScale(turns);
        pts.push(new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), this.levelZ(index)));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: cat.color, transparent: true, opacity: 0.22, depthWrite: false })
      );
      this.scene.add(line);

      // Etiqueta del nivel, fuera de la espiral para no tapar nodos
      const el = document.createElement('div');
      el.className = 'level-label';
      el.style.setProperty('--cat', cat.color);
      el.textContent = cat.nombre;
      const label = new CSS2DObject(el);
      label.position.set(-this.radiusScale(maxTurns) - 3, 0, this.levelZ(index));
      label.center.set(1, 0.5);
      this.scene.add(label);
    });

    // Columnas de época: un mismo año alinea todos los niveles
    const zMin = this.levelZ(0) - 2.5;
    const zMax = this.levelZ(CATEGORIES.length - 1) + 2.5;
    ERAS.slice(1).forEach(era => {
      const p = this.historicalTo3D(era.año, 0);
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p.x, p.y, zMin), new THREE.Vector3(p.x, p.y, zMax)
      ]);
      const col = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color: 0xf3eee4, dashSize: 0.6, gapSize: 0.6, transparent: true, opacity: 0.22, depthWrite: false
      }));
      col.computeLineDistances();
      this.scene.add(col);

      const el = document.createElement('div');
      el.className = 'era-label';
      el.textContent = era.etiqueta;
      const label = new CSS2DObject(el);
      label.position.set(p.x, p.y, zMin - 1.2);
      this.scene.add(label);
    });
  }

  // ───────────────────────────── Nodos ─────────────────────────────
  /**
   * Crea un nodo con shader luminoso, halo aditivo y etiqueta.
   * @param {object} eventData  Evento de data.js
   * @param {number} impact     N.º de conexiones (entrantes + salientes)
   */
  addNodeWithShader(eventData, impact = 0) {
    const cat = this.categoryById.get(eventData.categoria);
    const pos = this.historicalTo3D(eventData.año, cat.index);
    const r = this.nodeSizeScale(eventData.importancia);
    const color = this.categoryColor(eventData.categoria);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        phase: { value: Math.random() * Math.PI * 2 },
        pulseAmount: { value: prefersReducedMotion ? 0 : 0.12 },
        baseColor: { value: color },
        intensity: { value: this.intensityScale(impact) },
        highlight: { value: 0 },
        dimmed: { value: 0 }
      }
    });

    const mesh = new THREE.Mesh(geometryForShape(cat.forma, r), material);
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.userData = { ...eventData, impacto: impact, radio: r, shaderUniforms: material.uniforms };
    this.scene.add(mesh);
    this.nodes.push(mesh);

    // Halo luminoso: sprite aditivo cuyo brillo depende del impacto causal
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture,
      color,
      transparent: true,
      opacity: 0.45 + Math.min(impact, 10) * 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    const glowSize = r * (5 + Math.min(impact, 10) * 0.35);
    glow.scale.set(glowSize, glowSize, 1);
    glow.position.copy(pos);
    this.scene.add(glow);
    mesh.userData.glow = glow;
    mesh.userData.glowBase = glow.material.opacity;

    // Anillo para los personajes con los que se puede conversar
    if (eventData.personaje) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r * 1.9, 0.06, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xf3eee4, transparent: true, opacity: 0.75 })
      );
      ring.position.copy(pos);
      ring.rotation.x = Math.PI / 2.6;
      this.scene.add(ring);
      mesh.userData.ring = ring;
    }

    // Esfera invisible más grande para que el hover sea cómodo
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(r * 1.8, 1.1), 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.copy(pos);
    hit.userData.node = mesh;
    this.scene.add(hit);
    this.hitTargets.push(hit);

    // Etiqueta con nombre y año (aparece al acercarse)
    const el = document.createElement('div');
    el.className = 'node-label';
    el.style.setProperty('--cat', cat.color);
    el.innerHTML = `<span class="node-label-name"></span><span class="node-label-year"></span>`;
    el.querySelector('.node-label-name').textContent = eventData.nombre;
    el.querySelector('.node-label-year').textContent = eventData.fecha_texto || eventData.año;
    const label = new CSS2DObject(el);
    label.position.set(pos.x, pos.y, pos.z + r * 1.6 + 0.6);
    label.center.set(0.5, 1);
    this.scene.add(label);
    mesh.userData.label = label;

    return mesh;
  }

  findNode(id) {
    return this.nodes.find(n => n.userData.id === id) || null;
  }

  // ──────────────────────── Interacción (mouse) ────────────────────────
  setupPointer() {
    const canvas = this.renderer.domElement;
    let down = null;

    canvas.addEventListener('pointermove', (event) => {
      this.lastPointerEvent = event;
      this.pointerDirty = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.setHovered(null, null);
    });
    canvas.addEventListener('pointerdown', (event) => {
      down = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 5 || event.button !== 0) return; // fue un arrastre, no un clic
      const node = this.pick(event);
      if (node) {
        this.select(node);
        this.onNodeClick?.(node.userData);
      }
    });
    canvas.addEventListener('dblclick', (event) => {
      const node = this.pick(event);
      if (node) this.focusNode(node);
    });
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitTargets.filter(h => h.userData.node.visible), false);
    return hits.length ? hits[0].object.userData.node : null;
  }

  setHovered(node, event) {
    if (this.hovered === node) {
      if (node) this.onNodeHover?.(node.userData, event);
      return;
    }
    if (this.hovered && this.hovered !== this.selected) {
      this.hovered.userData.shaderUniforms.highlight.value = 0;
    }
    this.hovered = node;
    if (node) node.userData.shaderUniforms.highlight.value = 1;
    this.renderer.domElement.style.cursor = node ? 'pointer' : 'grab';
    this.onNodeHover?.(node ? node.userData : null, event);
  }

  select(node) {
    if (this.selected && this.selected !== node) {
      this.selected.userData.shaderUniforms.highlight.value = 0;
    }
    this.selected = node;
    if (node) node.userData.shaderUniforms.highlight.value = 1;
  }

  // ─────────────────────────── Cámara ───────────────────────────
  flyTo(position, target, duration = 1100) {
    this.flight = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: position.clone(),
      toTarget: target.clone(),
      start: performance.now(),
      duration: prefersReducedMotion ? 1 : duration
    };
  }

  focusNode(node, distance = 22) {
    // Se acerca al nodo manteniendo la dirección de vista actual
    const target = node.position.clone();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.flyTo(target.clone().add(dir.multiplyScalar(distance)), target);
  }

  resetView() {
    this.flyTo(this.homePosition, this.homeTarget);
  }

  updateFlight(now) {
    if (!this.flight) return;
    const f = this.flight;
    const t = Math.min(1, (now - f.start) / f.duration);
    const k = d3.easeCubicInOut(t);
    this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
    this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    if (t >= 1) this.flight = null;
  }

  // Muestra las etiquetas solo de los nodos cercanos a la cámara
  updateLabels() {
    this.nodes.forEach(node => {
      const d = node.position.distanceTo(this.camera.position);
      const near = d < 42;
      const show = node.visible && (near || node === this.hovered || node === this.selected);
      const el = node.userData.label.element;
      el.classList.toggle('is-visible', show);
      el.style.opacity = show ? String(near ? Math.min(1, (42 - d) / 10 + 0.35) : 1) : '0';
    });
  }

  onResize() {
    const { width, height } = this.size();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
  }

  // ───────────────────────── Bucle de render ─────────────────────────
  animate() {
    const now = performance.now();
    const time = now * 0.001;
    const delta = this.clock.getDelta();

    this.updateFlight(now);
    this.controls.update();

    if (this.pointerDirty && this.lastPointerEvent) {
      this.pointerDirty = false;
      this.setHovered(this.pick(this.lastPointerEvent), this.lastPointerEvent);
    }

    this.nodes.forEach(node => {
      const u = node.userData;
      u.shaderUniforms.time.value = time;
      if (!prefersReducedMotion) {
        node.rotation.z += delta * 0.25;
        if (u.ring) u.ring.rotation.z += delta * 0.6;
      }
      const boost = node === this.hovered || node === this.selected ? 1.6 : 1;
      u.glow.material.opacity = u.glowBase * boost * (1 - u.shaderUniforms.dimmed.value * 0.8);
    });

    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
