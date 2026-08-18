/* ============================================================
 * routes/settings.js — 全局设置 KV API 路由
 * ------------------------------------------------------------
 * GET    /api/settings   返回全部 app_settings(敏感键解密后返回)
 * PUT    /api/settings   批量写入(敏感键加密后落库)
 * DELETE /api/settings   批量删除
 * 保留键 settings:auth:* 禁止读写;依赖由 server/api/index.js
 * 注入 { db, encrypt, decrypt }。
 * ============================================================ */
'use strict';

const { sendJson, readBody } = require('../../http/json');
const { RESERVED_SETTINGS_PREFIX, isSensitiveKey } = require('../../security/sensitive');

function settingsRoutes({ db, encrypt, decrypt }) {
  async function getSettings(req, res) {
    const rows = await db.query('SELECT key, value FROM app_settings ORDER BY key');
    const out = {};
    rows.forEach((r) => {
      if (r.key.indexOf(RESERVED_SETTINGS_PREFIX) === 0) return;
      out[r.key] = isSensitiveKey(r.key) ? (decrypt(r.value) || '') : r.value;
    });
    return sendJson(res, 200, out);
  }

  async function putSettings(req, res) {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
    const entries = body && typeof body.settings === 'object' ? body.settings : null;
    if (!entries) return sendJson(res, 400, { error: 'bad_body', message: '需要 { settings: {...} }' });

    const keys = Object.keys(entries);
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(res, 403, { error: 'reserved_key', message: k + ' 为保留键,请走专用鉴权接口' });
      }
    }

    const now = new Date().toISOString();
    for (const k of keys) {
      let v = typeof entries[k] === 'string' ? entries[k] : JSON.stringify(entries[k]);
      // 敏感键:落库前加密,数据库不以明文存放
      if (isSensitiveKey(k)) v = encrypt(v);
      await db.run(
        'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [k, v, now],
      );
    }
    return sendJson(res, 200, { ok: true, written: keys.length });
  }

  async function deleteSettings(req, res) {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
    const keys = Array.isArray(body && body.keys) ? body.keys : [];
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(res, 403, { error: 'reserved_key', message: k + ' 为保留键' });
      }
      await db.run('DELETE FROM app_settings WHERE key = ?', [k]);
    }
    return sendJson(res, 200, { ok: true, removed: keys.length });
  }

  return [
    { method: 'GET', path: '/api/settings', handler: getSettings },
    { method: 'PUT', path: '/api/settings', handler: putSettings },
    { method: 'DELETE', path: '/api/settings', handler: deleteSettings },
  ];
}

module.exports = settingsRoutes;
