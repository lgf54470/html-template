/* ============================================================
 * api/index.js — 共享 API 处理器(Node http req/res 风格)
 * ------------------------------------------------------------
 * 供 dev-server.js(本地 http 服务器)、Vercel 函数(api/index.js)
 * 与 Deno Deploy(deno/main.js 经 createRequire)共用,保证多处逻辑一致。
 *
 * 用法:
 *   const { createApiHandler, sendJson } = require('./server/api');
 *   const handleApi = createApiHandler({ db, encrypt, decrypt, verifyPassword });
 *   await handleApi(req, res, pathname);
 *
 * 路由按域拆分在 ./routes/*,createApiHandler 把它们收编进一张
 * "METHOD /path" 路由表。新增业务模块时,在 ./routes/ 下新增一个
 * 导出路由数组的模块并在此注册即可,无需改动任何现有路由。
 *
 * API(除 /api/auth/login 外均需请求头 x-auth-token):
 *   POST   /api/auth/login     { password, expiry }  -> { token, expiresAt }
 *   GET    /api/auth/verify                            -> { ok: true }
 *   POST   /api/auth/logout                            登出(删除会话)
 *   GET    /api/settings                               全部 app_settings(KV)
 *   PUT    /api/settings       { settings: { key: value } }  批量写入
 *   DELETE /api/settings       { keys: [ ... ] }       删除
 * ============================================================ */
'use strict';

const { sendJson } = require('../http/json');
const { findSession } = require('../auth/session');
const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');

/** 去除尾部多余斜杠,保证路由表按规范路径命中 */
function normalizePath(pathname) {
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname || '/';
}

/**
 * @param {{ db, encrypt, decrypt, verifyPassword }} ctx 依赖注入
 */
function createApiHandler(ctx) {
  const routes = {};
  authRoutes(ctx).concat(settingsRoutes(ctx)).forEach((r) => {
    routes[r.method + ' ' + r.path] = r;
  });

  return async function handleApi(req, res, pathname) {
    const route = routes[req.method + ' ' + normalizePath(pathname)];
    if (!route) return sendJson(res, 404, { error: 'not_found' });

    // 登录路由公开;其余路由先校验会话,未通过统一返回 401
    const session = route.public ? null : await findSession(ctx.db, req.headers['x-auth-token']);
    if (!route.public && !session) {
      return sendJson(res, 401, { error: 'unauthorized', message: '登录已失效,请重新登录' });
    }

    return route.handler(req, res, Object.assign({}, ctx, { session }));
  };
}

module.exports = { createApiHandler, sendJson };
