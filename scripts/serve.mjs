/**
 * Static file server for the built app, used by the sprite deployment.
 *
 * Two things a generic static server gets wrong here. WASM must be served as
 * `application/wasm` or `WebAssembly.instantiateStreaming` refuses it, and the app loads
 * two large WASM modules before it can do anything. And the proving keys under `zk/` have
 * no extension a mime table knows, so they need a deliberate fallback rather than a guess.
 *
 * It is deployed to the sprite by `scripts/deploy-sprite.sh` and run there as a service.
 * Nothing about it is specific to sprites: `PORTS` and `SITE_ROOT` are the whole interface.
 */

import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.env.SITE_ROOT ?? '/home/sprite/site');
const PORTS = (process.env.PORTS ?? '8080').split(',').map(Number);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const handler = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Normalize before joining, so a crafted `..` cannot climb out of ROOT.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let path = join(ROOT, rel);
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let stat = await fs.stat(path).catch(() => null);
  if (stat?.isDirectory()) {
    path = join(path, 'index.html');
    stat = await fs.stat(path).catch(() => null);
  }
  // Single page app: anything unresolved falls back to the shell.
  if (!stat) {
    path = join(ROOT, 'index.html');
    stat = await fs.stat(path).catch(() => null);
    if (!stat) {
      res.writeHead(404).end('Not found');
      return;
    }
  }

  // Assets carry a content hash in the name, so they can be cached forever. `index.html`
  // is the one file that must not be, or a redeploy stays invisible behind a cached shell.
  const cache = path.endsWith('index.html')
    ? 'no-cache'
    : 'public, max-age=31536000, immutable';

  res.writeHead(200, {
    'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': cache,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(path).pipe(res);
};

for (const port of PORTS) {
  createServer(handler)
    .listen(port, '0.0.0.0', () => console.log(`serving ${ROOT} on :${port}`))
    .on('error', (err) => console.error(`port ${port}: ${err.message}`));
}
