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
| Curva entre dos nodos | Conexión causal. Los pulsos de luz viajan del evento que influyó al evento influido y el color pasa del de una categoría al de la otra. |

| Nivel | Forma | Ejemplos |
|---|---|---|
| Gastronomía | Esfera | Apicio, Carême, Escoffier, Mistura |
| Medios de receta | Cubo | Le Viandier, primer libro impreso, Fannie Farmer, Julia Child, apps |
| Tecnología de cocina | Octaedro | Termostato de horno, smartphone, tablet, LLM |
| Interacción manos libres | Tetraedro | Put-That-There, Kinect, asistentes de voz, MediaPipe Hands, Chef en el Aire |
| Accesibilidad | Dodecaedro | Braille, OXO Good Grips, VoiceOver, Ley 29973, WCAG 2.2 |

## Vistas y conexiones causales

- **Vista superior (inicial):** la espiral se ve de frente. La rueda del mouse acerca la cámara a lo largo del eje Z y la hace atravesar los niveles uno a uno. Las conexiones de cada nivel se revelan a medida que la cámara se acerca a su altura (más cerca = más visible) y las de los niveles inferiores empiezan a notarse antes de llegar a ellos. La marca de la leyenda indica sobre qué nivel está la cámara.
- **Vista lateral:** los niveles se ven como pisos apilados, lo que permite comparar en qué época ocurre cada evento en cada categoría.
- En cualquier vista, las conexiones también aparecen al acercarse a su nodo de origen.
- **Todas las conexiones:** muestra las 27 conexiones a la vez, sin importar el zoom.
- **Clic en un nodo:** resalta sus conexiones y atenúa los nodos no relacionados.
- **Clic en un nivel de la leyenda:** muestra solo ese nivel y sus conexiones.

## Requisitos

