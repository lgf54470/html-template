/* ============================================================
 * routes/hub.js — API Hub 管理路由
 * ------------------------------------------------------------
 * GET /api/hub/state   路由发现(内置 + 自定义)+ 配置 + 密钥
 * PUT /api/hub/config  保存配置与密钥(校验 + 分组公开级联 + 密钥加密落库)
 *
 * 管理接口本身始终要求会话鉴权(server/api/index.js 强制):
 * 不进入 Hub 的公开/自定义鉴权逻辑,也不会出现在路由发现列表中。
 * 依赖由 server/api/index.js 注入 { db, hub }。
 * ============================================================ */
'use strict';

const { sendJson, readBody } = require('../../http/json');

function hubRoutes({ db, hub }) {
  /** 路由发现:内置路由表 + 自定义路由;隐藏 /api/hub/* 管理接口自身 */
  async function getState(req, res) {
    const state = await hub.loadAll();
    const staticRoutes = (hub.staticRoutes || []).map(function (r) {
      return {
        method: r.method,
        path: r.path,
        builtIn: true,
        public: !!r.public,
        desc: r.desc || '',
      };
    });
    const customRoutes = state.config.customRoutes.map(function (c) {
      return {
        id: c.id,
        method: c.method,
        path: c.path,
        builtIn: false,
        name: c.name,
        desc: c.desc,
        public: c.public,
      };
    });
    return sendJson(res, 200, {
      routes: staticRoutes.concat(customRoutes),
      config: state.config,
      secrets: state.secrets,
    });
  }

  async function putConfig(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'bad_json' });
    }
    try {
      const saved = await hub.saveAll(body || {});
      return sendJson(res, 200, { ok: true, config: saved.config, secrets: saved.secrets });
    } catch (e) {
      return sendJson(res, 400, { error: 'bad_config', message: String((e && e.message) || e) });
    }
  }

  return [
    { method: 'GET', path: '/api/hub/state', desc: '获取 API Hub 全量状态(路由发现 + 配置 + 密钥)', handler: getState },
    { method: 'PUT', path: '/api/hub/config', desc: '保存 API Hub 配置(分组/标签/公开/鉴权/自定义路由)', handler: putConfig },
  ];
}

module.exports = hubRoutes;
