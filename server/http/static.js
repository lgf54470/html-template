/* ============================================================
 * static.js — Node 静态资源服务(零第三方依赖)
 * ------------------------------------------------------------
 * 从 dev-server.js 抽出,职责单一:把请求路径映射到磁盘文件并返回。
 * 路径穿越防护、目录→index.html、MIME 与 Cache-Control 都在这里。
 *
 * 安全:仅对公开资源白名单(index.html / js / assets)放行,
 * 仓库内的 server/、.env*、sqlite.db、部署配置等一律 404,
 * 避免静态服务把密钥、数据库或源码暴露出去(见 ./allowed.js)。
 *
 * 性能:js / assets 返回 ETag + Last-Modified,浏览器通过 304
 * 复用缓存,避免每次刷新重复下载大体积样式与图标;index.html
 * 始终 no-store,保证入口更新即时可见。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { MIME } = require('./mime');
const { isPublicAsset } = require('./allowed');
const { SECURITY_HEADERS } = require('./headers');

/** 入口 HTML 不缓存;公开静态资源允许条件缓存(每次 304 校验) */
function cacheControl(pathname) {
  return pathname === '/' || pathname === '/index.html' ? 'no-store' : 'public, no-cache';
}

/** 弱 ETag:基于文件大小 + 修改时间,stat 即可得到,无需读文件内容 */
function etag(st) {
  return 'W/"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs).toString(16) + '"';
}

function serveStatic(req, res, pathname, root) {
  if (!isPublicAsset(pathname)) {
    res.writeHead(
      404,
      Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS)
    );
    return res.end('Not Found');
  }
  const rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.resolve(root, '.' + rel);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(
      403,
      Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS)
    );
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    // 二次 stat 拿到真实文件(目录→index.html 后)的 mtime/size
    fs.stat(filePath, (err2, st2) => {
      if (err2 || !st2.isFile()) {
        res.writeHead(
          404,
          Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS)
        );
        return res.end('Not Found');
      }
      const headers = Object.assign(
        {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': cacheControl(pathname),
          ETag: etag(st2),
          'Last-Modified': new Date(st2.mtimeMs).toUTCString(),
        },
        SECURITY_HEADERS
      );
      const inm = req.headers['if-none-match'];
      if (
        inm &&
        String(inm)
          .split(',')
          .some(function (t) {
            return t.trim() === headers['ETag'];
          })
      ) {
        res.writeHead(304, headers);
        return res.end();
      }
      fs.readFile(filePath, (err3, data) => {
        if (err3) {
          res.writeHead(
            404,
            Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS)
          );
          return res.end('Not Found');
        }
        res.writeHead(200, headers);
        res.end(data);
      });
    });
  });
}

module.exports = { serveStatic };
