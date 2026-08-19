/* ============================================================
 * hub/index.js — API Hub 核心(配置存取 + 公开/鉴权策略,Node / Worker 共用)
 * ------------------------------------------------------------
 * 职责:
 *   1. 存取 Hub 配置与密钥(独立表 apihub_config/apihub_history/apihub_logs,
 *      均按当前工作空间 workspace_id 隔离;旧版 settings:hub:* 惰性迁移):
 *        apihub_config    config 明文(分组/标签/路由覆盖/自定义路由/日志设置)
 *                        + secrets 加密落库(各路由的 API Key,键名含 secret → 敏感键)
 *        apihub_history   请求运行历史
 *        apihub_logs      请求访问日志(受条数上限/保留天数/排除规则驱动)
 *   2. 解析每个路由的生效策略:公开开关(含分组级联)/ 鉴权方式
 *   3. 按鉴权方式校验请求:
 *        none            无需鉴权(公开开关打开时)
 *        session         请求头 x-auth-token 会话(默认)
 *        bearer          Authorization: Bearer <token> 会话
 *        global-password 请求头 x-auth-password 与全局密码常量时间比较(兜底)
 *        api-key         请求头 x-api-key 与 Hub 中配置的密钥比较
 *
 * 运行时无关:
 *   - req 同时兼容 Node(req.headers[name])与 Worker(request.headers.get(name));
 *   - 密码 / API Key 比较通过注入的 matchesPassword(node:crypto timingSafeEqual);
 *   - verifyPassword 由各运行时注入(Node 读 process.env.AUTH_PASSWORD,
 *     Worker 读 env.AUTH_PASSWORD),未配置时抛错 → 返回 500 提示。
 * ============================================================ */
'use strict';

const { GLOBAL_WORKSPACE_ID } = require('../db/scope');
const { findSession } = require('../auth/session');

// 旧版 app_settings 存储键(仅用于惰性迁移;新数据落 apihub_* 独立表)
const HUB_CONFIG_KEY = 'settings:hub:config';
const HUB_SECRETS_KEY = 'settings:hub:secrets';
const HUB_HISTORY_KEY = 'settings:hub:history';
const HUB_LOGS_KEY = 'settings:hub:logs';
const LEGACY_HUB_KEYS = [HUB_CONFIG_KEY, HUB_SECRETS_KEY, HUB_HISTORY_KEY, HUB_LOGS_KEY];
/** 未设置活跃工作空间时的兜底(与前端默认工作空间一致) */
const DEFAULT_WORKSPACE_ID = 'ws-default';
const HISTORY_CAP = 50; // 历史条数上限(前端展示 20,服务端多留余量)

/** 默认日志配置:条数上限 / 保留天数 / 排除机器人 / 排除项目内部访问 */
const DEFAULT_LOGGING = {
  maxLogs: 500,
  retentionDays: 7,
  excludeBots: false,
  excludeInternal: true,
};

/** 常见机器人 / 爬虫 / 监测 UA 特征(排除机器人请求时命中即不记录) */
const BOT_RE =
  /(bot|crawl|spider|slurp|bingpreview|googlebot|baiduspider|yandex|duckduckbot|facebookexternalhit|pingdom|uptimerobot|monitor|headless|curl\/|wget|python-requests|go-http-client|axios\/|node-fetch)/i;

