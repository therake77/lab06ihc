// constellation.js — Escena 3D: espiral temporal, nodos luminosos, conexiones y navegación
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as d3 from 'd3';
import { CATEGORIES, ERAS } from './data.js';

// ───────────────────────────── Shaders ─────────────────────────────
// Nodos: pulso luminoso (basado en el shader de la guía) + borde brillante
// calculado con la normal en espacio de vista.
const nodeVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const nodeFragmentShader = /* glsl */ `
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

    vec3 color = baseColor * intensity * pulse * (0.6 + 0.4 * facing);
    color += mix(baseColor, vec3(1.0), 0.35) * rim * (0.8 + highlight);
    // Centro casi blanco, como una estrella caliente
    color += mix(baseColor, vec3(1.0), 0.6) * pow(facing, 5.0) * (0.35 + 0.35 * highlight);
    color += vec3(1.0) * highlight * 0.18;
    color *= mix(1.0, 0.22, dimmed);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

// Conexiones: tubo a lo largo de una curva Bézier. vUv.x recorre la curva
// de 0 (origen) a 1 (destino); los pulsos viajan en el sentido de la influencia.
const linkVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const linkFragmentShader = /* glsl */ `
  uniform float time;
  uniform float phase;
  uniform float speed;
  uniform float opacity;
  uniform float emphasis;
  uniform vec3 colorA;
  uniform vec3 colorB;
  varying vec2 vUv;

  void main() {
    float t = vUv.x;
    vec3 color = mix(colorA, colorB, t);

    // Dos pulsos que avanzan del origen al destino
    float flow = fract(t * 2.0 - time * speed + phase);
    float pulse = smoothstep(0.0, 0.06, flow) * (1.0 - smoothstep(0.06, 0.42, flow));

    float alpha = (0.32 + 0.25 * emphasis + pulse * 0.85) * opacity;
    // Extremos suaves para que la curva "nazca" del nodo
    alpha *= smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.95, 1.0, t));

    gl_FragColor = vec4(color * (0.75 + pulse * 0.9 + emphasis * 0.3), alpha);
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

