# Constelación Chef en el Aire

Laboratorio 06 de CC451 Interacción Humano Computadora (UNI, 2026-2): **Constelaciones Históricas 3D** con D3.js, WebGL (Three.js) y la API de Gemini.

La aplicación muestra, como una espiral 3D, cómo han seguido las personas una receta mientras cocinan: desde el recetario romano atribuido a Apicio hasta **Chef en el Aire**, nuestra app para cocinar sin tocar la pantalla con gestos en el aire, voz y un LLM que adapta cada receta.

## Cómo se lee la espiral

| Elemento | Qué representa |
|---|---|
| Plano X-Y (espiral) | El tiempo. Cada vuelta es una época: año 0–1300, 1300–1800, 1800–1900, 1900–1960, 1960–2000 y 2000–2026. La escala es no lineal (`d3.scaleLinear` por tramos) para dar más espacio a las épocas con más eventos. |
| Eje Z (niveles) | La categoría. Los 5 niveles comparten el mismo eje de tiempo, así que un mismo año cae en el mismo punto de la espiral en todos los niveles. |
| Color **y forma** del nodo | La categoría. La forma evita depender solo del color (criterio de accesibilidad). |
| Tamaño del nodo | Importancia del evento (1–10). |
| Brillo y halo | Impacto causal: número de conexiones que entran y salen del nodo. |
| Anillo alrededor del nodo | Personaje histórico. |

| Nivel | Forma | Ejemplos |
|---|---|---|
| Gastronomía | Esfera | Apicio, Carême, Escoffier, Mistura |
| Medios de receta | Cubo | Le Viandier, primer libro impreso, Fannie Farmer, Julia Child, apps |
| Tecnología de cocina | Octaedro | Termostato de horno, smartphone, tablet, LLM |
| Interacción manos libres | Tetraedro | Put-That-There, Kinect, asistentes de voz, MediaPipe Hands, Chef en el Aire |
| Accesibilidad | Dodecaedro | Braille, OXO Good Grips, VoiceOver, Ley 29973, WCAG 2.2 |

## Requisitos

- Navegador actualizado con soporte para WebGL (Chrome, Edge o Firefox).
- Conexión a internet para cargar las librerías desde el CDN.
- Node.js o Python para levantar el servidor local.

## Cómo ejecutarlo

Los módulos ES no cargan si se abre `index.html` con doble clic, así que se necesita un servidor local. Cualquiera de estas opciones funciona desde la carpeta del proyecto:

```bash
# Opción 1: Node.js
npx serve .

# Opción 2: Python
python -m http.server 8000
```

Luego abre en el navegador la dirección que indique el comando (por ejemplo, `http://localhost:8000`). En VS Code también sirve la extensión **Live Server** (clic derecho en `index.html` → *Open with Live Server*).

Three.js y D3 se cargan desde un CDN mediante un *import map*, así que no hace falta `npm install`.

## Controles

| Acción | Resultado |
|---|---|
| Arrastrar con clic izquierdo | Rotar la constelación |
| Rueda del mouse | Acercar o alejar |
| Clic derecho + arrastrar (o flechas del teclado) | Desplazar |
| Pasar el mouse sobre un nodo | Tooltip con año, categoría, resumen y datos clave |
| Clic en un nodo | Panel con el detalle y sus conexiones |
| Doble clic en un nodo | Acercar la cámara a ese nodo |
| Botón **Vista general** | Volver a la vista inicial |
| `Esc` | Cerrar el panel |

## Estructura

```
constelaciones-chef-en-el-aire/
├── index.html            # Estructura de la interfaz e import map
├── css/styles.css        # Estilos
├── js/
│   ├── main.js           # Integra la escena con la interfaz (tooltip, panel, leyenda)
│   ├── constellation.js  # Escena 3D: espiral, nodos con shader, OrbitControls, etiquetas
│   └── data.js           # Categorías, épocas y eventos
└── screenshots/          # Capturas para el informe
```

## Tecnologías

| Tecnología | Uso |
|---|---|
| Three.js 0.170 (WebGL) | Escena 3D, nodos con `ShaderMaterial`, halos con sprites aditivos, `OrbitControls` y etiquetas con `CSS2DRenderer` |
| D3.js 7.9 | Escalas de datos: año → posición en la espiral, importancia → tamaño, impacto → brillo; curvas de animación de la cámara |
| HTML, CSS y JavaScript (módulos ES) | Interfaz: leyenda, tooltip y panel de detalle |
