/* ============================================================
 * routes/settings.js — 全局设置 KV API 路由(按工作空间隔离)
 * ------------------------------------------------------------
 * GET    /api/settings[?workspace=<id>]  返回全局注册表 + 指定/当前工作空间的设置
 * PUT    /api/settings                   批量写入(按键归属作用域落库)
 * DELETE /api/settings                   批量删除(按当前工作空间定位)
 *
 * 工作空间隔离规则见 server/db/scope.js:
 *   - settings:workspaces / settings:activeWorkspace 始终落在 global 作用域;
 *   - 其余 settings:* 键落在当前工作空间(workspace_id = 活跃 id)。
 * 敏感键加密后落库;保留键 settings:auth:* 禁止读写。
 * 依赖由 server/api/index.js 注入 { db, encrypt, decrypt }。
 * ============================================================ */
'use strict';

const { sendJson, readBody } = require('../../http/json');
const { RESERVED_SETTINGS_PREFIX, isSensitiveKey } = require('../../security/sensitive');
const { GLOBAL_WORKSPACE_ID, workspaceIdForKey } = require('../../db/scope');

function settingsRoutes({ db, encrypt, decrypt }) {
  /** 解析当前活跃工作空间:优先查询参数(切换场景),否则读全局指针,再回退 global */
  async function resolveActiveWorkspace(queryWorkspace) {
    if (queryWorkspace) return queryWorkspace;
    const row = await db.get(
      "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
      [GLOBAL_WORKSPACE_ID]
    );
    return (row && row.value) || GLOBAL_WORKSPACE_ID;
  }

  async function getSettings(req, res) {
    let requestedWs = '';
    try {
      requestedWs = new URL(req.url || '/', 'http://localhost').searchParams.get('workspace') || '';
    } catch (e) {
      requestedWs = '';
    }
    const activeWs = await resolveActiveWorkspace(requestedWs);
    // 全局键 + 当前工作空间键一并返回(前端据此重建注册表与当前工作空间数据)
    const rows = await db.query(
      'SELECT workspace_id, key, value FROM app_settings WHERE workspace_id IN (?, ?) ORDER BY key',
      [GLOBAL_WORKSPACE_ID, activeWs]
    );
    const out = {};
    rows.forEach((r) => {
      if (r.key.indexOf(RESERVED_SETTINGS_PREFIX) === 0) return;
      out[r.key] = isSensitiveKey(r.key) ? decrypt(r.value) || '' : r.value;
    });
    return sendJson(res, 200, out);
  }

  async function putSettings(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'bad_json' });
    }
    const entries = body && typeof body.settings === 'object' ? body.settings : null;
    if (!entries)
      return sendJson(res, 400, { error: 'bad_body', message: '需要 { settings: {...} }' });

    const keys = Object.keys(entries);
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(res, 403, {
          error: 'reserved_key',
          message: k + ' 为保留键,请走专用鉴权接口',
        });
      }
    }

    // 切工作空间时,负载自带新的 settings:activeWorkspace,按新值归属工作空间键
    const declared =
      typeof entries['settings:activeWorkspace'] === 'string' && entries['settings:activeWorkspace']
        ? entries['settings:activeWorkspace']
        : '';
    const activeWs = await resolveActiveWorkspace(declared);

    const now = new Date().toISOString();
    for (const k of keys) {
      const wsId = workspaceIdForKey(k, activeWs);
      let v = typeof entries[k] === 'string' ? entries[k] : JSON.stringify(entries[k]);
      // 敏感键:落库前加密,数据库不以明文存放
      if (isSensitiveKey(k)) v = encrypt(v);
      await db.run(
        'INSERT INTO app_settings (workspace_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [wsId, k, v, now]
      );
    }
    return sendJson(res, 200, { ok: true, written: keys.length });
  }

  async function deleteSettings(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'bad_json' });
    }
    // 支持 ?workspace=<id>:删除非当前工作空间时精确定位(如删除工作空间前的数据清理)
    let requestedWs = '';
    try {
      requestedWs = new URL(req.url || '/', 'http://localhost').searchParams.get('workspace') || '';
    } catch (e) {
      requestedWs = '';
    }
    const keys = Array.isArray(body && body.keys) ? body.keys : [];
    const activeWs = await resolveActiveWorkspace(requestedWs);
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(res, 403, { error: 'reserved_key', message: k + ' 为保留键' });
      }
      await db.run('DELETE FROM app_settings WHERE workspace_id = ? AND key = ?', [
        workspaceIdForKey(k, activeWs),
        k,
      ]);
    }
    return sendJson(res, 200, { ok: true, removed: keys.length });
  }

  return [
    {
      method: 'GET',
      path: '/api/settings',
      desc: '读取全部应用设置 KV(按工作空间隔离,敏感键解密返回)',
      handler: getSettings,
    },
    {
      method: 'PUT',
      path: '/api/settings',
      desc: '批量写入设置 KV({ settings: { key: value } },敏感键加密落库)',
      handler: putSettings,
    },
    {
      method: 'DELETE',
      path: '/api/settings',
      desc: '批量删除设置 KV({ keys: [ ... ] })',
      handler: deleteSettings,
    },
  ];
}

module.exports = settingsRoutes;
