// server.js — Servidor local de desarrollo (Node.js 18 o superior, sin dependencias)
//
// Sirve los archivos del proyecto y entrega la API key de Gemini al navegador
// a partir del archivo .env, sin que la key quede escrita en el código fuente.
//
//   node server.js            → http://localhost:8000
//   PORT=3000 node server.js  → otro puerto
//
// Variables que lee del archivo .env:
//   GEMINI_API_KEY=...        (obligatoria; también acepta GOOGLE_API_KEY o API_KEY)
//   GEMINI_MODEL=...          (opcional; por defecto "auto")
//
// Nota: la key se envía al navegador porque la app llama a Gemini desde el
// cliente, como en la guía del laboratorio. Para producción convendría un
// proxy en el servidor que haga las llamadas y nunca exponga la key.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

// Lector tolerante de archivos .env. Acepta:
//   CLAVE=valor   CLAVE = "valor"   export CLAVE=valor   CLAVE: valor
//   comentarios (# ...) y una línea que contenga solo la key, sin nombre.
function readEnv() {
  const path = join(ROOT, '.env');
  const result = { exists: existsSync(path), vars: {}, bareKey: '' };
  if (!result.exists) return result;
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][\w.-]*)\s*[=:]\s*(.*)$/);
    if (!match) {
      // Línea con solo la key (sin "GEMINI_API_KEY=")
      if (/^[\w.-]{20,}$/.test(line)) result.bareKey = line;
      continue;
    }
    let value = match[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim(); // comentario al final de la línea
    result.vars[match[1]] = value;
  }
  return result;
}

const KEY_NAMES = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'API_KEY'];

// Busca la key: nombres habituales → cualquier variable con "KEY" → única variable → línea suelta
function findKey() {
  const { vars, bareKey } = readEnv();
  for (const name of KEY_NAMES) {
    if (process.env[name]) return { key: process.env[name], source: `variable de entorno ${name}` };
    if (vars[name]) return { key: vars[name], source: name };
  }
  const looksLikeKey = (value) => /^[\w.-]{20,}$/.test(value || '');
  const keyLike = Object.keys(vars).find(name => /key/i.test(name) && looksLikeKey(vars[name]));
  if (keyLike) return { key: vars[keyLike], source: keyLike };
  const names = Object.keys(vars).filter(name => name !== 'GEMINI_MODEL');
  if (names.length === 1 && looksLikeKey(vars[names[0]])) return { key: vars[names[0]], source: names[0] };
  if (bareKey) return { key: bareKey, source: 'línea sin nombre' };
  return { key: '', source: '' };
}

function maskKey(key) {
  return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-3)} (${key.length} caracteres)` : `(${key.length} caracteres)`;
}

// js/config.js generado a partir de .env (solo si no existe un js/config.js real)
function configModule() {
  const { vars } = readEnv();
  const { key } = findKey();
  const model = process.env.GEMINI_MODEL || vars.GEMINI_MODEL || 'auto';
  return `// Generado por server.js a partir de .env\n` +
    `export const API_KEY = ${JSON.stringify(key)};\n` +
    `export const MODEL = ${JSON.stringify(model)};\n` +
    `export const SOURCE = "server";\n`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Nunca servir archivos ocultos (.env, .git, etc.)
    if (pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404).end('No encontrado');
      return;
    }

    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
      res.writeHead(403).end('Prohibido');
      return;
    }

    if (pathname === '/js/config.js' && !existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
      res.end(configModule());
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404).end('No encontrado');
      return;
    }
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (error) {
    res.writeHead(500).end('Error del servidor');
    console.error(error);
  }
});

server.listen(PORT, () => {
  const env = readEnv();
  const { key, source } = findKey();
  console.log(`Constelación Chef en el Aire → http://localhost:${PORT}`);
  if (!env.exists) {
    console.log('Aviso: no existe el archivo .env en esta carpeta. Créalo a partir de .env.example.');
  } else if (!key) {
    const names = Object.keys(env.vars);
    console.log(`Aviso: el archivo .env existe, pero no se encontró la API key.`);
    console.log(`  Variables encontradas: ${names.length ? names.join(', ') : 'ninguna'}`);
    console.log('  Escribe una línea así (sin espacios ni comillas): GEMINI_API_KEY=tu_api_key');
  } else {
    console.log(`API key leída de .env (${source}): ${maskKey(key)}`);
  }
  if (existsSync(join(ROOT, 'js', 'config.js'))) {
    console.log('Nota: existe js/config.js, así que se usará ese archivo en lugar de .env.');
  }
});
