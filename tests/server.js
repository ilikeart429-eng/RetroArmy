const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png'
};

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const filePath = path.join(ROOT, url === '/' ? 'index.html' : path.normalize(url));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
}).listen(PORT, () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`));
