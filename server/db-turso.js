/* ============================================================
 * db-turso.js — 远程 Turso/libSQL 驱动(HTTP v2 pipeline API)
 * ------------------------------------------------------------
 * 通过 libsql server 的 HTTP 接口访问远程数据库(与本地 sqlite 同一接口):
 *   DB_DRIVER=turso
 *   DATABASE_URL=https://<db>-<org>.turso.io
 *   DATABASE_AUTH_TOKEN=<token>
 * 依赖全局 fetch(Node >= 18)。部署到 Vercel/Cloudflare 时可将
 * 同样的 SQL 与命名规范用于 D1(新增一个 adapter 即可,见 README)。
 * 注意:参数绑定按位置数组,args 形状为 [{ type, value }]。
 * ============================================================ */
'use strict';

function init(opts) {
  const baseUrl = (process.env.DATABASE_URL || '').replace(/\/+$/, '');
  const token = process.env.DATABASE_AUTH_TOKEN || '';
  if (!baseUrl) {
    throw new Error('[db-turso] 缺少 DATABASE_URL(如 https://<db>-<org>.turso.io)');
  }
  const endpoint = baseUrl + '/v2/pipeline';

  function bindArgs(params) {
    return (params || []).map(function (p) {
      if (p === null || p === undefined) return { type: 'null', value: null };
      if (typeof p === 'number') return { type: 'integer', value: p };
      return { type: 'text', value: String(p) };
    });
  }

  function rowsFrom(result) {
    // { type: 'execute', response: { cols: [{name,decltype}], rows: [[v,..],..] } }
    const resp = result && result.response;
    if (!resp || !Array.isArray(resp.cols)) return [];
    return resp.rows.map(function (row) {
      const obj = {};
      resp.cols.forEach(function (col, i) {
        const v = row[i];
        obj[col.name] = v === null ? null : v;
      });
      return obj;
    });
  }

  async function pipeline(requests) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ requests }),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error('[db-turso] HTTP ' + r.status + ': ' + text.slice(0, 300));
    }
    const body = await r.json();
    const results = Array.isArray(body) ? body : body.results;
    if (!Array.isArray(results)) {
      throw new Error('[db-turso] 响应格式异常: ' + JSON.stringify(body).slice(0, 300));
    }
    return results;
  }

  return {
    name: 'turso',
    path: baseUrl,

    async query(sql, params) {
      const results = await pipeline([
        { type: 'execute', stmt: { sql, args: bindArgs(params) } },
      ]);
      return rowsFrom(results[0]);
    },

    async get(sql, params) {
      const rows = await this.query(sql, params);
      return rows.length ? rows[0] : null;
    },

    async run(sql, params) {
      const results = await pipeline([
        { type: 'execute', stmt: { sql, args: bindArgs(params) } },
      ]);
      const resp = results[0] && results[0].response;
      return {
        changes: (resp && Number(resp.rows_affected || 0)) || 0,
        lastInsertRowid: (resp && Number(resp.last_insert_rowid || 0)) || 0,
      };
    },

    /** 建表(远程驱动初始化时执行) */
    async initSchema(schema) {
      const statements = schema
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sql of statements) {
        await this.run(sql + ';');
      }
    },
  };
}

module.exports = { init };
