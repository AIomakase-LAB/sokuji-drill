'use strict';
/**
 * 開発・動作確認用のローカルサーバー。
 *  - 画面(このフォルダ)を配信する
 *  - /api に、Apps Script の code.js をメモリ上のモックで動かした API を置く
 *
 * 使い方:
 *   GAS_DIR=../gas-projects/projects/sokuji-drill node dev/server.js [ポート]
 * 起動すると、接続コードと承認者の合言葉を表示する。
 * 本物のスプレッドシートには何も書かない(止めるとデータは消える)。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const gasDir = path.resolve(root, process.env.GAS_DIR || '../gas-projects/projects/sokuji-drill');
const { createGas } = require(path.join(gasDir, 'test', 'gas-mock.js'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function start(port, opts) {
  opts = opts || {};
  const gas = createGas({ file: path.join(gasDir, 'code.js') });
  gas.doGet();
  const log = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/api' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        if (opts.offline && opts.offline()) { res.writeHead(503); res.end('offline'); return; }
        const out = gas.api.doPost({ postData: { contents: body } });
        try { log.push(JSON.parse(body).action); } catch (e) { /* 無視 */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(out.getContent());
      });
      return;
    }
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root + path.sep) || /(^|[\\/])(dev|test|\.git|node_modules)[\\/]/.test(path.relative(root, file))) { res.writeHead(404); res.end('not found'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port;
      const origin = 'http://127.0.0.1:' + actual;
      // 接続コード(URL は /api に差し替える)
      const code = Buffer.from(JSON.stringify({ u: origin + '/api', k: gas.props.API_KEY }), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      resolve({ server, gas, origin, code, adminKey: gas.props.ADMIN_KEY, log, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { start };

if (require.main === module) {
  start(Number(process.argv[2]) || 8080).then((s) => {
    console.log('画面:           ' + s.origin + '/');
    console.log('接続コード:     ' + s.code);
    console.log('承認者の合言葉: ' + s.adminKey);
  });
}
