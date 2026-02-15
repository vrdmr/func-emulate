import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = parseInt(process.env.CDN_PORT || '4566', 10);
const PROFILES_PATH = join(__dirname, 'profiles', 'sku-profiles.json');
const HOSTS_DIR = join(__dirname, 'hosts');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  console.log(`${new Date().toISOString()} ${req.method} ${path}`);

  try {
    // GET /api/profiles → serve sku-profiles.json
    if (path === '/api/profiles') {
      const json = await readFile(PROFILES_PATH, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(json);
      return;
    }

    // GET /hosts/:version/:filename → serve host zip
    const hostMatch = path.match(/^\/hosts\/([^/]+)\/(.+\.zip)$/);
    if (hostMatch) {
      const [, version, filename] = hostMatch;
      const filePath = resolve(join(HOSTS_DIR, version, filename));

      // Security: ensure path is within HOSTS_DIR
      if (!filePath.startsWith(resolve(HOSTS_DIR))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      try {
        const fileStat = await stat(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': fileStat.size,
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(404);
        res.end(`Host package not found: ${version}/${filename}\n` +
          `Expected at: ${filePath}\n` +
          `Run tests/build-hosts.sh to build host packages.`);
      }
      return;
    }

    // GET / → health check / listing
    if (path === '/') {
      const profiles = JSON.parse(await readFile(PROFILES_PATH, 'utf-8'));
      const skus = Object.entries(profiles.profiles).map(([key, p]) =>
        `  ${key.padEnd(24)} → host ${p.hostVersion} (${p.status})`
      ).join('\n');

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(
        `fnx CDN Server\n` +
        `────────────────────────────────────────\n` +
        `Endpoints:\n` +
        `  GET /api/profiles          → SKU profiles JSON\n` +
        `  GET /hosts/:ver/:file.zip  → Host package download\n\n` +
        `Available profiles:\n${skus}\n\n` +
        `Updated: ${profiles.updatedAt}\n`
      );
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    res.writeHead(500);
    res.end(`Internal error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`╔════════════════════════════════════════════╗`);
  console.log(`║  fnx CDN Server                      ║`);
  console.log(`║  http://localhost:${PORT}                    ║`);
  console.log(`║                                            ║`);
  console.log(`║  GET /api/profiles     → SKU profiles      ║`);
  console.log(`║  GET /hosts/:v/:f.zip  → Host packages     ║`);
  console.log(`╚════════════════════════════════════════════╝`);
});
