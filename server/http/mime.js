/* ============================================================
 * mime.js — 静态资源 MIME 映射(纯常量,Node / Deno 共用)
 * ------------------------------------------------------------
 * dev-server.js 经 ./static.js 使用;Deno 入口经 createRequire
 * 引用,避免两处各自维护一份 MIME 表。
 * ============================================================ */
'use strict';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

module.exports = { MIME };
