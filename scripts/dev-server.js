/**
 * Serveur de développement simple pour prévisualiser le site généré
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = import.meta.dirname || new URL('.', import.meta.url).pathname;
const DIST = join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  let url = req.url.split('?')[0];

  // Try exact file, then index.html in directory
  let filePath = join(DIST, url);
  if (!extname(filePath)) {
    const indexPath = join(filePath, 'index.html');
    if (existsSync(indexPath)) filePath = indexPath;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 — Page non trouvée</h1>');
    return;
  }

  const ext = extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end('Erreur serveur');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Serveur de dev : http://localhost:${PORT}`);
  console.log('   Ctrl+C pour arrêter');
});
