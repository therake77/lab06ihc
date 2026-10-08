// data.js — Datos de la constelación "Chef en el Aire"
//
// Tema: cómo han seguido las personas una receta mientras cocinan, desde los
// recetarios romanos hasta una app que se controla con gestos y voz.
//
// Ejes de la visualización (igual que en la guía del laboratorio):
//   - Plano X-Y: espiral temporal. Las 5 categorías comparten el mismo eje de
//     tiempo, así que un mismo año cae en el mismo punto de la espiral en
//     todos los niveles.
//   - Eje Z: categoría temática (un nivel por categoría).
//   - Radio del nodo: importancia del evento.
//   - Color y forma del nodo: categoría (la forma evita depender solo del color).
//   - Intensidad luminosa: impacto causal (conexiones que entran y salen).

// Categorías en orden de nivel Z (índice 0 = nivel inferior).
export const CATEGORIES = [
  {
    id: 'gastronomia',
    nombre: 'Gastronomía',
    descripcion: 'Cocineros y movimientos que cambiaron cómo se cocina',
    color: '#F4B740',
    forma: 'esfera'
  },
  {
    id: 'medios',
    nombre: 'Medios de receta',
    descripcion: 'Dónde se escribe y se consulta una receta',
    color: '#6EC6F0',
    forma: 'cubo'
  },
  {
    id: 'tecnologia',
    nombre: 'Tecnología de cocina',
    descripcion: 'Aparatos y pantallas que llegaron a la cocina',
    color: '#8FD694',
    forma: 'octaedro'
  },
  {
    id: 'interaccion',
    nombre: 'Interacción manos libres',
    descripcion: 'Voz, gestos y visión por computadora',
    color: '#FF7AA8',
    forma: 'tetraedro'
  },
  {
    id: 'accesibilidad',
    nombre: 'Accesibilidad',
    descripcion: 'Diseño para que todas las personas puedan cocinar',
    color: '#B9A2FF',
    forma: 'dodecaedro'
  }
];

// Tramos de la escala temporal no lineal (d3.scaleLinear por tramos).
// Cada tramo ocupa una vuelta de la espiral; las épocas recientes, que
// concentran más eventos, reciben más espacio.
export const ERAS = [
  { año: 0, etiqueta: 'Año 0', vuelta: 0 },
  { año: 1300, etiqueta: '1300', vuelta: 1 },
  { año: 1800, etiqueta: '1800', vuelta: 2 },
  { año: 1900, etiqueta: '1900', vuelta: 3 },
  { año: 1960, etiqueta: '1960', vuelta: 4 },
  { año: 2000, etiqueta: '2000', vuelta: 5 },
  { año: 2026, etiqueta: '2026', vuelta: 6.6 }
];

