/* ============================================================
 * static.js — Node 静态资源服务(零第三方依赖)
 * ------------------------------------------------------------
 * 从 dev-server.js 抽出,职责单一:把请求路径映射到磁盘文件并返回。
 * 路径穿越防护、目录→index.html、MIME 与 Cache-Control 都在这里。
 *
 * 安全:仅对公开资源白名单(index.html / js / assets)放行,
 * 仓库内的 server/、.env*、sqlite.db、部署配置等一律 404,
 * 避免静态服务把密钥、数据库或源码暴露出去(见 ./allowed.js)。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { MIME } = require('./mime');
const { isPublicAsset } = require('./allowed');
const { SECURITY_HEADERS } = require('./headers');

function serveStatic(req, res, pathname, root) {
  if (!isPublicAsset(pathname)) {
    res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS));
    return res.end('Not Found');
  }
  const rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.resolve(root, '.' + rel);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS));
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS));
        return res.end('Not Found');
      }
      res.writeHead(200, Object.assign({
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      }, SECURITY_HEADERS));
      res.end(data);
    });
  });
}

module.exports = { serveStatic };