// Destello de estrella de 4 puntas: núcleo brillante + dos rayos finos cruzados
function createStarTexture() {
  const size = 256;
  const c = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'lighter';

  // Núcleo
  const core = ctx.createRadialGradient(c, c, 0, c, c, c);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.05, 'rgba(255,255,255,0.95)');
  core.addColorStop(0.14, 'rgba(255,255,255,0.4)');
  core.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  // Rayos: rombos muy delgados que se desvanecen hacia las puntas
  const spike = (angle, width, alpha) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(-c, 0, c, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.15, `rgba(255,255,255,${0.1 * alpha})`);
    g.addColorStop(0.38, `rgba(255,255,255,${0.45 * alpha})`);
    g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.62, `rgba(255,255,255,${0.45 * alpha})`);
    g.addColorStop(0.85, `rgba(255,255,255,${0.1 * alpha})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-c, 0);
    ctx.quadraticCurveTo(0, -width, c, 0);
    ctx.quadraticCurveTo(0, width, -c, 0);
    ctx.fill();
    ctx.restore();
  };
  spike(0, size * 0.04, 1);
  spike(Math.PI / 2, size * 0.04, 1);

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

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Revelado por profundidad: altura de la cámara sobre un nivel → visibilidad (0–1)
const REVEAL_FULL = 28;   // a esta altura o menos, el nivel se ve completo
const REVEAL_NONE = 54;   // a esta altura o más, sus conexiones no se ven
// Revelado por cercanía (como en la guía): distancia al nodo de origen
const PROXIMITY_RANGE = 28;

export class ConstellationSpiral {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    const { width, height } = this.size();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x140f24, 0.0058);

    // El eje Z separa los niveles; la cámara usa Z como "arriba" al orbitar
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    // Renderer HTML para etiquetas de nombres, años y niveles
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.className = 'label-layer';
    this.container.appendChild(this.labelRenderer.domElement);

    this.nodes = [];          // Mallas visibles de los nodos
    this.hitTargets = [];     // Esferas invisibles para detectar el mouse con margen
    this.connections = [];    // Conexiones causales
    this.levelGuides = [];    // Espiral guía de cada nivel
    this.levelLabels = [];    // Etiquetas 3D de nivel (vista lateral)
    this.eraLabels = [];      // Años que marcan cada época (vista superior)
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.glowTexture = createGlowTexture();
    this.starTexture = createStarTexture();
    this.clock = new THREE.Clock();
    this.viewDir = new THREE.Vector3();

    this.hovered = null;
    this.selected = null;
    this.flight = null;
    this.showAllConnections = false;
    this.focusLevel = null;   // nivel aislado desde la leyenda
    this.depthWeight = 1;     // 1 = mirando de arriba hacia abajo; 0 = de costado
    this.onNodeHover = null;  // callback(nodeData | null, event)
    this.onNodeClick = null;  // callback(nodeData)

    this.setupScales();
    this.computeViews();
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
    this.maxTurns = ERAS[ERAS.length - 1].vuelta;
    this.radiusScale = d3.scaleLinear().domain([0, this.maxTurns]).range([5, 34]);

    // Importancia (1–10) → radio del nodo
    this.nodeSizeScale = d3.scaleLinear().domain([1, 10]).range([0.45, 1.35]);

    // Impacto causal (n.º de conexiones) → intensidad luminosa
    this.intensityScale = d3.scaleSqrt().domain([0, 12]).range([0.95, 1.75]).clamp(true);

    this.categoryById = new Map(CATEGORIES.map((c, i) => [c.id, { ...c, index: i }]));
    this.levelGap = 20;
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

  get topZ() { return this.levelZ(CATEGORIES.length - 1); }
  get bottomZ() { return this.levelZ(0); }

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

  // ─────────────────────── Vistas de cámara ───────────────────────
  computeViews() {
    const { width, height } = this.size();
    // En pantallas angostas (celular) la cámara se aleja para que entre la espiral
    const fit = Math.min(1.9, Math.max(1, 0.95 / (width / height)));
    this.views = {
      // Superior: la espiral de frente; la rueda desciende por el eje Z
      superior: {
        position: new THREE.Vector3(0, -0.01, this.topZ + 82 * fit),
        target: new THREE.Vector3(0, 0, this.bottomZ - 8)
      },
      // Lateral: los niveles se ven como pisos
      lateral: {
        position: new THREE.Vector3(0, -112, 64).multiplyScalar(fit),
        target: new THREE.Vector3(0, 0, -4)
      }
    };
  }

  setView(name, duration = 1300) {
    const view = this.views[name];
    if (!view) return;
    this.viewName = name;
    this.flyTo(view.position, view.target, duration);
  }

  /**
   * Aísla un nivel: atenúa los demás y muestra solo las conexiones que lo tocan.
   * @param {number|null} index  Índice del nivel o null para mostrar todos
   */
  setFocusLevel(index) {
    this.focusLevel = index;
  }

  // ─────────────────────── Escena y navegación ───────────────────────
  setupLighting() {
    this.scene.add(new THREE.AmbientLight(0x6a5f8a, 0.6));
    const point = new THREE.PointLight(0xfff1d6, 1.2, 0, 0);
    point.position.set(0, 0, 40);
    this.scene.add(point);
  }

  setupControls() {
    // OrbitControls: rotar (arrastrar), zoom hacia el cursor (rueda),
    // desplazar (clic derecho o flechas)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 220;
    this.controls.zoomSpeed = 0.9;
    this.controls.listenToKeyEvents(window);

    // Animación de entrada: desciende desde lejos hasta la vista superior
    const home = this.views.superior;
    this.viewName = 'superior';
    if (prefersReducedMotion) {
      this.camera.position.copy(home.position);
    } else {
      this.camera.position.copy(home.position).setZ(home.position.z + 120);
      this.flyTo(home.position, home.target, 2400);
    }
    this.controls.target.copy(home.target);
    this.controls.update();
    this.controls.addEventListener('start', () => { this.flight = null; });
  }

  buildBackdrop() {
    // Polvo de estrellas tenue para dar profundidad
    const count = 1600;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 160 + Math.random() * 240;
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
    const samples = 700;

    CATEGORIES.forEach((cat, index) => {
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        const turns = (i / samples) * this.maxTurns;
        const angle = turns * 2 * Math.PI - Math.PI / 2;
        const r = this.radiusScale(turns);
        pts.push(new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), this.levelZ(index)));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: cat.color, transparent: true, opacity: 0.16, depthWrite: false })
      );
      this.scene.add(line);
      this.levelGuides.push(line);

      // Etiqueta 3D del nivel (solo se muestra en la vista lateral)
      const el = document.createElement('div');
      el.className = 'level-label';
      el.style.setProperty('--cat', cat.color);
      el.textContent = cat.nombre;
      const label = new CSS2DObject(el);
      label.position.set(this.radiusScale(this.maxTurns) + 3, 0, this.levelZ(index));
      label.center.set(0, 0.5);
      this.scene.add(label);
      this.levelLabels.push(label);
    });

    // Columnas de época: un mismo año alinea todos los niveles
    const zMin = this.bottomZ - 3;
    const zMax = this.topZ + 3;
    ERAS.slice(1).forEach(era => {
      const p = this.historicalTo3D(era.año, 0);
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p.x, p.y, zMin), new THREE.Vector3(p.x, p.y, zMax)
      ]);
      const col = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color: 0xf3eee4, dashSize: 0.6, gapSize: 0.6, transparent: true, opacity: 0.2, depthWrite: false
      }));
      col.computeLineDistances();
      this.scene.add(col);

      // El año se rotula en el nivel superior, el primero que ve la cámara
      const el = document.createElement('div');
      el.className = 'era-label';
      el.textContent = era.etiqueta;
      const label = new CSS2DObject(el);
      label.position.set(p.x, p.y - 1.5, zMax);
      label.center.set(0.5, 0);
      this.scene.add(label);
      this.eraLabels.push(label);
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
      vertexShader: nodeVertexShader,
      fragmentShader: nodeFragmentShader,
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
    mesh.userData = { ...eventData, impacto: impact, radio: r, nivel: cat.index, shaderUniforms: material.uniforms };
    this.scene.add(mesh);
    this.nodes.push(mesh);

    // Halo luminoso: sprite aditivo cuyo brillo depende del impacto causal
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture,
      color,
      transparent: true,
      opacity: 0.55 + Math.min(impact, 10) * 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    const glowSize = r * (5 + Math.min(impact, 10) * 0.35);
    glow.scale.set(glowSize, glowSize, 1);
    glow.position.copy(pos);
    this.scene.add(glow);
    mesh.userData.glow = glow;
    mesh.userData.glowBase = glow.material.opacity;

    // Destello de 4 puntas: crece y brilla más al pasar el mouse o seleccionar
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.starTexture,
      color: color.clone().lerp(new THREE.Color(0xffffff), 0.4),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false   // las estrellas brillan aunque estén en un nivel profundo
    }));
    flare.position.copy(pos);
    flare.renderOrder = 2;
    this.scene.add(flare);
    mesh.userData.flare = flare;
    mesh.userData.flareBase = r * 8 * (1 + Math.min(impact, 10) * 0.05);
    mesh.userData.flareLevel = 0;   // 0 normal, 1 hover, 2 seleccionado (suavizado)

    // Anillo para los personajes con los que se puede conversar
    if (eventData.personaje) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r * 1.9, 0.06, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xf3eee4, transparent: true, opacity: 0.75 })
      );
      ring.position.copy(pos);
      ring.rotation.x = Math.PI / 5;
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
    label.position.copy(pos);
    label.center.set(0.5, 1);
    el.style.paddingBottom = `${Math.round(14 + r * 10)}px`;
    this.scene.add(label);
    mesh.userData.label = label;

    return mesh;
  }

  findNode(id) {
    return this.nodes.find(n => n.userData.id === id) || null;
  }

  // ─────────────────────── Conexiones causales ───────────────────────
  /**
   * Crea una curva Bézier animada por cada conexión definida en data.js.
   * @param {Map<string, string[]>} outgoing  id de origen → ids de destino válidos
   */
  addCausalConnections(outgoing) {
    outgoing.forEach((targets, sourceId) => {
      const sourceNode = this.findNode(sourceId);
      targets.forEach(targetId => {
        const targetNode = this.findNode(targetId);
        if (!sourceNode || !targetNode) return;

        const curve = this.createConnectionCurve(sourceNode, targetNode);
        const material = new THREE.ShaderMaterial({
          vertexShader: linkVertexShader,
          fragmentShader: linkFragmentShader,
          uniforms: {
            time: { value: 0 },
            phase: { value: Math.random() },
            speed: { value: prefersReducedMotion ? 0 : 0.32 },
            opacity: { value: 0 },
            emphasis: { value: 0 },
            colorA: { value: sourceNode.userData.shaderUniforms.baseColor.value },
            colorB: { value: targetNode.userData.shaderUniforms.baseColor.value }
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        // Tubo delgado: linewidth no tiene efecto en WebGL, así que la curva se dibuja como malla
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.09, 6, false), material);
        mesh.visible = false;
        this.scene.add(mesh);

        this.connections.push({
          source: sourceNode,
          target: targetNode,
          mesh,
          uniforms: material.uniforms,
          upperLevel: Math.max(sourceNode.userData.nivel, targetNode.userData.nivel),
          opacity: 0
        });
      });
    });
  }

  createConnectionCurve(nodeA, nodeB) {
    const start = nodeA.position.clone();
    const end = nodeB.position.clone();
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const length = start.distanceTo(end);

    // Punto de control: se curva hacia afuera de la espiral (visible desde arriba)
    // y se eleva en Z (visible de costado), como el arco de la guía
    const perp = new THREE.Vector3(-(end.y - start.y), end.x - start.x, 0);
    if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
    perp.normalize();
    if (perp.x * mid.x + perp.y * mid.y < 0) perp.negate();
    const control = mid.clone()
      .add(perp.multiplyScalar(length * 0.22))
      .add(new THREE.Vector3(0, 0, 3 + length * 0.06));

    return new THREE.QuadraticBezierCurve3(start, control, end);
  }

  // Visibilidad de un nivel según la altura de la cámara sobre él (vista superior)
  levelReveal(index) {
    const h = this.camera.position.z - this.levelZ(index);
    if (h <= 0) return 0; // la cámara ya pasó este nivel
    return smoothstep(0, 4, h) * (1 - smoothstep(REVEAL_FULL, REVEAL_NONE, h));
  }

  /**
   * Revela las conexiones según el zoom: más cerca = más visible.
   * - Vista superior: cuenta la altura de la cámara sobre el nivel de la conexión,
   *   así que al descender con la rueda aparecen nivel por nivel.
   * - Cualquier vista: cuenta también la distancia al nodo de origen (como en la guía).
   */
  updateConnectionsByZoom(delta = 1 / 60) {
    // Suavizado independiente de los FPS
    const ease = 1 - Math.exp(-delta * 7);
    const levelReveals = CATEGORIES.map((_, i) => this.levelReveal(i));
    const sel = this.selected;

    this.connections.forEach(conn => {
      const depth = this.depthWeight * levelReveals[conn.upperLevel];
      const dist = conn.source.position.distanceTo(this.camera.position);
      const proximity = smoothstep(PROXIMITY_RANGE, PROXIMITY_RANGE - 12, dist);
      let target = Math.max(depth, proximity);

      if (this.showAllConnections) target = 1;
      if (this.focusLevel !== null) {
        const inLevel = conn.source.userData.nivel === this.focusLevel || conn.target.userData.nivel === this.focusLevel;
        target = inLevel ? 1 : 0;
      }
      const related = sel && (conn.source === sel || conn.target === sel);
      if (sel) target = related ? 1 : target * 0.25;

      conn.opacity += (target - conn.opacity) * ease;
      conn.uniforms.opacity.value = conn.opacity;
      conn.uniforms.emphasis.value = related ? 1 : 0;
      conn.mesh.visible = conn.opacity > 0.01;
    });

    // Las espirales guía también se encienden al acercarse a su nivel
    this.levelGuides.forEach((line, i) => {
      line.material.opacity = this.focusLevel === null
        ? 0.12 + 0.3 * this.depthWeight * levelReveals[i]
        : (i === this.focusLevel ? 0.45 : 0.05);
    });
    this.levelReveals = levelReveals;
  }

  // Resalta el nodo seleccionado y sus vecinos; atenúa el resto
  updateDimming(delta = 1 / 60) {
    const ease = 1 - Math.exp(-delta * 8);
    const sel = this.selected;
    let neighbors = null;
    if (sel) {
      neighbors = new Set([sel]);
      this.connections.forEach(c => {
        if (c.source === sel) neighbors.add(c.target);
        if (c.target === sel) neighbors.add(c.source);
      });
    }
    this.nodes.forEach(node => {
      const u = node.userData.shaderUniforms;
      const outOfFocus = this.focusLevel !== null && node.userData.nivel !== this.focusLevel;
      const goal = outOfFocus || (neighbors && !neighbors.has(node)) ? 1 : 0;
      u.dimmed.value += (goal - u.dimmed.value) * ease;
    });
  }

  setShowAllConnections(value) {
    this.showAllConnections = value;
  }

  /** Estado de profundidad para el indicador de niveles de la interfaz. */
  getDepthState() {
    return {
      weight: this.depthWeight,
      // Posición de la cámara en "niveles": 0 = nivel superior, 4 = inferior
      levelPosition: (this.topZ - this.camera.position.z) / this.levelGap,
      reveals: this.levelReveals || CATEGORIES.map(() => 0)
    };
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
    const pickable = this.hitTargets.filter(h => this.focusLevel === null || h.userData.node.userData.nivel === this.focusLevel);
    const hits = this.raycaster.intersectObjects(pickable, false);
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

  focusNode(node, distance = 24) {
    // Se acerca al nodo manteniendo la dirección de vista actual
    const target = node.position.clone();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.flyTo(target.clone().add(dir.multiplyScalar(distance)), target);
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
      const near = d < 44;
      const show = node.visible && (near || node === this.hovered || node === this.selected);
      const el = node.userData.label.element;
      el.style.opacity = show ? String(near ? Math.min(1, (44 - d) / 10 + 0.35) : 1) : '0';
    });
    // Las etiquetas 3D de nivel solo tienen sentido de costado
    const lateral = 1 - this.depthWeight;
    this.levelLabels.forEach(label => {
      label.element.style.opacity = String(lateral);
    });
    // Los años se leen como una regla radial desde arriba; de costado se encimarían
    this.eraLabels.forEach(label => {
      label.element.style.opacity = String(this.depthWeight);
    });
  }

  onResize() {
    const { width, height } = this.size();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
    this.computeViews();
  }

  // ───────────────────────── Bucle de render ─────────────────────────
  animate() {
    const now = performance.now();
    const time = now * 0.001;
    const delta = this.clock.getDelta();

    this.updateFlight(now);
    this.controls.update();

    // ¿Cuánto mira la cámara hacia abajo? (1 = vista superior, 0 = de costado)
    this.camera.getWorldDirection(this.viewDir);
    this.depthWeight = smoothstep(0.55, 0.9, -this.viewDir.z);

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
      const dim = u.shaderUniforms.dimmed.value;
      const boost = node === this.hovered || node === this.selected ? 1.6 : 1;
      u.glow.material.opacity = u.glowBase * boost * (1 - dim * 0.8);

      // Destello: nivel 0 normal, 1 con el mouse encima, 2 seleccionado
      const goal = node === this.selected ? 2 : node === this.hovered ? 1 : 0;
      u.flareLevel += (goal - u.flareLevel) * (1 - Math.exp(-Math.min(delta, 0.1) * 10));
      const phase = u.shaderUniforms.phase.value;
      const twinkle = prefersReducedMotion ? 1 : 1 + 0.07 * Math.sin(time * 3 + phase) + 0.04 * u.flareLevel * Math.sin(time * 5);
      // De cerca, el destello no crece tanto en pantalla
      const distance = node.position.distanceTo(this.camera.position);
      const nearFactor = Math.min(1, Math.max(0.35, distance / 70));
      const size = u.flareBase * (1 + 0.6 * u.flareLevel) * twinkle * nearFactor;
      u.flare.scale.set(size, size, 1);
      u.flare.material.opacity = Math.min(1, 0.9 + 0.1 * u.flareLevel) * (1 - dim * 0.9);
      if (!prefersReducedMotion) u.flare.material.rotation = 0.12 * Math.sin(time * 0.6 + phase);
    });
    this.connections.forEach(c => { c.uniforms.time.value = time; });

    this.updateConnectionsByZoom(Math.min(delta, 0.1));
    this.updateDimming(Math.min(delta, 0.1));
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
