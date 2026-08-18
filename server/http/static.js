/* ============================================================
 * static.js — Node 静态资源服务(零第三方依赖)
 * ------------------------------------------------------------
 * 从 dev-server.js 抽出,职责单一:把请求路径映射到磁盘文件并返回。
 * 路径穿越防护、目录→index.html、MIME 与 Cache-Control 都在这里。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { MIME } = require('./mime');

function serveStatic(req, res, pathname, root) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.resolve(root, '.' + rel);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });
}

module.exports = { serveStatic };
