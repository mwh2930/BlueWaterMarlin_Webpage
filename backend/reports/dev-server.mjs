import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicCatalog } from './security.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const allowedRoots = ['assets/', 'data/', 'report/', 'sources/', 'privacy/', 'support/'];
const allowedFiles = new Set(['index.html', 'support.html', 'support.js', '404.html', 'favicon.ico']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const response = (res, code, data, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)); };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/reports/')) {
      // Explicit preview: reject every write without reading/logging a body.
      if (req.method !== 'GET') { req.resume(); return response(res, 405, { error: 'Method not allowed.' }); }
      if (url.pathname === '/api/reports/catalog') {
        const value = JSON.parse(await readFile(resolve(root, 'data/report-destinations.json'), 'utf8'));
        return response(res, 200, { destinations: publicCatalog(Array.isArray(value) ? value : value.destinations).map(item => ({ ...item, available: false })) });
      }
      return response(res, 404, { error: 'No current report is available in this preview.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) { req.resume(); return response(res, 405, { error: 'Method not allowed.' }); }
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (relative.endsWith('/')) relative += 'index.html';
    if (relative.split('/').some(segment => segment.startsWith('.') || segment.includes('\\'))) return response(res, 404, { error: 'Not found.' });
    if (!allowedFiles.has(relative) && !allowedRoots.some(prefix => relative.startsWith(prefix))) return response(res, 404, { error: 'Not found.' });
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep) || !types[extname(path)]) return response(res, 404, { error: 'Not found.' });
    if (!(await stat(path)).isFile()) return response(res, 404, { error: 'Not found.' });
    return response(res, 200, req.method === 'HEAD' ? '' : await readFile(path), types[extname(path)]);
  } catch { response(res, 404, { error: 'Not found.' }); }
}).listen(Number(process.env.REPORTS_PREVIEW_PORT || 8878), '127.0.0.1', () => {
  process.stdout.write(`Report preview: http://127.0.0.1:${Number(process.env.REPORTS_PREVIEW_PORT || 8878)}/report/\nPreview only. No cloud connection or personal-data collection.\n`);
});
