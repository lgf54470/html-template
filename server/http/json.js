/* ============================================================
 * json.js — Node 风格 HTTP JSON 工具(零第三方依赖)
 * ------------------------------------------------------------
 * sendJson / readBody 只面向 Node 的 http req/res 风格
 * (dev-server.js、Vercel 函数、Deno 经 makeNodeReq/makeNodeRes 适配)。
 * Cloudflare Worker 使用原生 Response,不经过本模块。
 * ============================================================ */
'use strict';

const { SECURITY_HEADERS } = require('./headers');

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(
    status,
    Object.assign(
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      SECURITY_HEADERS
    )
  );
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

module.exports = { sendJson, readBody };
