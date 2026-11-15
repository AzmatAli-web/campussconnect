import {fileURLToPath, pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import {createAdminLab} from '../../backend/test/fixtures/admin-lab.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function startAdminLab({port = 5180} = {}) {
  const fixture = await createAdminLab();
  let vite;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {await vite?.close();}
    finally {await fixture.close();}
  };
  try {
    vite = await createServer({
      root, configFile: false, envFile: false, publicDir: false,
      define: {
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1'),
        'import.meta.env.CAMPUS_ADMIN_LAB': 'true',
      },
      server: {host: '127.0.0.1', port, strictPort: true, hmr: false},
      plugins: [{
        name: 'campusconnect-admin-lab-only',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/') {
              res.writeHead(302, {Location: '/test/admin-lab/'});
              return res.end();
            }
            if (!req.url?.startsWith('/api/')) return next();
            const local = '127.0.0.1:' + server.httpServer.address().port;
            if (req.headers.host !== local ||
                (req.headers.origin && req.headers.origin !== 'http://' + local)) {
              res.writeHead(403);
              return res.end();
            }
            return fixture.app(req, res);
          });
        },
      }],
    });
    await vite.listen();
    return {url: 'http://127.0.0.1:' + vite.httpServer.address().port, close};
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Starting isolated Admin Lab (the first run may download MongoDB)...');
  try {
    const {url, close} = await startAdminLab();
    console.log('Open ' + url + ' — fictional accounts only. Ctrl+C stops and resets the lab.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      void close().catch(() => {process.exitCode = 1;});
    });
  } catch (error) {
    console.error('Admin Lab could not start:', error.code ?? error.name);
    process.exitCode = 1;
  }
}