- Node.js 18 o superior (para el servidor local incluido).
- Navegador actualizado con soporte para WebGL (Chrome, Edge o Firefox).
- Conexión a internet: las librerías se cargan desde un CDN y el chat usa la API de Gemini.
- Una API key de Gemini, que se genera gratis en [Google AI Studio](https://aistudio.google.com/apikey).

## Cómo ejecutarlo

1. Crea el archivo `.env` en la carpeta del proyecto a partir de `.env.example` y pega tu API key:

   ```
   GEMINI_API_KEY=tu_api_key
   ```

2. Inicia el servidor local desde la carpeta del proyecto:

   ```bash
   node server.js
   # o bien: npm start
   ```

3. Abre `http://localhost:8000` en el navegador.

`server.js` no tiene dependencias, así que no hace falta `npm install`. Sirve los archivos del proyecto, nunca entrega archivos ocultos como `.env` y genera `js/config.js` con la API key leída de `.env`.

**Alternativa sin Node.js:** copia `js/config.example.js` como `js/config.js`, pega la API key y levanta cualquier servidor estático, por ejemplo `python -m http.server 8000`. Si no hay key configurada, el panel de chat permite pegarla y la guarda solo durante la sesión de esa pestaña.

Los archivos `.env` y `js/config.js` están en `.gitignore` para que la key no se suba al repositorio.

## Conversación con personajes (Gemini)

Al hacer clic en un nodo con anillo se abre un chat con ese personaje. Gemini responde como el personaje gracias a un *system prompt* definido en `data.js` (`prompt_personaje`), que fija:

- su contexto y su **límite de conocimiento** (fecha);
- entre 6 y 7 **reglas de comportamiento**;
- su **estilo de comunicación**;
- la lista de **conceptos que no conoce** (por ejemplo, Escoffier no conoce el microondas);
- el formato de respuesta (máximo 120 palabras).

| Personaje | Momento | Nivel |
|---|---|---|
| Marco Gavio Apicio | Roma, año 30 d. C. | Gastronomía |
| Antonin Carême | París, otoño de 1832 | Gastronomía |
| Auguste Escoffier | Londres, 1903 | Gastronomía |
| Fannie Farmer | Boston, 1896 | Medios de receta |
| Julia Child | Boston, 1963 | Medios de receta |

Detalles de la integración (`js/llm-client.js`):

- **Memoria:** cada personaje conserva su propio historial (hasta 10 intercambios), que se envía en cada llamada. El botón ↻ reinicia la conversación.
- **Temperatura:** se ajusta con el control deslizante del panel (de 0.0 a 2.0, por defecto 1.0) o escribiendo `/temp 0.5` en el chat. Se aplica a las respuestas siguientes, y cada respuesta indica con qué temperatura y modelo se generó.
- **Lectura en voz alta (TTS):** cada respuesta tiene un botón **Escuchar**, y el botón con el altavoz del encabezado lee automáticamente las respuestas nuevas. Usa la Web Speech API del navegador (sin costo ni API key), prefiere una voz en español y asigna a cada personaje su propio tono y velocidad (campo `voz` en `data.js`). Encaja con el objetivo de Chef en el Aire: seguir la conversación sin mirar ni tocar la pantalla.
- **Modelo:** con `GEMINI_MODEL=auto` (valor por defecto), la app consulta los modelos disponibles para la key y elige el Gemini Flash-Lite estable más reciente, que es el de mayor cuota en el plan gratuito. Si se agota su cuota diaria, cambia a otro modelo disponible y lo avisa en el chat. El modelo en uso se muestra al pie del panel.
- **Plan gratuito:** el saludo de cada personaje es fijo para no gastar solicitudes; el pensamiento del modelo se limita al mínimo para ahorrar tokens; y el envío se bloquea mientras se espera una respuesta.
- **Manejo de errores:** mensajes claros para API key inválida, límite por minuto o cuota diaria agotada (con el tiempo de espera que indica la API), modelo no disponible, falta de conexión, respuestas bloqueadas por filtros y respuestas vacías. Los errores recuperables muestran un botón **Reintentar**.

## Controles

| Acción | Resultado |
|---|---|
| Arrastrar con clic izquierdo | Rotar la constelación |
| Rueda del mouse | Acercar o alejar hacia el punto del cursor |
| Clic derecho + arrastrar (o flechas del teclado) | Desplazar |
| Pasar el mouse sobre un nodo | Tooltip con año, categoría, resumen y datos clave |
| Clic en un nodo | Panel con el detalle y sus conexiones; si es un personaje, abre el chat |
| Doble clic en un nodo | Acercar la cámara a ese nodo |
| Botones **Superior** y **Lateral** | Cambiar de vista; un clic en la vista activa la restablece |
| Botón **Todas las conexiones** | Mostrar u ocultar todas las conexiones a la vez |
| Clic en un nivel de la leyenda | Mostrar solo ese nivel; otro clic muestra todos |
| `Enter` / `Shift + Enter` en el chat | Enviar la pregunta / nueva línea |
| Control **Temperatura** o `/temp 0.5` en el chat | Cambiar la temperatura de las siguientes respuestas |
| Botón **Escuchar** o altavoz del encabezado del chat | Leer una respuesta o todas las nuevas en voz alta |
| `Esc` | Cerrar el chat o el panel |

## Estructura

```
constelaciones-chef-en-el-aire/
├── index.html            # Estructura de la interfaz e import map
├── server.js             # Servidor local: sirve el proyecto y lee la API key de .env
├── package.json          # Script "npm start" (sin dependencias)
├── .env.example          # Plantilla del archivo .env
├── css/styles.css        # Estilos
├── js/
│   ├── main.js           # Integra la escena con la interfaz (tooltip, paneles, leyenda, controles)
│   ├── constellation.js  # Escena 3D: espiral, nodos, conexiones, cámara y revelado por zoom
│   ├── llm-client.js     # Clase LLMClient: llamadas a Gemini, memoria y manejo de errores
│   ├── chat-panel.js     # Panel de chat: memoria, temperatura y lectura en voz alta
│   ├── narrator.js       # Lectura en voz alta con la Web Speech API
│   ├── data.js           # Categorías, épocas, eventos, conexiones y prompts de personajes
│   └── config.example.js # Alternativa a .env para servidores estáticos
├── assets/               # Avatares de los personajes (monogramas SVG)
└── screenshots/          # Capturas para el informe
```

## Tecnologías

| Tecnología | Uso |
|---|---|
| Three.js 0.170 (WebGL) | Escena 3D, nodos con `ShaderMaterial`, halos con sprites aditivos, conexiones como curvas Bézier (`QuadraticBezierCurve3` + `TubeGeometry`) con un shader de pulsos animados, `OrbitControls` y etiquetas con `CSS2DRenderer` |
| D3.js 7.9 | Escalas de datos: año → posición en la espiral, importancia → tamaño, impacto → brillo; curvas de animación de la cámara |
| HTML, CSS y JavaScript (módulos ES) | Interfaz: leyenda con indicador de profundidad, controles de vista, tooltip y panel de detalle |
| API de Gemini (Google AI Studio) | Conversación con los personajes mediante `generateContent` con *system instructions* |
| Web Speech API (`speechSynthesis`) | Lectura en voz alta de las respuestas |
| Node.js | Servidor local sin dependencias (`server.js`) |
