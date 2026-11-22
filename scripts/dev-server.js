/**
 * Local development server: serves /public and mounts /api/* handlers with the
 * same req.query / req.body shape Vercel provides. Dev only, not deployed.
 * Usage: npm run dev   (optionally GEMINI_API_KEY=... npm run dev)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const port = Number(process.env.PORT) || 3000;

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  try { return text ? JSON.parse(text) : undefined; } catch { return text; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
      const { default: handler } = await import(pathToFileURL(join(root, 'api', `${name}.js`)));
      req.query = Object.fromEntries(url.searchParams);
      req.body = await readBody(req);
      return await handler(req, res);
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = normalize(join(root, 'public', rel));
    if (!file.startsWith(join(root, 'public'))) throw new Error('forbidden');
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(port, () => console.log(`Saans dev server: http://localhost:${port}`));