export const historicalData = {
  events: [
    // ───────────────────────── Gastronomía ─────────────────────────
    {
      id: 'apicio-0030',
      nombre: 'Marco Gavio Apicio',
      año: 30,
      fecha_texto: 'Siglo I',
      categoria: 'gastronomia',
      epoca: 'antiguedad',
      importancia: 7,
      personaje: true,
      resumen:
        'Gastrónomo romano del siglo I. Su nombre quedó ligado a De re coquinaria, el recetario de Occidente más antiguo que se conserva.',
      conexiones: ['viandier-1380'],
      avatar: './assets/apicio.svg',
      metadata: {
        lugar: 'Roma',
        obra: 'De re coquinaria (atribuida, compilada hacia el siglo IV)',
        aporte: 'Recetas escritas para la élite, sin cantidades ni tiempos'
      }
    },
    {
      id: 'careme-1833',
      nombre: 'Antonin Carême',
      año: 1833,
      categoria: 'gastronomia',
      epoca: 'siglo_xix',
      importancia: 8,
      personaje: true,
      resumen:
        'El “rey de los cocineros” ordenó la cocina francesa en un sistema: clasificó las salsas y escribió L’Art de la cuisine française au XIXe siècle.',
      conexiones: ['escoffier-1903'],
      avatar: './assets/careme.svg',
      metadata: {
        lugar: 'París',
        obra: 'L’Art de la cuisine française au XIXe siècle (1833–1847)',
        aporte: 'Sistematizó la alta cocina y sus salsas base'
      }
    },
    {
      id: 'escoffier-1903',
      nombre: 'Auguste Escoffier',
      año: 1903,
      categoria: 'gastronomia',
      epoca: 'siglo_xx',
      importancia: 9,
      personaje: true,
      resumen:
        'Publicó Le Guide culinaire, con unas 5000 recetas, y organizó la cocina profesional en una brigada con estaciones y pasos definidos.',
      conexiones: ['julia-1963'],
      avatar: './assets/escoffier.svg',
      metadata: {
        lugar: 'Londres y Montecarlo',
        obra: 'Le Guide culinaire (1903)',
        aporte: 'Brigada de cocina y receta como procedimiento ordenado'
      }
    },
    {
      id: 'mistura-2008',
      nombre: 'Mistura y el boom gastronómico peruano',
      año: 2008,
      categoria: 'gastronomia',
      epoca: 'era_digital',
      importancia: 6,
      resumen:
        'La primera feria Mistura en Lima consolida el boom de la cocina peruana. Platos como el ají de gallina pasan a ser recetas que el mundo quiere aprender.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        lugar: 'Lima, Perú',
        aporte: 'Demanda de recetas peruanas paso a paso'
      }
    },

    // ─────────────────────── Medios de receta ───────────────────────
    {
      id: 'viandier-1380',
      nombre: 'Le Viandier',
      año: 1380,
      fecha_texto: 'c. 1380',
      categoria: 'medios',
      epoca: 'medieval',
      importancia: 5,
      resumen:
        'Recetario manuscrito francés asociado al cocinero Taillevent. Las recetas se copian a mano y asumen que el lector ya sabe cocinar.',
      conexiones: ['platina-1474'],
      metadata: {
        lugar: 'Francia',
        formato: 'Manuscrito',
        aporte: 'La receta como texto que se transmite entre cocinas'
      }
    },
    {
      id: 'platina-1474',
      nombre: 'De honesta voluptate',
      año: 1474,
      fecha_texto: 'c. 1474',
      categoria: 'medios',
      epoca: 'renacimiento',
      importancia: 6,
      resumen:
        'Bartolomeo Platina publica el primer libro de cocina impreso, con recetas del Maestro Martino. La imprenta multiplica las copias de una misma receta.',
      conexiones: ['farmer-1896'],
      metadata: {
        lugar: 'Roma',
        formato: 'Libro impreso',
        aporte: 'Recetas idénticas para miles de lectores'
      }
    },
    {
      id: 'farmer-1896',
      nombre: 'Fannie Farmer',
      año: 1896,
      categoria: 'medios',
      epoca: 'siglo_xix',
      importancia: 9,
      personaje: true,
      resumen:
        'Su Boston Cooking-School Cook Book popularizó las medidas rasas y exactas. Desde entonces una receta se puede repetir con el mismo resultado.',
      conexiones: ['joy-1931'],
      avatar: './assets/farmer.svg',
      metadata: {
        lugar: 'Boston, EE. UU.',
        obra: 'The Boston Cooking-School Cook Book (1896)',
        aporte: 'Medidas estandarizadas (tazas y cucharadas rasas)'
      }
    },
    {
      id: 'joy-1931',
      nombre: 'Joy of Cooking',
      año: 1931,
      categoria: 'medios',
      epoca: 'siglo_xx',
      importancia: 7,
      resumen:
        'Irma S. Rombauer autopublica el libro. En sus ediciones posteriores intercala los ingredientes dentro de los pasos, en el orden en que se usan.',
      conexiones: ['epicurious-1995'],
      metadata: {
        lugar: 'San Luis, EE. UU.',
        formato: 'Libro de cocina doméstico',
        aporte: 'Pasos e ingredientes en el orden de uso'
      }
    },
    {
      id: 'julia-1963',
      nombre: 'Julia Child',
      año: 1963,
      categoria: 'medios',
      epoca: 'siglo_xx',
      importancia: 9,
      personaje: true,
      resumen:
        'Estrena The French Chef en la televisión pública de Boston. La receta deja de leerse y empieza a verse, paso a paso y en tiempo real.',
      conexiones: ['tasty-2015'],
      avatar: './assets/julia.svg',
      metadata: {
        lugar: 'Boston, EE. UU.',
        obra: 'Mastering the Art of French Cooking (1961), The French Chef (1963)',
        aporte: 'La receta como demostración en video'
      }
    },
    {
      id: 'epicurious-1995',
      nombre: 'Recetas en la web',
      año: 1995,
      categoria: 'medios',
      epoca: 'siglo_xx',
      importancia: 6,
      resumen:
        'Sitios como Epicurious publican miles de recetas buscables. La receta se consulta en una pantalla, lejos de la cocina.',
      conexiones: ['apps-2009'],
      metadata: {
        formato: 'Sitio web',
        aporte: 'Búsqueda de recetas por ingrediente'
      }
    },
    {
      id: 'apps-2009',
      nombre: 'Apps de recetas',
      año: 2009,
      categoria: 'medios',
      epoca: 'era_digital',
      importancia: 7,
      resumen:
        'Las recetas llegan a las tiendas de aplicaciones. El teléfono entra a la cocina, pero se maneja tocando la pantalla.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        formato: 'Aplicación móvil',
        aporte: 'La receta siempre en el bolsillo'
      }
    },
    {
      id: 'tasty-2015',
      nombre: 'Videos de recetas cenitales',
      año: 2015,
      categoria: 'medios',
      epoca: 'era_digital',
      importancia: 5,
      resumen:
        'Videos cortos grabados desde arriba, como los de Tasty, resumen una receta en un minuto. Son fáciles de ver, pero difíciles de seguir al ritmo propio.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        formato: 'Video corto en redes sociales',
        aporte: 'Pasos visuales y rápidos'
      }
    },

    // ───────────────────── Tecnología de cocina ─────────────────────
    {
      id: 'termostato-1915',
      nombre: 'Termostato de horno',
      año: 1915,
      categoria: 'tecnologia',
      epoca: 'siglo_xx',
      importancia: 5,
      resumen:
        'El regulador Lorain permite fijar la temperatura del horno. Las recetas pueden decir “hornear a 180 °C” en vez de “a horno moderado”.',
      conexiones: ['joy-1931'],
      metadata: {
        lugar: 'EE. UU.',
        aporte: 'Temperatura exacta en la receta'
      }
    },
    {
      id: 'iphone-2007',
      nombre: 'Smartphone táctil',
      año: 2007,
      categoria: 'tecnologia',
      epoca: 'era_digital',
      importancia: 7,
      resumen:
        'El iPhone populariza la pantalla táctil capacitiva. Funciona con un dedo limpio y seco, justo lo que falta mientras se cocina.',
      conexiones: ['apps-2009', 'voiceover-2009'],
      metadata: {
        aporte: 'Interfaz táctil masiva'
      }
    },
    {
      id: 'ipad-2010',
      nombre: 'La tablet en la encimera',
      año: 2010,
      categoria: 'tecnologia',
      epoca: 'era_digital',
      importancia: 6,
      resumen:
        'Con la tablet, la receta se apoya junto a la tabla de picar. Aparece el problema que motiva este proyecto: manos con harina y una pantalla que hay que tocar.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        aporte: 'Pantalla grande dentro de la cocina'
      }
    },
    {
      id: 'thermomix-2014',
      nombre: 'Cocina guiada en el electrodoméstico',
      año: 2014,
      categoria: 'tecnologia',
      epoca: 'era_digital',
      importancia: 6,
      resumen:
        'El Thermomix TM5 incorpora recetas paso a paso en su pantalla: el aparato ajusta tiempo y temperatura de cada paso.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        aporte: 'Receta y aparato sincronizados'
      }
    },
    {
      id: 'llm-2022',
      nombre: 'Modelos de lenguaje conversacionales',
      año: 2022,
      categoria: 'tecnologia',
      epoca: 'era_digital',
      importancia: 8,
      resumen:
        'Los LLM permiten pedir “sustituye la leche” o “explícamelo más simple” y recibir una receta adaptada al momento.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        aporte: 'Recetas adaptadas por conversación'
      }
    },

    // ────────────────── Interacción manos libres ──────────────────
    {
      id: 'putthatthere-1980',
      nombre: 'Put-That-There',
      año: 1980,
      categoria: 'interaccion',
      epoca: 'siglo_xx',
      importancia: 7,
      resumen:
        'Richard Bolt, en el MIT, combina voz y gesto de señalar para mover objetos en una pantalla. Es el antecedente de la interacción multimodal.',
      conexiones: ['kinect-2010'],
      metadata: {
        lugar: 'MIT Media Lab',
        aporte: 'Voz + gesto en una misma orden'
      }
    },
    {
      id: 'kinect-2010',
      nombre: 'Kinect',
      año: 2010,
      categoria: 'interaccion',
      epoca: 'era_digital',
      importancia: 7,
      resumen:
        'Microsoft lleva el control por gestos del cuerpo a millones de hogares, sin mandos ni pantallas táctiles.',
      conexiones: ['mediapipe-2019'],
      metadata: {
        aporte: 'Gestos en el aire en el hogar'
      }
    },
    {
      id: 'alexa-2014',
      nombre: 'Asistentes de voz en casa',
      año: 2014,
      categoria: 'interaccion',
      epoca: 'era_digital',
      importancia: 7,
      resumen:
        'Altavoces como Amazon Echo ponen temporizadores y responden preguntas por voz. La cocina se vuelve uno de sus usos principales.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        aporte: 'Temporizadores y consultas sin tocar nada'
      }
    },
    {
      id: 'mediapipe-2019',
      nombre: 'MediaPipe Hands',
      año: 2019,
      categoria: 'interaccion',
      epoca: 'era_digital',
      importancia: 8,
      resumen:
        'Google publica un modelo que detecta 21 puntos de cada mano en tiempo real con una cámara común, procesando en el propio dispositivo.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        aporte: 'Gestos con cámara de celular, sin enviar imágenes'
      }
    },
    {
      id: 'chefenelaire-2026',
      nombre: 'Chef en el Aire',
      año: 2026,
      categoria: 'interaccion',
      epoca: 'era_digital',
      importancia: 10,
      resumen:
        'Nuestra propuesta: seguir recetas sin tocar la pantalla, con gestos en el aire, comandos de voz, pasos grandes y un LLM que adapta cada receta a la persona.',
      conexiones: [],
      metadata: {
        lugar: 'UNI, Lima',
        aporte: 'Cocina manos libres y accesible'
      }
    },

    // ───────────────────────── Accesibilidad ─────────────────────────
    {
      id: 'braille-1829',
      nombre: 'Sistema Braille',
      año: 1829,
      categoria: 'accesibilidad',
      epoca: 'siglo_xix',
      importancia: 6,
      resumen:
        'Louis Braille publica su método de lectura en relieve. Por primera vez, una persona ciega puede leer por su cuenta, también recetas.',
      conexiones: ['voiceover-2009'],
      metadata: {
        lugar: 'París',
        aporte: 'Lectura autónoma sin la vista'
      }
    },
    {
      id: 'oxo-1990',
      nombre: 'Utensilios OXO Good Grips',
      año: 1990,
      categoria: 'accesibilidad',
      epoca: 'siglo_xx',
      importancia: 6,
      resumen:
        'Utensilios de mango grueso pensados para personas con artritis que terminan siendo más cómodos para todos. Un ejemplo clásico de diseño universal.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        aporte: 'Diseño universal en la cocina'
      }
    },
    {
      id: 'voiceover-2009',
      nombre: 'Lector de pantalla en el celular',
      año: 2009,
      categoria: 'accesibilidad',
      epoca: 'era_digital',
      importancia: 7,
      resumen:
        'VoiceOver llega al iPhone 3GS: una pantalla táctil se puede usar sin verla. Android incorpora TalkBack poco después.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        aporte: 'Pantallas táctiles accesibles por audio'
      }
    },
    {
      id: 'ley29973-2012',
      nombre: 'Ley 29973 (Perú)',
      año: 2012,
      categoria: 'accesibilidad',
      epoca: 'era_digital',
      importancia: 6,
      resumen:
        'La Ley General de la Persona con Discapacidad reconoce el derecho a la accesibilidad, también en las tecnologías de la información.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        lugar: 'Perú',
        aporte: 'Accesibilidad como obligación legal'
      }
    },
    {
      id: 'wcag22-2023',
      nombre: 'WCAG 2.2',
      año: 2023,
      categoria: 'accesibilidad',
      epoca: 'era_digital',
      importancia: 7,
      resumen:
        'El W3C publica la versión 2.2 de sus pautas de accesibilidad, con criterios sobre tamaño de objetivos y alternativas a los gestos de arrastre.',
      conexiones: ['chefenelaire-2026'],
      metadata: {
        aporte: 'Criterios medibles de accesibilidad (nivel AA)'
      }
    }
  ]
};