/** 项目内部管理接口:apihub 管理 / 设置 / 鉴权(排除项目内部访问时命中即不记录) */
function isInternalPath(pathname) {
  const p = String(pathname || '');
  return p.indexOf('/api/hub/') === 0 || p.indexOf('/api/settings') === 0 || p.indexOf('/api/auth/') === 0;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const AUTH_MODES = ['none', 'session', 'bearer', 'global-password', 'api-key'];

/** 默认配置:无分组/标签/覆盖,默认鉴权 = 会话令牌 */
function defaultConfig() {
  return {
    version: 1,
    defaults: { auth: 'session' },
    groups: [],
    tags: [],
    routes: {}, // "METHOD path" → 覆盖配置
    customRoutes: [],
    logging: Object.assign({}, DEFAULT_LOGGING),
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 解析 JSON 字符串;失败返回 fallback(绝不抛出) */
function parseJson(text, fallback) {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

function validId(id) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''));
}

/** 从 Node/Worker 两种请求对象中取请求头 */
function getHeader(req, name) {
  if (!req) return null;
  if (typeof req.headers.get === 'function') return req.headers.get(name);
  if (req.headers) {
    const v = req.headers[name.toLowerCase()];
    return v === undefined ? req.headers[name] : v;
  }
  return null;
}

/** Authorization: Bearer <token> 解析 */
function parseBearer(auth) {
  if (typeof auth !== 'string') return '';
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return m ? m[1] : '';
}

/**
 * @param {object} deps 依赖注入
 * @param {object} deps.db SQLite/Turso/D1 统一接口(get/run)
 * @param {function} deps.encrypt 敏感值加密
 * @param {function} deps.decrypt 敏感值解密
 * @param {function} deps.verifyPassword 校验全局密码(未配置 AUTH_PASSWORD 时抛错)
 * @param {function} [deps.matchesPassword] 常量时间比较(缺省回退 node:crypto)
 */
function createHub(deps) {
  const { db, encrypt, decrypt, verifyPassword } = deps;
  const safeEqual =
    deps.matchesPassword ||
    function (a, b) {
      try {
        const crypto = require('crypto');
        const x = Buffer.from(String(a));
        const y = Buffer.from(String(b));
        return x.length === y.length && crypto.timingSafeEqual(x, y);
      } catch (e) {
        return false;
      }
    };

  /** 解析当前活跃工作空间:读全局指针 settings:activeWorkspace,兜底默认工作空间 */
  async function resolveWorkspace() {
    const row = await db.get(
      "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
      [GLOBAL_WORKSPACE_ID]
    );
    return (row && row.value) || DEFAULT_WORKSPACE_ID;
  }

  /** 旧版 settings:hub:* → apihub_* 独立表惰性迁移(幂等;旧数据迁入当前工作空间) */
  let migrated = false;
  async function ensureMigrated() {
    if (migrated) return;
    migrated = true;
    try {
      const configRow = await db.get(
        'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
        [GLOBAL_WORKSPACE_ID, HUB_CONFIG_KEY]
      );
      if (!configRow) return; // 无旧数据
      const ws = await resolveWorkspace();
      const secretsRow = await db.get(
        'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
        [GLOBAL_WORKSPACE_ID, HUB_SECRETS_KEY]
      );
      await db.run(
        'INSERT INTO apihub_config (workspace_id, config, secrets, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET config = excluded.config, secrets = excluded.secrets, updated_at = excluded.updated_at',
        [ws, configRow.value, secretsRow ? secretsRow.value : '{}', new Date().toISOString()]
      );
      const historyRow = await db.get(
        'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
        [GLOBAL_WORKSPACE_ID, HUB_HISTORY_KEY]
      );
      if (historyRow) {
        const list = parseJson(historyRow.value, []);
        if (Array.isArray(list)) {
          for (const e of list) {
            const n = normalizeHistoryEntry(e);
            if (n) {
              await db.run(
                'INSERT INTO apihub_history (workspace_id, method, path, status, ts) VALUES (?, ?, ?, ?, ?)',
                [ws, n.method, n.path, n.status, n.ts]
              );
            }
          }
        }
      }
      const logsRow = await db.get(
        'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
        [GLOBAL_WORKSPACE_ID, HUB_LOGS_KEY]
      );
      if (logsRow) {
        const list = parseJson(logsRow.value, []);
        if (Array.isArray(list)) {
          for (const e of list) {
            const n = normalizeLogEntry(e);
            if (n) {
              await db.run(
                'INSERT INTO apihub_logs (workspace_id, method, path, status, ts, ip, ua, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [ws, n.method, n.path, n.status, n.ts, n.ip, n.ua, n.ms]
              );
            }
          }
        }
      }
      for (const k of LEGACY_HUB_KEYS) {
        await db.run('DELETE FROM app_settings WHERE workspace_id = ? AND key = ?', [GLOBAL_WORKSPACE_ID, k]);
      }
    } catch (e) {
      migrated = false; // 失败下次重试
      throw e;
    }
  }

  /** 校验单条历史:method/path/status/ts 合法才保留 */
  function normalizeHistoryEntry(e) {
    if (!isPlainObject(e)) return null;
    if (METHODS.indexOf(e.method) === -1) return null;
    if (typeof e.path !== 'string' || !e.path) return null;
    const status = Number(e.status);
    if (!Number.isFinite(status) || status < 0 || status > 599) return null;
    const ts = Number(e.ts);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return {
      method: String(e.method),
      path: String(e.path).slice(0, 500),
      status: Math.floor(status),
      ts: Math.floor(ts),
    };
  }

  /** 读请求历史(按工作空间过滤,ts 倒序,截断到上限) */
  async function loadHistory() {
    await ensureMigrated();
    const ws = await resolveWorkspace();
    const rows = await db.query(
      'SELECT method, path, status, ts FROM apihub_history WHERE workspace_id = ? ORDER BY ts DESC LIMIT ?',
      [ws, HISTORY_CAP]
    );
    return (rows || [])
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .slice(0, HISTORY_CAP);
  }

  /** 写请求历史(校验 + 去重同 ts + 截断上限;整表替换当前工作空间数据) */
  async function saveHistory(history) {
    await ensureMigrated();
    if (!Array.isArray(history)) throw new Error('需要 history 数组');
    const ws = await resolveWorkspace();
    const seen = {};
    const list = history
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .filter(function (e) {
        if (seen[e.ts]) return false;
        seen[e.ts] = true;
        return true;
      })
      .slice(0, HISTORY_CAP);
    await db.run('DELETE FROM apihub_history WHERE workspace_id = ?', [ws]);
    for (const e of list) {
      await db.run(
        'INSERT INTO apihub_history (workspace_id, method, path, status, ts) VALUES (?, ?, ?, ?, ?)',
        [ws, e.method, e.path, e.status, e.ts]
      );
    }
    return list;
  }

  /* ---------- 请求访问日志(配置驱动:条数上限 / 保留天数 / 排除机器人 / 排除内部) ---------- */

  /** 校验单条日志:method/path/status/ts 合法才保留(ip/ua/ms 可选) */
  function normalizeLogEntry(e) {
    if (!isPlainObject(e)) return null;
    if (METHODS.indexOf(e.method) === -1) return null;
    if (typeof e.path !== 'string' || !e.path) return null;
    const status = Number(e.status);
    if (!Number.isFinite(status) || status < 0 || status > 599) return null;
    const ts = Number(e.ts);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return {
      method: String(e.method),
      path: String(e.path).slice(0, 500),
      status: Math.floor(status),
      ts: Math.floor(ts),
      ip: typeof e.ip === 'string' ? String(e.ip).slice(0, 64) : '',
      ua: typeof e.ua === 'string' ? String(e.ua).slice(0, 200) : '',
      ms: Number.isFinite(Number(e.ms)) ? Math.max(0, Math.floor(Number(e.ms))) : 0,
    };
  }

  /** 读请求访问日志(按工作空间过滤 + 保留天数 + 条数上限,倒序返回) */
  async function loadLogs(cfg) {
    await ensureMigrated();
    const logging = (cfg && cfg.logging) || DEFAULT_LOGGING;
    const ws = await resolveWorkspace();
    const cutoff = Date.now() - (Number(logging.retentionDays) || 7) * 86400000;
    const rows = await db.query(
      'SELECT method, path, status, ts, ip, ua, ms FROM apihub_logs WHERE workspace_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?',
      [ws, cutoff, Number(logging.maxLogs) || 500]
    );
    return (rows || []).map(normalizeLogEntry).filter(Boolean);
  }

  /** 追加一条请求访问日志(INSERT → 清理过期与超出上限的旧行) */
  async function appendLog(entry, cfg) {
    await ensureMigrated();
    const clean = normalizeLogEntry(entry);
    if (!clean) return;
    const logging = (cfg && cfg.logging) || DEFAULT_LOGGING;
    const ws = await resolveWorkspace();
    await db.run(
      'INSERT INTO apihub_logs (workspace_id, method, path, status, ts, ip, ua, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ws, clean.method, clean.path, clean.status, clean.ts, clean.ip, clean.ua, clean.ms]
    );
    // 清理:保留天数 + 条数上限(保留最新 maxLogs 行)
    const cutoff = Date.now() - (Number(logging.retentionDays) || 7) * 86400000;
    const maxLogs = Number(logging.maxLogs) || 500;
    await db.run(
      'DELETE FROM apihub_logs WHERE workspace_id = ? AND (ts < ? OR id NOT IN (SELECT id FROM apihub_logs WHERE workspace_id = ? ORDER BY ts DESC LIMIT ?))',
      [ws, cutoff, ws, maxLogs]
    );
    return loadLogs(cfg);
  }

  /** 清空请求访问日志(当前工作空间) */
  async function clearLogs() {
    await ensureMigrated();
    const ws = await resolveWorkspace();
    await db.run('DELETE FROM apihub_logs WHERE workspace_id = ?', [ws]);
    return [];
  }

  /** 是否命中机器人 UA(排除机器人请求时使用) */
  function isBotUa(ua) {
    return typeof ua === 'string' && BOT_RE.test(ua);
  }

  /**
   * 判断某请求是否应记录日志(依据配置):
   *   excludeInternal → 项目内部管理接口(/api/hub /api/settings /api/auth)不记录
   *   excludeBots      → 机器人 / 爬虫 / 监测 UA 不记录
   */
  function shouldLogRequest(req, pathname, cfg) {
    const logging = (cfg && cfg.logging) || DEFAULT_LOGGING;
    if (logging.excludeInternal && isInternalPath(pathname)) return false;
    if (logging.excludeBots) {
      const ua = getHeader(req, 'user-agent');
      if (isBotUa(ua)) return false;
    }
    return true;
  }

  /** 从 Node req / Worker Request 提取客户端 IP(兼容两种形态) */
  function clientIp(req) {
    const h = getHeader(req, 'x-forwarded-for');
    if (typeof h === 'string' && h) return h.split(',')[0].trim();
    const cf = getHeader(req, 'cf-connecting-ip');
    if (typeof cf === 'string' && cf) return cf;
    if (req && req.socket && req.socket.remoteAddress) return String(req.socket.remoteAddress);
    return '';
  }

  /** 读全量状态:config + secrets(secrets 解密失败回退 {};按当前工作空间) */
  async function loadAll() {
    await ensureMigrated();
    const ws = await resolveWorkspace();
    const row = await db.get('SELECT config, secrets FROM apihub_config WHERE workspace_id = ?', [ws]);
    let config = parseJson(row && row.config, null);
    if (!config || !isPlainObject(config)) config = defaultConfig();
    config = normalizeConfig(config);
    const secrets = row && row.secrets ? parseJson(decrypt(row.secrets), {}) : {};
    if (!isPlainObject(secrets)) return { config, secrets: {} };
    if (!isPlainObject(secrets.apiKeys)) secrets.apiKeys = {};
    return { config, secrets };
  }

  /** 校验并规范化配置(补默认值 / 清洗非法字段 / 分组公开级联) */
  function normalizeConfig(input) {
    const cfg = defaultConfig();
    if (isPlainObject(input)) {
      if (isPlainObject(input.defaults)) {
        const auth = input.defaults.auth;
        if (AUTH_MODES.indexOf(auth) !== -1) cfg.defaults.auth = auth;
      }
      if (Array.isArray(input.groups)) {
        cfg.groups = input.groups
          .filter(function (g) {
            return isPlainObject(g) && validId(g.id) && typeof g.name === 'string' && g.name.trim();
          })
          .map(function (g) {
            return {
              id: String(g.id),
              name: String(g.name).trim().slice(0, 50),
              parentId: validId(g.parentId) ? String(g.parentId) : '',
              public: !!g.public,
              sort: Number(g.sort) || 0,
              icon: typeof g.icon === 'string' ? String(g.icon).slice(0, 16) : '',
              color:
                typeof g.color === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-z][a-z0-9-]{0,20})$/.test(g.color)
                  ? String(g.color).slice(0, 24)
                  : '',
            };
          });
      }
      if (Array.isArray(input.tags)) {
        cfg.tags = input.tags
          .filter(function (t) {
            return isPlainObject(t) && validId(t.id) && typeof t.name === 'string' && t.name.trim();
          })
          .map(function (t) {
            return {
              id: String(t.id),
              name: String(t.name).trim().slice(0, 40),
              parentId: validId(t.parentId) ? String(t.parentId) : '',
              sort: Number(t.sort) || 0,
              icon: typeof t.icon === 'string' ? String(t.icon).slice(0, 16) : '',
              color:
                typeof t.color === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-z][a-z0-9-]{0,20})$/.test(t.color)
                  ? String(t.color).slice(0, 24)
                  : '',
            };
          });
      }
      if (isPlainObject(input.routes)) {
        Object.keys(input.routes).forEach(function (key) {
          const ov = input.routes[key];
          if (!isPlainObject(ov)) return;
          const clean = {};
          if (typeof ov.name === 'string' && ov.name.trim()) clean.name = ov.name.trim().slice(0, 60);
          if (typeof ov.desc === 'string' && ov.desc.trim())
            clean.desc = ov.desc.trim().slice(0, 200);
          if (AUTH_MODES.indexOf(ov.auth) !== -1) clean.auth = ov.auth;
          clean.public = !!ov.public;
          clean.favorite = !!ov.favorite;
          clean.pinned = !!ov.pinned;
          clean.groupIds = Array.isArray(ov.groupIds)
            ? ov.groupIds.filter(validId).map(String).slice(0, 20)
            : [];
          clean.tagIds = Array.isArray(ov.tagIds)
            ? ov.tagIds.filter(validId).map(String).slice(0, 20)
            : [];
          cfg.routes[key] = clean;
        });
      }
      if (Array.isArray(input.customRoutes)) {
        cfg.customRoutes = input.customRoutes
          .filter(function (c) {
            return (
              isPlainObject(c) &&
              validId(c.id) &&
              METHODS.indexOf(c.method) !== -1 &&
              typeof c.path === 'string' &&
              isValidPath(c.path)
            );
          })
          .map(function (c) {
            return {
              id: String(c.id),
              method: String(c.method),
              path: normalizePath(c.path),
              name: typeof c.name === 'string' ? c.name.trim().slice(0, 60) : '',
              desc: typeof c.desc === 'string' ? c.desc.trim().slice(0, 200) : '',
              responseType: c.responseType === 'static' ? 'static' : 'echo',
              staticStatus: Number(c.staticStatus) >= 100 && Number(c.staticStatus) <= 599
                ? Number(c.staticStatus)
                : 200,
              staticBody: c.responseType === 'static' ? c.staticBody : null,
              auth: AUTH_MODES.indexOf(c.auth) !== -1 ? c.auth : '',
              public: !!c.public,
              favorite: !!c.favorite,
              pinned: !!c.pinned,
              groupIds: Array.isArray(c.groupIds) ? c.groupIds.filter(validId).map(String).slice(0, 20) : [],
              tagIds: Array.isArray(c.tagIds) ? c.tagIds.filter(validId).map(String).slice(0, 20) : [],
            };
          });
      }
      if (isPlainObject(input.logging)) {
        const lg = Object.assign({}, DEFAULT_LOGGING);
        const maxLogs = Number(input.logging.maxLogs);
        lg.maxLogs = Number.isFinite(maxLogs) ? Math.max(10, Math.min(10000, Math.floor(maxLogs))) : DEFAULT_LOGGING.maxLogs;
        const retentionDays = Number(input.logging.retentionDays);
        lg.retentionDays = Number.isFinite(retentionDays)
          ? Math.max(1, Math.min(365, Math.floor(retentionDays)))
          : DEFAULT_LOGGING.retentionDays;
        lg.excludeBots = !!input.logging.excludeBots;
        lg.excludeInternal = !!input.logging.excludeInternal;
        cfg.logging = lg;
      }
    }
    return cascadeGroupPublic(cfg);
  }

  /** 校验自定义路由路径:必须以 / 开头、不含 .. 段、不含查询串 */
  function isValidPath(p) {
    if (typeof p !== 'string') return false;
    if (p.charAt(0) !== '/') return false;
    if (p.indexOf('?') !== -1 || p.indexOf('#') !== -1) return false;
    return p.split('/').indexOf('..') === -1;
  }

  function normalizePath(p) {
    let out = p.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
    return out || '/';
  }

  /** 分组公开级联:父分组公开 → 全部子孙分组强制公开(存储层保证 UI 与运行一致) */
  function cascadeGroupPublic(cfg) {
    const byId = {};
    cfg.groups.forEach(function (g) {
      byId[g.id] = g;
    });
    // 多次遍历直到稳定(多级嵌套)
    let changed = true;
    while (changed) {
      changed = false;
      cfg.groups.forEach(function (g) {
        if (!g.public && g.parentId && byId[g.parentId] && byId[g.parentId].public) {
          g.public = true;
          changed = true;
        }
      });
    }
    return cfg;
  }

  /** 校验请求中的 key 与给定期望值常量时间比较 */
  function keyMatches(actual, expected) {
    if (typeof actual !== 'string' || !actual || typeof expected !== 'string' || !expected) {
      return false;
    }
    return safeEqual(actual, expected);
  }

  /** 分组(含祖先链)是否公开:任一祖先公开则该组公开 */
  function groupIsPublic(id, cfg) {
    const byId = {};
    cfg.groups.forEach(function (g) {
      byId[g.id] = g;
    });
    const seen = {};
    let cur = byId[id];
    while (cur && !seen[cur.id]) {
      seen[cur.id] = true;
      if (cur.public) return true;
      cur = cur.parentId ? byId[cur.parentId] : null;
    }
    return false;
  }

  /**
   * 计算路由生效策略。
   * @param {string} key "METHOD path"(内置路由)或自定义路由 id
   * @param {object|null} customRoute 自定义路由对象
   * @param {object} cfg 规范化后的配置
   * @returns {{ public: boolean, auth: string, isHubMgmt: boolean }}
   */
  function policyFor(key, customRoute, cfg) {
    const isHubMgmt = key.indexOf('/api/hub/') !== -1;
    if (isHubMgmt) return { public: false, auth: 'session', isHubMgmt: true };

    if (customRoute) {
      const pub =
        customRoute.public ||
        (customRoute.groupIds || []).some(function (gid) {
          return groupIsPublic(gid, cfg);
        });
      return {
        public: pub,
        auth: pub ? 'none' : customRoute.auth || cfg.defaults.auth || 'session',
        isHubMgmt: false,
      };
    }

    const ov = cfg.routes[key];
    const pub =
      !!(ov && ov.public) ||
      ((ov && ov.groupIds) || []).some(function (gid) {
        return groupIsPublic(gid, cfg);
      });
    return {
      public: pub,
      auth: pub ? 'none' : (ov && ov.auth) || cfg.defaults.auth || 'session',
      isHubMgmt: false,
    };
  }

  /** 取某路由的 API Key(自定义路由优先 'cr:<id>',回退到路由键) */
  function apiKeyFor(routeKey, customId, secrets) {
    const keys = (secrets && isPlainObject(secrets.apiKeys) ? secrets.apiKeys : {}) || {};
    if (customId && typeof keys['cr:' + customId] === 'string') return keys['cr:' + customId];
    return typeof keys[routeKey] === 'string' ? keys[routeKey] : '';
  }

  /**
   * 按策略校验请求。成功返回 { ok: true, session },失败返回 { ok:false, status, error, message }。
   * @param {object} req Node req / Worker Request
   * @param {string} routeKey "METHOD path"
   * @param {{ auth: string, customId?: string }} opts
   * @param {{ config: object, secrets: object }} state loadAll() 的结果
   */
  async function authorize(req, routeKey, opts, state) {
    const mode = opts.auth || 'session';
    const cfg = state.config;
    const secrets = state.secrets;

    if (mode === 'none') return { ok: true, session: null };

    if (mode === 'global-password') {
      const pwd = getHeader(req, 'x-auth-password');
      if (typeof pwd !== 'string' || !pwd) {
        return {
          ok: false,
          status: 401,
          error: 'unauthorized',
          message: '该路由使用全局密码鉴权,需要请求头 x-auth-password',
        };
      }
      try {
        if (!verifyPassword(pwd)) {
          return { ok: false, status: 401, error: 'unauthorized', message: '全局密码错误' };
        }
      } catch (e) {
        return {
          ok: false,
          status: 500,
          error: 'no_auth_password',
          message: String((e && e.message) || e),
        };
      }
      return { ok: true, session: null };
    }

    if (mode === 'api-key') {
      const key = getHeader(req, 'x-api-key');
      const expected = apiKeyFor(routeKey, opts.customId, secrets);
      if (typeof key !== 'string' || !key || !expected) {
        return {
          ok: false,
          status: 401,
          error: 'unauthorized',
          message: '该路由使用 API Key 鉴权,需要请求头 x-api-key(请在 API Hub 中配置密钥)',
        };
      }
      if (!keyMatches(key, expected)) {
        return { ok: false, status: 401, error: 'unauthorized', message: 'API Key 无效' };
      }
      return { ok: true, session: null };
    }

    // session / bearer:均解析为会话令牌
    const token =
      mode === 'bearer'
        ? parseBearer(getHeader(req, 'authorization'))
        : typeof getHeader(req, 'x-auth-token') === 'string'
          ? getHeader(req, 'x-auth-token')
          : '';
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      return {
        ok: false,
        status: 401,
        error: 'unauthorized',
        message: '登录已失效,请重新登录',
      };
    }
    return { ok: true, session };
  }

  /** 保存配置与密钥(校验 + 公开级联 + 写库;密钥加密落库) */
  async function saveAll(payload) {
    if (!isPlainObject(payload)) throw new Error('需要 { config, secrets }');
    const cfg = normalizeConfig(payload.config);
    // 自定义路由不得与内置路由重名(避免覆盖管理接口 / 歧义)
    const staticKeys = deps.staticRouteKeys || [];
    for (const c of cfg.customRoutes) {
      const key = c.method + ' ' + c.path;
      if (staticKeys.indexOf(key) !== -1) {
        throw new Error('自定义路由 ' + key + ' 与内置路由冲突');
      }
    }
    const secrets = isPlainObject(payload.secrets) ? payload.secrets : {};
    const apiKeys = isPlainObject(secrets.apiKeys) ? secrets.apiKeys : {};
    const cleanKeys = {};
    Object.keys(apiKeys).forEach(function (k) {
      if (typeof apiKeys[k] === 'string' && apiKeys[k]) cleanKeys[k] = apiKeys[k].slice(0, 256);
    });
    const cleanSecrets = { apiKeys: cleanKeys };

    await ensureMigrated();
    const ws = await resolveWorkspace();
    await db.run(
      'INSERT INTO apihub_config (workspace_id, config, secrets, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET config = excluded.config, secrets = excluded.secrets, updated_at = excluded.updated_at',
      [ws, JSON.stringify(cfg), encrypt(JSON.stringify(cleanSecrets)), new Date().toISOString()]
    );
    return { config: cfg, secrets: cleanSecrets };
  }

  /** 自定义路由执行:echo(回显请求)/ static(固定响应) */
  async function handleCustom(customRoute, req, res, sendJsonFn) {
    if (customRoute.responseType === 'static') {
      return sendJsonFn(res, customRoute.staticStatus || 200, customRoute.staticBody || { ok: true });
    }
    // echo:回显方法 / 路径 / 查询参数 / 请求头(去敏感) / 请求体
    let rawBody = '';
    if (typeof req.on === 'function') {
      rawBody = await new Promise(function (resolve) {
        let data = '';
        req.on('data', function (c) {
          data += c;
          if (data.length > 1e6) data = data.slice(0, 1e6);
        });
        req.on('end', function () {
          resolve(data);
        });
        req.on('error', function () {
          resolve('');
        });
      });
    } else if (typeof req.text === 'function') {
      try {
        rawBody = await req.text();
      } catch (e) {
        rawBody = '';
      }
    }
    let parsedBody = null;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (e) {
        parsedBody = rawBody;
      }
    }
    const url = new URL(req.url || '/', 'http://localhost');
    const query = {};
    url.searchParams.forEach(function (v, k) {
      query[k] = v;
    });
    const headers = {};
    // Node:req.headers 对象;Worker:headers.entries()
    if (req.headers && typeof req.headers.entries === 'function') {
      req.headers.forEach(function (v, k) {
        headers[k] = v;
      });
    } else if (req.headers) {
      Object.keys(req.headers).forEach(function (k) {
        headers[k] = req.headers[k];
      });
    }
    // 不原样回显敏感请求头
    ['authorization', 'x-auth-token', 'x-auth-password', 'x-api-key', 'cookie'].forEach(function (h) {
      delete headers[h];
    });
    return sendJsonFn(res, 200, {
      method: customRoute.method,
      path: customRoute.path,
      query: query,
      headers: headers,
      body: parsedBody === null ? undefined : parsedBody,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    HUB_CONFIG_KEY,
    HUB_SECRETS_KEY,
    HUB_HISTORY_KEY,
    HUB_LOGS_KEY,
    AUTH_MODES,
    METHODS,
    DEFAULT_LOGGING,
    defaultConfig,
    normalizeConfig,
    loadAll,
    saveAll,
    loadHistory,
    saveHistory,
    loadLogs,
    appendLog,
    clearLogs,
    shouldLogRequest,
    isBotUa,
    clientIp,
    policyFor,
    authorize,
    handleCustom,
    groupIsPublic,
  };
}

module.exports = {
  createHub,
  defaultConfig,
  AUTH_MODES,
  DEFAULT_LOGGING,
  HUB_CONFIG_KEY,
  HUB_SECRETS_KEY,
  HUB_HISTORY_KEY,
  HUB_LOGS_KEY,
};
