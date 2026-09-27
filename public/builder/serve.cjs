// Dependency-free, read-only localhost server for the contributor builder.
// It uses this repository's fixed layout; contributors never have to select
// thousands of Quran files in a browser folder dialog.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const builder = path.resolve(__dirname);
const editable = new Set(Object.values(require('./validation.js').editableFiles));
const staticTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const allowedFile = name => editable.has(name)
  || name === 'src/data/metadata.json'
  || /^src\/data\/verses\/\d{3}_\d{3}\.json$/.test(name)
  || /^public\/discovery-images\/[a-zA-Z0-9_-]+\.webp$/.test(name);

async function sendFile(res, file, type) {
  try {
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Not a regular file');
    const bytes = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': `${type}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) {
    res.writeHead(403); res.end('Localhost only'); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Read only'); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400); res.end('Bad URL'); return; }
  if (pathname === '/__builder_manifest') {
    try {
      const verses = (await fs.readdir(path.join(root, 'src/data/verses')))
        .filter(name => /^\d{3}_\d{3}\.json$/.test(name));
      const assets = (await fs.readdir(path.join(root, 'public/discovery-images')))
        .filter(name => /^[a-zA-Z0-9_-]+\.webp$/.test(name))
        .map(name => `public/discovery-images/${name}`);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify({ verseCount: verses.length, assets }));
    } catch { res.writeHead(500); res.end('Repository data unavailable'); }
    return;
  }
  if (pathname.startsWith('/__builder_file/')) {
    const name = pathname.slice('/__builder_file/'.length);
    if (!allowedFile(name)) { res.writeHead(404); res.end('Not found'); return; }
    await sendFile(res, path.join(root, ...name.split('/')), name.endsWith('.webp') ? 'image/webp' : 'application/json');
    return;
  }
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!['index.html', 'style.css', 'app.js', 'validation.js', 'zip.js'].includes(name)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  await sendFile(res, path.join(builder, name), staticTypes[path.extname(name)]);
});

if (require.main === module) {
  server.listen(4178, '127.0.0.1', () => {
    console.log('ورشة المساهمة جاهزة: http://127.0.0.1:4178/');
    console.log('تُقرأ ملفات المستودع تلقائيًا، ولا تُكتب أي ملفات. اضغط Ctrl+C للإيقاف.');
  });
}

module.exports = { server, root, allowedFile };
