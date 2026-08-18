/* ============================================================
 * apihub 模块 — 实现(懒加载,首次访问 /apihub 时下载)
 * ------------------------------------------------------------
 * API Hub 管理台,三栏工作区:
 *   左栏  分组(多级)/ 多级标签 / 默认鉴权设置
 *   中栏  全部 API 路由(自动发现):搜索 / 收藏 / 置顶 /
 *         公开开关 / 分组 / 标签 / 自定义路由 / 复制分享链接
 *   右栏  请求构建器 + 响应查看(状态/耗时/大小/JSON 美化/
 *         语法高亮/复制/最近运行历史)
 * 服务端配合 server/hub/index.js:公开开关与鉴权方式真正生效于
 * 每次 API 请求的门禁,而不只是前端展示。
 * 只依赖核心层 App.ui / App.icon / App.i18n / App.api / ctx。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 状态 ---------- */
  var state = {
    routes: [],
    config: null,
    secrets: { apiKeys: {} },
    loaded: false,
    error: null,
  };
  var view = {
    search: '',
    groupFilter: null,
    tagFilter: null,
    favOnly: false,
    pubOnly: false,
    customOnly: false,
    selected: null,
    runTab: 'params',
    resView: 'pretty',
    req: { method: 'GET', path: '', params: [{ k: '', v: '' }], headers: [{ k: '', v: '' }], body: '' },
    running: false,
    run: null,
    history: [],
    expandedGroups: {},
    expandedTags: {},
    lastHashSel: null,
  };
  var saveTimer = null;
  var dialogMethod = 'GET';

  /* ---------- 工具 ---------- */
  function icon(name, cls) {
    return App.icon.iconSvg(name, { class: cls || 'size-4' });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escAttr(s) {
    return esc(s);
  }
  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function routeKeyOf(r) {
    return r.builtIn ? r.method + ' ' + r.path : 'cr:' + r.id;
  }
  function findRoute(key) {
    for (var i = 0; i < state.routes.length; i++) {
      if (routeKeyOf(state.routes[i]) === key) return state.routes[i];
    }
    return null;
  }
  function overrideOf(key) {
    if (!state.config.routes[key]) state.config.routes[key] = {};
    return state.config.routes[key];
  }
  function customById(id) {
    var list = state.config.customRoutes || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function memberships(key, r) {
    if (r && !r.builtIn) {
      var c = customById(r.id);
      return {
        groupIds: (c && c.groupIds) || [],
        tagIds: (c && c.tagIds) || [],
        favorite: !!(c && c.favorite),
        pinned: !!(c && c.pinned),
        auth: (c && c.auth) || '',
        name: (c && c.name) || '',
        desc: (c && c.desc) || '',
        public: !!(c && c.public),
      };
    }
    var ov = state.config.routes[key] || {};
    return {
      groupIds: ov.groupIds || [],
      tagIds: ov.tagIds || [],
      favorite: !!ov.favorite,
      pinned: !!ov.pinned,
      auth: ov.auth || '',
      name: ov.name || '',
      desc: ov.desc || '',
      public: !!ov.public,
    };
  }
  function groupById(id) {
    var g = state.config.groups || [];
    for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
    return null;
  }
  function tagById(id) {
    var t = state.config.tags || [];
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return null;
  }
  /** 分组(含祖先)是否公开:任一祖先公开则该组公开(与 server/hub 一致) */
  function groupPublic(id) {
    var seen = {};
    var cur = groupById(id);
    while (cur && !seen[cur.id]) {
      seen[cur.id] = true;
      if (cur.public) return true;
      cur = cur.parentId ? groupById(cur.parentId) : null;
    }
    return false;
  }
  /** 路由是否公开:内置强制公开(登录) / 自身开关 / 所在分组(含祖先)公开 */
  function isPublic(key, r) {
    if (r && r.builtIn && r.public) return true;
    var m = memberships(key, r);
    if (m.public) return true;
    if (m.groupIds.some(function (gid) { return groupPublic(gid); })) return true;
    return false;
  }
  /** 路由生效鉴权方式:公开 → none;否则 自身设置 或 默认 */
  function authMode(key, r) {
    if (isPublic(key, r)) return 'none';
    var m = memberships(key, r);
    if (m.auth) return m.auth;
    return (state.config.defaults && state.config.defaults.auth) || 'session';
  }
  function authLabel(mode) {
    return t('apihub.authMode.' + mode);
  }
  function hasBody(method) {
    return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  }
  function descendants(nodes, id) {
    var out = [id];
    var changed = true;
    while (changed) {
      changed = false;
      nodes.forEach(function (n) {
        if (out.indexOf(n.id) === -1 && out.indexOf(n.parentId) !== -1) {
          out.push(n.id);
          changed = true;
        }
      });
    }
    return out;
  }
  function treeChildren(nodes, parentId) {
    return nodes
      .filter(function (n) {
        return (n.parentId || '') === (parentId || '');
      })
      .sort(function (a, b) {
        return (a.sort || 0) - (b.sort || 0) || (a.name || '').localeCompare(b.name || '');
      });
  }
  function rowsToObj(rows) {
    var out = {};
    (rows || []).forEach(function (row) {
      var k = String(row.k || '').trim();
      if (k) out[k] = String(row.v == null ? '' : row.v);
    });
    return out;
  }

  function moduleT() {
    var locale = App.getShellContext ? App.getShellContext().settings.locale : 'zh-CN';
    return App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.apihub);
  }
  var t = function (k) {
    return moduleT()(k);
  };
  function tpl(k, sub) {
    var s = t(k);
    Object.keys(sub || {}).forEach(function (key) {
      s = s.split('{' + key + '}').join(sub[key]);
    });
    return s;
  }

  /* ---------- 数据加载 ---------- */
  function load() {
    App.api
      .get('/api/hub/state')
      .then(function (data) {
        state.routes = data.routes || [];
        state.config = data.config || null;
        state.secrets = data.secrets || { apiKeys: {} };
        if (!state.config) {
          state.config = {
            version: 1,
            defaults: { auth: 'session' },
            groups: [],
            tags: [],
            routes: {},
            customRoutes: [],
          };
        }
        if (!state.config.defaults) state.config.defaults = { auth: 'session' };
        if (!state.config.routes) state.config.routes = {};
        if (!state.config.customRoutes) state.config.customRoutes = [];
        if (!state.secrets.apiKeys) state.secrets.apiKeys = {};
        state.loaded = true;
        state.error = null;
        applyHashSelection();
        renderFull();
      })
      .catch(function (e) {
        state.error = e && e.message ? e.message : 'failed';
        renderFull();
      });
  }

  /** 深链:打开 #/apihub?r=<key> 时自动选中对应路由 */
  function applyHashSelection() {
    var h = window.location.hash || '';
    var m = /[?&]r=([^&]+)/.exec(h);
    if (!m) {
      view.lastHashSel = null;
      return;
    }
    var key = decodeURIComponent(m[1]);
    if (key === view.lastHashSel) return;
    view.lastHashSel = key;
    var r = findRoute(key);
    if (r) selectRoute(key, r, true);
  }

  /* ---------- 持久化(防抖) ---------- */
  function persist() {
    if (!state.loaded) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      App.api
        .put('/api/hub/config', { config: state.config, secrets: state.secrets })
        .then(function () {
          App.ui.toast(t('apihub.saved'));
        })
        .catch(function (e) {
          App.ui.toast((e && e.data && e.data.message) || t('apihub.saveFailed'), 'error');
        });
    }, 300);
  }

  /* ---------- 配置变更操作 ---------- */
  function patchRoute(key, patch) {
    overrideOf(key);
    Object.keys(patch).forEach(function (k) {
      state.config.routes[key][k] = patch[k];
    });
    persist();
  }
  function patchCustom(id, patch) {
    var c = customById(id);
    if (!c) return;
    Object.keys(patch).forEach(function (k) {
      c[k] = patch[k];
    });
    persist();
  }
  function toggleRoutePublic(key) {
    var r = findRoute(key);
    if (r && r.builtIn && r.public) return; // 内置强制公开路由(登录)不可关闭
    var next = !memberships(key, r).public;
    if (r && !r.builtIn) patchCustom(r.id, { public: next });
    else patchRoute(key, { public: next });
    renderFull();
  }
  function toggleFav(key) {
    var r = findRoute(key);
    if (r && !r.builtIn) patchCustom(r.id, { favorite: !customById(r.id).favorite });
    else patchRoute(key, { favorite: !memberships(key, r).favorite });
    renderFull();
  }
  function togglePin(key) {
    var r = findRoute(key);
    if (r && !r.builtIn) patchCustom(r.id, { pinned: !customById(r.id).pinned });
    else patchRoute(key, { pinned: !memberships(key, r).pinned });
    renderFull();
  }
  function toggleRouteGroup(key, gid) {
    var r = findRoute(key);
    var m = memberships(key, r);
    var next = m.groupIds.slice();
    var idx = next.indexOf(gid);
    if (idx === -1) next.push(gid);
    else next.splice(idx, 1);
    if (r && !r.builtIn) patchCustom(r.id, { groupIds: next });
    else patchRoute(key, { groupIds: next });
    closeDropdowns();
    renderFull();
  }
  function toggleRouteTag(key, tid) {
    var r = findRoute(key);
    var m = memberships(key, r);
    var next = m.tagIds.slice();
    var idx = next.indexOf(tid);
    if (idx === -1) next.push(tid);
    else next.splice(idx, 1);
    if (r && !r.builtIn) patchCustom(r.id, { tagIds: next });
    else patchRoute(key, { tagIds: next });
    closeDropdowns();
    renderFull();
  }

  function addGroup(name, parentId) {
    var g = state.config.groups;
    g.push({ id: uid('g'), name: name, parentId: parentId || '', public: false, sort: g.length });
    persist();
    renderFull();
  }
  function renameGroup(id, name) {
    var g = groupById(id);
    if (g) {
      g.name = name;
      persist();
      renderFull();
    }
  }
  function deleteGroup(id) {
    var g = state.config.groups;
    var removeIds = descendants(g, id);
    state.config.groups = g.filter(function (x) {
      return removeIds.indexOf(x.id) === -1;
    });
    [state.config.routes, state.config.customRoutes].forEach(function (coll) {
      if (!coll) return;
      if (Array.isArray(coll)) {
        coll.forEach(function (c) {
          c.groupIds = (c.groupIds || []).filter(function (gid) {
            return removeIds.indexOf(gid) === -1;
          });
        });
      } else {
        Object.keys(coll).forEach(function (key) {
          coll[key].groupIds = (coll[key].groupIds || []).filter(function (gid) {
            return removeIds.indexOf(gid) === -1;
          });
        });
      }
    });
    if (view.groupFilter && removeIds.indexOf(view.groupFilter) !== -1) view.groupFilter = null;
    persist();
    renderFull();
  }
  function toggleGroupPublic(id) {
    var g = groupById(id);
    if (!g) return;
    var on = !g.public;
    g.public = on;
    if (on) {
      // 父级公开 → 全部子孙组强制公开(与 server 端级联一致)
      descendants(state.config.groups, id).forEach(function (did) {
        var d = groupById(did);
        if (d) d.public = true;
      });
    }
    persist();
    renderFull();
  }

  function addTag(name, parentId) {
    var tags = state.config.tags;
    tags.push({ id: uid('t'), name: name, parentId: parentId || '', sort: tags.length });
    persist();
    renderFull();
  }
  function renameTag(id, name) {
    var tg = tagById(id);
    if (tg) {
      tg.name = name;
      persist();
      renderFull();
    }
  }
  function deleteTag(id) {
    var tags = state.config.tags;
    var removeIds = descendants(tags, id);
    state.config.tags = tags.filter(function (x) {
      return removeIds.indexOf(x.id) === -1;
    });
    [state.config.routes, state.config.customRoutes].forEach(function (coll) {
      if (!coll) return;
      if (Array.isArray(coll)) {
        coll.forEach(function (c) {
          c.tagIds = (c.tagIds || []).filter(function (tid) {
            return removeIds.indexOf(tid) === -1;
          });
        });
      } else {
        Object.keys(coll).forEach(function (key) {
          coll[key].tagIds = (coll[key].tagIds || []).filter(function (tid) {
            return removeIds.indexOf(tid) === -1;
          });
        });
      }
    });
    if (view.tagFilter && removeIds.indexOf(view.tagFilter) !== -1) view.tagFilter = null;
    persist();
    renderFull();
  }

  function setRouteAuth(key, mode) {
    var r = findRoute(key);
    if (r && !r.builtIn) patchCustom(r.id, { auth: mode });
    else patchRoute(key, { auth: mode });
    persist();
  }
  function setRouteApiKey(key, value) {
    var r = findRoute(key);
    var secretKey = r && !r.builtIn ? 'cr:' + r.id : key;
    if (value) state.secrets.apiKeys[secretKey] = value;
    else delete state.secrets.apiKeys[secretKey];
    persist();
  }
  function apiKeyOf(key) {
    var r = findRoute(key);
    var secretKey = r && !r.builtIn ? 'cr:' + r.id : key;
    return state.secrets.apiKeys[secretKey] || state.secrets.defaultApiKey || '';
  }

  function setDefaultAuth(mode) {
    state.config.defaults = state.config.defaults || {};
    state.config.defaults.auth = mode;
    persist();
    renderFull();
  }
  function setDefaultApiKey(value) {
    if (value) state.secrets.defaultApiKey = value;
    else delete state.secrets.defaultApiKey;
    persist();
  }

  function addCustomRoute(data) {
    state.config.customRoutes.push({
      id: uid('cr'),
      method: data.method,
      path: data.path,
      name: data.name || '',
      desc: data.desc || '',
      responseType: data.responseType || 'echo',
      staticStatus: data.staticStatus || 200,
      staticBody: data.staticBody,
      auth: '',
      public: false,
      favorite: false,
      pinned: false,
      groupIds: [],
      tagIds: [],
    });
    persist();
    renderFull();
  }
  function updateCustomRoute(id, data) {
    var c = customById(id);
    if (!c) return;
    c.method = data.method;
    c.path = data.path;
    c.name = data.name || '';
    c.desc = data.desc || '';
    c.responseType = data.responseType || 'echo';
    c.staticStatus = data.staticStatus || 200;
    c.staticBody = data.staticBody;
    persist();
    renderFull();
  }
  function deleteCustomRoute(id) {
    state.config.customRoutes = state.config.customRoutes.filter(function (c) {
      return c.id !== id;
    });
    if (view.selected === 'cr:' + id) {
      view.selected = null;
      view.run = null;
    }
    persist();
    renderFull();
  }

  /* ---------- 路由选择 + 运行 ---------- */
  function selectRoute(key, r, silent) {
    r = r || findRoute(key);
    if (!r) return;
    view.selected = key;
    view.req = {
      method: r.method,
      path: r.path,
      params: [{ k: '', v: '' }],
      headers: [{ k: '', v: '' }],
      body: '',
    };
    // 按生效鉴权方式预填认证头(公开/全局密码需要用户自行补充)
    var mode = authMode(key, r);
    var token = App.auth && App.auth.token ? App.auth.token() : null;
    if (mode === 'session' && token) {
      view.req.headers = [{ k: 'x-auth-token', v: token }, { k: '', v: '' }];
    } else if (mode === 'bearer' && token) {
      view.req.headers = [{ k: 'Authorization', v: 'Bearer ' + token }, { k: '', v: '' }];
    } else if (mode === 'global-password') {
      view.req.headers = [{ k: 'x-auth-password', v: '' }, { k: '', v: '' }];
    } else if (mode === 'api-key') {
      view.req.headers = [{ k: 'x-api-key', v: apiKeyOf(key) }, { k: '', v: '' }];
    }
    if (!silent) renderFull();
  }

  function buildUrl() {
    var qs = rowsToObj(view.req.params);
    var keys = Object.keys(qs);
    if (!keys.length) return view.req.path;
    var parts = keys.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]);
    });
    return view.req.path + (view.req.path.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
  }

  function runRequest() {
    var req = view.req;
    if (!req.path || req.path.charAt(0) !== '/') {
      App.ui.toast(t('apihub.pathRequired'), 'error');
      return;
    }
    var headers = rowsToObj(req.headers);
    var url = buildUrl();
    var started = performance.now();
    view.running = true;
    renderFull();

    var opts = { method: req.method, headers: headers, cache: 'no-store' };
    if (hasBody(req.method) && req.body) {
      if (!headers['content-type'] && !headers['Content-Type']) {
        opts.headers['Content-Type'] = 'application/json';
      }
      opts.body = req.body;
    }

    fetch(url, opts)
      .then(function (res) {
        return res.text().then(function (text) {
          var timeMs = Math.round(performance.now() - started);
          var size = 0;
          try {
            size = new Blob([text]).size;
          } catch (e) {
            size = text.length;
          }
          var hdrs = [];
          if (res.headers && typeof res.headers.forEach === 'function') {
            res.headers.forEach(function (v, k) {
              hdrs.push([k, v]);
            });
          }
          view.run = {
            status: res.status,
            statusText: res.statusText || '',
            timeMs: timeMs,
            size: size,
            headers: hdrs,
            text: text,
          };
          view.history.unshift({ method: req.method, path: url, status: res.status, ts: Date.now() });
          view.history = view.history.slice(0, 20);
        });
      })
      .catch(function (e) {
        view.run = {
          status: 0,
          statusText: 'Error',
          timeMs: Math.round(performance.now() - started),
          size: 0,
          headers: [],
          text: String((e && e.message) || e),
        };
      })
      .then(function () {
        view.running = false;
        renderFull();
      });
  }

  function rerunHistory(item) {
    var m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/.*)$/.exec(item.path);
    view.req.method = (m && m[1]) || 'GET';
    var path = (m && m[2]) || item.path;
    var qIdx = path.indexOf('?');
    if (qIdx !== -1) {
      view.req.path = path.slice(0, qIdx);
      var qs = path.slice(qIdx + 1).split('&');
      view.req.params = qs.map(function (pair) {
        var kv = pair.split('=');
        return { k: decodeURIComponent(kv[0] || ''), v: decodeURIComponent(kv[1] || '') };
      });
    } else {
      view.req.path = path;
      view.req.params = [{ k: '', v: '' }];
    }
    runRequest();
  }

  /* ---------- 弹窗(自研,类 shadcn Dialog;禁用 window.prompt/confirm) ---------- */
  function openDialog(opts) {
    closeDialog();
    var overlay = document.createElement('div');
    overlay.className = 'hub-overlay';
    overlay.setAttribute('data-hub-overlay', '');
    overlay.innerHTML =
      '<div class="hub-dialog">' +
      '<div class="hub-dialog-head">' +
      '<div><div class="hub-dialog-title">' +
      opts.title +
      '</div>' +
      (opts.desc ? '<div class="hub-dialog-desc">' + opts.desc + '</div>' : '') +
      '</div>' +
      '<button type="button" class="hub-dialog-close" data-hub-dlg-close aria-label="' +
      t('apihub.cancel') +
      '">' +
      icon('x') +
      '</button>' +
      '</div>' +
      '<div class="hub-dialog-body">' +
      opts.body +
      '</div>' +
      '<div class="hub-dialog-foot">' +
      opts.foot +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDialog();
    });
    return overlay;
  }

  function closeDialog() {
    var ov = document.querySelector('[data-hub-overlay]');
    if (ov) ov.remove();
  }

  function confirmDialog(title, msg, okLabel, onOk, danger) {
    var overlay = openDialog({
      title: title,
      desc: msg,
      body: '',
      foot:
        '<button type="button" class="hub-btn hub-btn-outline" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" class="hub-btn ' +
        (danger ? 'hub-btn-danger' : 'hub-btn-primary') +
        '" data-hub-dlg-ok>' +
        (okLabel || t('apihub.confirm')) +
        '</button>',
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      closeDialog();
      onOk();
    });
  }

  function promptNameDialog(title, placeholder, value, onOk) {
    var overlay = openDialog({
      title: title,
      desc: '',
      body:
        '<div class="hub-form"><div class="hub-field"><label>' +
        t('apihub.name') +
        '</label><input type="text" class="hub-input" data-hub-name placeholder="' +
        escAttr(placeholder || '') +
        '" value="' +
        escAttr(value || '') +
        '" /></div></div>',
      foot:
        '<button type="button" class="hub-btn hub-btn-outline" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" class="hub-btn hub-btn-primary" data-hub-dlg-ok>' +
        t('apihub.save') +
        '</button>',
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      var val = overlay.querySelector('[data-hub-name]').value.trim();
      if (!val) {
        App.ui.toast(t('apihub.nameRequired'), 'error');
        return;
      }
      closeDialog();
      onOk(val);
    });
    var inp = overlay.querySelector('[data-hub-name]');
    setTimeout(function () {
      inp.focus();
      inp.select();
    }, 30);
  }

  /** 鉴权设置弹窗(默认 / 单路由共用) */
  function authDialog(key) {
    var isDefault = key === '__default__';
    var r = isDefault ? null : findRoute(key);
    var cur = isDefault
      ? (state.config.defaults && state.config.defaults.auth) || 'session'
      : memberships(key, r).auth || (state.config.defaults && state.config.defaults.auth) || 'session';
    if (cur === 'none') cur = 'session'; // 公开是开关效果,弹窗展示底层鉴权方式
    var body =
      '<div class="hub-form">' +
      '<div class="hub-field"><label>' +
      t('apihub.auth') +
      '</label>' +
      '<div class="hub-auth-options">' +
      ['none', 'session', 'bearer', 'global-password', 'api-key']
        .map(function (m) {
          return (
            '<label class="hub-auth-opt' +
            (cur === m ? ' is-on' : '') +
            '" data-hub-authpick="' +
            m +
            '">' +
            '<span class="hub-radio-dot"></span>' +
            '<span class="hub-auth-opt-main">' +
            '<span class="hub-auth-opt-title">' +
            authLabel(m) +
            '</span>' +
            '</span>' +
            '</label>'
          );
        })
        .join('') +
      '</div></div>' +
      (isDefault
        ? ''
        : '<input type="password" class="hub-input" data-hub-apikey placeholder="' +
          t('apihub.apiKeyPlaceholder') +
          '" value="' +
          escAttr(apiKeyOf(key)) +
          '" style="display:none" />') +
      '</div>';
    var overlay = openDialog({
      title: isDefault ? t('apihub.authDefaults') : esc(r ? r.method + ' ' + r.path : key),
      desc: isDefault ? t('apihub.authDefaultsDesc') : '',
      body: body,
      foot:
        '<button type="button" class="hub-btn hub-btn-outline" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" class="hub-btn hub-btn-primary" data-hub-dlg-ok>' +
        t('apihub.save') +
        '</button>',
    });
    var picked = cur;
    overlay.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('[data-hub-authpick]') : null;
      if (!opt) return;
      picked = opt.getAttribute('data-hub-authpick');
      overlay.querySelectorAll('[data-hub-authpick]').forEach(function (el) {
        el.classList.toggle('is-on', el === opt);
      });
      var keyInput = overlay.querySelector('[data-hub-apikey]');
      if (keyInput) keyInput.style.display = picked === 'api-key' ? '' : 'none';
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      var keyInput = overlay.querySelector('[data-hub-apikey]');
      if (isDefault) {
        setDefaultAuth(picked);
      } else {
        setRouteAuth(key, picked);
        if (keyInput) {
          if (keyInput.value) setRouteApiKey(key, keyInput.value);
          else if (picked === 'api-key') {
            App.ui.toast(t('apihub.apiKeyPlaceholder'), 'error');
            return;
          } else setRouteApiKey(key, '');
        }
      }
      closeDialog();
      renderFull();
    });
  }

  /** 自定义路由表单(新建/编辑) */
  function routeFormDialog(editKey) {
    var edit = editKey ? findRoute(editKey) : null;
    var c = edit ? customById(edit.id) : null;
    dialogMethod = c ? c.method : 'GET';
    var ftype = c ? c.responseType || 'echo' : 'echo';
    var body =
      '<div class="hub-form">' +
      '<div class="hub-field"><label>' +
      t('apihub.routeName') +
      '</label><input type="text" class="hub-input" data-hub-f-name placeholder="' +
      t('apihub.routeNamePlaceholder') +
      '" value="' +
      escAttr(c ? c.name : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.description') +
      '</label><input type="text" class="hub-input" data-hub-f-desc placeholder="' +
      t('apihub.routeDescPlaceholder') +
      '" value="' +
      escAttr(c ? c.desc : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.method') +
      '</label>' +
      '<div class="hub-method-select" data-dropdown>' +
      '<button type="button" data-dropdown-trigger style="width:100%;color:var(--foreground)">' +
      '<span data-hub-f-method-label>' +
      dialogMethod +
      '</span>' +
      icon('chevron-down', 'size-3') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="left:0;right:auto;min-width:6.5rem">' +
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        .map(function (m) {
          return (
            '<button type="button" class="hub-dd-item" data-hub-f-method="' +
            m +
            '">' +
            '<span class="hub-method ' +
            methodClass(m) +
            '" style="min-width:2.75rem;height:1.125rem;font-size:0.5625rem;margin:0">' +
            m +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.path') +
      '</label><input type="text" class="hub-input" data-hub-f-path placeholder="/api/..." value="' +
      escAttr(c ? c.path : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.responseType') +
      '</label>' +
      '<div class="hub-auth-options">' +
      '<label class="hub-auth-opt' +
      (ftype === 'echo' ? ' is-on' : '') +
      '" data-hub-ftype="echo"><span class="hub-radio-dot"></span>' +
      '<span class="hub-auth-opt-main"><span class="hub-auth-opt-title">' +
      t('apihub.echo') +
      '</span><span class="hub-auth-opt-desc">method / query / headers / body</span></span></label>' +
      '<label class="hub-auth-opt' +
      (ftype === 'static' ? ' is-on' : '') +
      '" data-hub-ftype="static"><span class="hub-radio-dot"></span>' +
      '<span class="hub-auth-opt-main"><span class="hub-auth-opt-title">' +
      t('apihub.static') +
      '</span></span></label>' +
      '</div></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.statusCode') +
      '</label><input type="number" class="hub-input" data-hub-f-status min="100" max="599" value="' +
      (c ? c.staticStatus || 200 : 200) +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.response') +
      '</label><textarea class="hub-input" data-hub-f-static placeholder="{ }">' +
      esc(c && c.staticBody ? JSON.stringify(c.staticBody, null, 2) : '') +
      '</textarea></div>' +
      '</div>';
    var overlay = openDialog({
      title: edit ? t('apihub.edit') : t('apihub.addRoute'),
      desc: '',
      body: body,
      foot:
        '<button type="button" class="hub-btn hub-btn-outline" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" class="hub-btn hub-btn-primary" data-hub-dlg-ok>' +
        t('apihub.save') +
        '</button>',
    });
    overlay.addEventListener('click', function (e) {
      var fm = e.target.closest ? e.target.closest('[data-hub-f-method]') : null;
      if (fm) {
        dialogMethod = fm.getAttribute('data-hub-f-method');
        var lbl = overlay.querySelector('[data-hub-f-method-label]');
        if (lbl) lbl.textContent = dialogMethod;
        return;
      }
      var ft = e.target.closest ? e.target.closest('[data-hub-ftype]') : null;
      if (ft) {
        ftype = ft.getAttribute('data-hub-ftype');
        overlay.querySelectorAll('[data-hub-ftype]').forEach(function (el) {
          el.classList.toggle('is-on', el === ft);
        });
      }
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      var name = overlay.querySelector('[data-hub-f-name]').value.trim();
      var path = overlay.querySelector('[data-hub-f-path]').value.trim();
      if (!name) {
        App.ui.toast(t('apihub.nameRequired'), 'error');
        return;
      }
      if (!path || path.charAt(0) !== '/') {
        App.ui.toast(t('apihub.pathRequired'), 'error');
        return;
      }
      var status = parseInt(overlay.querySelector('[data-hub-f-status]').value, 10);
      if (isNaN(status) || status < 100 || status > 599) status = 200;
      var staticBody = null;
      if (ftype === 'static') {
        try {
          staticBody = JSON.parse(overlay.querySelector('[data-hub-f-static]').value || '{}');
        } catch (e2) {
          App.ui.toast('JSON 格式错误', 'error');
          return;
        }
      }
      var data = {
        method: dialogMethod,
        path: path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/',
        name: name,
        desc: overlay.querySelector('[data-hub-f-desc]').value.trim(),
        responseType: ftype,
        staticStatus: status,
        staticBody: staticBody,
      };
      if (edit) updateCustomRoute(edit.id, data);
      else addCustomRoute(data);
      closeDialog();
    });
  }

  /* ---------- 复制分享链接 ---------- */
  function copyLink(key) {
    copyText(location.origin + location.pathname + '#/apihub?r=' + encodeURIComponent(key));
  }
  function copyText(text) {
    var done = function () {
      App.ui.toast(t('apihub.shareHint'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text, done);
      });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) {
      App.ui.toast(t('apihub.saveFailed'), 'error');
    }
  }

  /* ---------- 关闭下拉 ---------- */
  function closeDropdowns() {
    document.querySelectorAll('[data-dropdown-menu]').forEach(function (m) {
      m.classList.remove('open');
    });
    document.querySelectorAll('[data-dropdown-trigger]').forEach(function (tr) {
      tr.removeAttribute('aria-expanded');
    });
  }

  /* ---------- 渲染 ---------- */
  var METHOD_ORDER = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4, HEAD: 5, OPTIONS: 6 };

  function methodClass(m) {
    return 'hub-method-' + String(m || 'GET').toLowerCase();
  }

  /** 尝试把文本美化为缩进 JSON;不是 JSON 返回 null(调用方回退原文) */
  function prettyJson(text) {
    if (typeof text !== 'string' || !text) return null;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch (e) {
      return null;
    }
  }

  /** JSON 语法高亮(仅转义 & < >,保留引号以便正则匹配字符串) */
  function highlightJson(text) {
    var src = viewPretty(text);
    var isJson = prettyJson(text) !== null;
    if (!isJson) src = String(text || '');
    src = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!isJson) return src;
    return src.replace(
      /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      function (m, str, colon, boolv, nullv, num) {
        if (str) return '<span class="hub-hl-str">' + str + '</span>' + (colon || '');
        if (boolv) return '<span class="hub-hl-bool">' + boolv + '</span>';
        if (nullv) return '<span class="hub-hl-null">' + nullv + '</span>';
        if (num) return '<span class="hub-hl-num">' + num + '</span>';
        return m;
      }
    );
  }

  /** 当前筛选条件下的路由列表(置顶优先,再按方法/路径排序) */
  function filteredRoutes() {
    var q = (view.search || '').trim().toLowerCase();
    return (state.routes || [])
      .filter(function (r) {
        var key = routeKeyOf(r);
        var m = memberships(key, r);
        if (view.groupFilter) {
          var gids = descendants(state.config.groups || [], view.groupFilter);
          if (!(m.groupIds || []).some(function (gid) { return gids.indexOf(gid) !== -1; })) return false;
        }
        if (view.tagFilter) {
          var tids = descendants(state.config.tags || [], view.tagFilter);
          if (!(m.tagIds || []).some(function (tid) { return tids.indexOf(tid) !== -1; })) return false;
        }
        if (view.favOnly && !m.favorite) return false;
        if (view.pubOnly && !isPublic(key, r)) return false;
        if (view.customOnly && r.builtIn) return false;
        if (q) {
          var hay = (
            r.method +
            ' ' +
            r.path +
            ' ' +
            (m.name || '') +
            ' ' +
            (m.desc || r.desc || '')
          ).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        var ma = memberships(routeKeyOf(a), a);
        var mb = memberships(routeKeyOf(b), b);
        if (!!ma.pinned !== !!mb.pinned) return ma.pinned ? -1 : 1;
        var oa = METHOD_ORDER[a.method] == null ? 9 : METHOD_ORDER[a.method];
        var ob = METHOD_ORDER[b.method] == null ? 9 : METHOD_ORDER[b.method];
        if (oa !== ob) return oa - ob;
        return (a.path || '').localeCompare(b.path || '');
      });
  }

  /** 分组/标签节点(含子孙)内的路由数量 */
  function treeCount(kind, id) {
    var nodes = kind === 'group' ? state.config.groups || [] : state.config.tags || [];
    var ids = descendants(nodes, id);
    var n = 0;
    (state.routes || []).forEach(function (r) {
      var key = routeKeyOf(r);
      var m = memberships(key, r);
      var list = kind === 'group' ? m.groupIds : m.tagIds;
      if ((list || []).some(function (x) { return ids.indexOf(x) !== -1; })) n++;
    });
    return n;
  }

  function treeRowHtml(kind, node) {
    var isGroup = kind === 'group';
    var nodes = isGroup ? state.config.groups || [] : state.config.tags || [];
    var expanded = (isGroup ? view.expandedGroups : view.expandedTags)[node.id] !== false;
    var active = (isGroup ? view.groupFilter : view.tagFilter) === node.id;
    var children = treeChildren(nodes, node.id);
    var html =
      '<div class="hub-tree-row' +
      (active ? ' is-active' : '') +
      '">' +
      '<button type="button" class="hub-tree-caret' +
      (expanded ? ' is-open' : '') +
      (children.length ? '' : ' is-leaf') +
      '" data-hub-caret="' +
      kind +
      '" data-id="' +
      escAttr(node.id) +
      '" aria-label=""></button>' +
      '<div class="hub-tree-label" data-hub-tree="' +
      kind +
      '" data-id="' +
      escAttr(node.id) +
      '">' +
      icon(isGroup ? 'folder' : 'layers', '') +
      '<span class="hub-tree-name">' +
      esc(node.name) +
      '</span>' +
      (treeCount(kind, node.id)
        ? '<span class="hub-tree-count">' + treeCount(kind, node.id) + '</span>'
        : '') +
      '<span class="hub-dd" data-dropdown>' +
      '<button type="button" class="hub-icon-btn" data-dropdown-trigger aria-label="">' +
      icon('ellipsis', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu>' +
      '<button type="button" class="hub-dd-item" data-hub-ctx="newchild" data-kind="' +
      kind +
      '" data-id="' +
      escAttr(node.id) +
      '">' +
      icon('plus', '') +
      esc(t(isGroup ? 'apihub.newSubgroup' : 'apihub.newSubtag')) +
      '</button>' +
      '<button type="button" class="hub-dd-item" data-hub-ctx="rename" data-kind="' +
      kind +
      '" data-id="' +
      escAttr(node.id) +
      '">' +
      icon('pencil', '') +
      esc(t('apihub.rename')) +
      '</button>' +
      '<button type="button" class="hub-dd-item" data-hub-ctx="del" data-kind="' +
      kind +
      '" data-id="' +
      escAttr(node.id) +
      '">' +
      icon('trash-2', '') +
      esc(t('apihub.delete')) +
      '</button>' +
      '</div></span>' +
      '</div>' +
      (isGroup
        ? '<button type="button" class="hub-switch' +
          (node.public ? ' is-on' : '') +
          '" data-hub-toggle="grouppub" data-id="' +
          escAttr(node.id) +
          '" aria-label=""><span class="hub-switch-thumb"></span></button>'
        : '') +
      '</div>';
    if (children.length && expanded) {
      html +=
        '<div class="hub-tree-children">' +
        children
          .map(function (c) {
            return treeRowHtml(kind, c);
          })
          .join('') +
        '</div>';
    }
    return html;
  }

  function treeHtml(kind, allLabel, clearAct) {
    var nodes = kind === 'group' ? state.config.groups || [] : state.config.tags || [];
    var roots = treeChildren(nodes, '');
    var activeNone = kind === 'group' ? !view.groupFilter : !view.tagFilter;
    var html =
      '<div class="hub-tree">' +
      '<div class="hub-tree-row' +
      (activeNone ? ' is-active' : '') +
      '" data-hub-act="' +
      clearAct +
      '"><span class="hub-tree-caret is-leaf"></span>' +
      '<div class="hub-tree-label"><span class="hub-tree-name">' +
      esc(t(allLabel)) +
      '</span></div></div>';
    if (!roots.length) {
      html += '<div class="hub-empty" style="padding:0.75rem 0.375rem">' + icon('layers', '') + esc(t('apihub.empty')) + '</div>';
    } else {
      html += roots
        .map(function (n) {
          return treeRowHtml(kind, n);
        })
        .join('');
    }
    html += '</div>';
    return html;
  }

  function sideSectionsHtml() {
    return (
      '<div class="hub-section">' +
      '<div class="hub-section-head">' +
      '<span class="hub-section-title">' +
      icon('folder', '') +
      esc(t('apihub.groups')) +
      '</span>' +
      '<button type="button" class="hub-icon-btn" data-hub-act="newgroup" aria-label="' +
      escAttr(t('apihub.newGroup')) +
      '">' +
      icon('plus', '') +
      '</button>' +
      '</div>' +
      treeHtml('group', 'apihub.allGroups', 'clrgroup') +
      '</div>' +
      '<div class="hub-section">' +
      '<div class="hub-section-head">' +
      '<span class="hub-section-title">' +
      icon('layers', '') +
      esc(t('apihub.tags')) +
      '</span>' +
      '<button type="button" class="hub-icon-btn" data-hub-act="newtag" aria-label="' +
      escAttr(t('apihub.newTag')) +
      '">' +
      icon('plus', '') +
      '</button>' +
      '</div>' +
      treeHtml('tag', 'apihub.allTags', 'clrtag') +
      '</div>' +
      authDefaultsHtml()
    );
  }

  function authDefaultsHtml() {
    var mode = (state.config.defaults && state.config.defaults.auth) || 'session';
    var showKey = mode === 'api-key';
    return (
      '<div class="hub-section">' +
      '<div class="hub-section-head">' +
      '<span class="hub-section-title">' +
      icon('key-round', '') +
      esc(t('apihub.authDefaults')) +
      '</span>' +
      '</div>' +
      '<div class="hub-dd" data-dropdown style="padding:0 0.375rem">' +
      '<button type="button" data-dropdown-trigger class="hub-input" style="display:flex;align-items:center;justify-content:space-between;gap:0.375rem;text-align:left">' +
      '<span>' +
      esc(authLabel(mode)) +
      '</span>' +
      icon('chevron-down', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="left:0;right:auto;min-width:12rem">' +
      ['none', 'session', 'bearer', 'global-password', 'api-key']
        .map(function (m) {
          return (
            '<button type="button" class="hub-dd-item' +
            (mode === m ? ' is-on' : '') +
            '" data-hub-authopt data-mode="' +
            m +
            '">' +
            esc(authLabel(m)) +
            (mode === m ? '<span class="hub-dd-check">' + icon('check', '') + '</span>' : '') +
            '</button>'
          );
        })
        .join('') +
      '</div></div>' +
      (showKey
        ? '<input type="password" class="hub-input" data-hub-default-apikey placeholder="' +
          escAttr(t('apihub.defaultApiKey')) +
          '" value="' +
          escAttr(state.secrets.defaultApiKey || '') +
          '" style="margin:0.375rem" />'
        : '') +
      '</div>'
    );
  }

  function chipHtml(text, cls, iconName) {
    return (
      '<span class="hub-chip' +
      (cls ? ' ' + cls : '') +
      '">' +
      (iconName ? icon(iconName, '') : '') +
      esc(text) +
      '</span>'
    );
  }

  function groupAssignHtml(key, m) {
    return (
      '<span class="hub-dd" data-dropdown>' +
      '<button type="button" class="hub-icon-btn" data-dropdown-trigger aria-label="' +
      escAttr(t('apihub.group')) +
      '">' +
      icon('folder', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu>' +
      '<div class="hub-dd-label">' +
      esc(t('apihub.group')) +
      '</div>' +
      (state.config.groups || [])
        .map(function (g) {
          var on = (m.groupIds || []).indexOf(g.id) !== -1;
          return (
            '<button type="button" class="hub-dd-item" data-hub-setgroup="' +
            escAttr(key) +
            '" data-id="' +
            escAttr(g.id) +
            '">' +
            icon('folder', '') +
            esc(g.name) +
            (on ? '<span class="hub-dd-check">' + icon('check', '') + '</span>' : '') +
            '</button>'
          );
        })
        .join('') +
      '</div></span>'
    );
  }

  function tagAssignHtml(key, m) {
    return (
      '<span class="hub-dd" data-dropdown>' +
      '<button type="button" class="hub-icon-btn" data-dropdown-trigger aria-label="' +
      escAttr(t('apihub.tag')) +
      '">' +
      icon('layers', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu>' +
      '<div class="hub-dd-label">' +
      esc(t('apihub.tag')) +
      '</div>' +
      (state.config.tags || [])
        .map(function (tg) {
          var on = (m.tagIds || []).indexOf(tg.id) !== -1;
          return (
            '<button type="button" class="hub-dd-item" data-hub-settag="' +
            escAttr(key) +
            '" data-id="' +
            escAttr(tg.id) +
            '">' +
            icon('layers', '') +
            esc(tg.name) +
            (on ? '<span class="hub-dd-check">' + icon('check', '') + '</span>' : '') +
            '</button>'
          );
        })
        .join('') +
      '</div></span>'
    );
  }

  function routeRowHtml(r) {
    var key = routeKeyOf(r);
    var m = memberships(key, r);
    var pub = isPublic(key, r);
    var mode = authMode(key, r);
    var isCustom = !r.builtIn;
    var title = m.name || '';
    var desc = m.desc || r.desc || '';
    var locked = r.builtIn && r.public;
    var chips = '';
    if (pub) chips += chipHtml(t('apihub.public'), 'is-public', 'globe');
    else chips += chipHtml(authLabel(mode), 'is-auth', 'key-round');
    (m.groupIds || []).forEach(function (gid) {
      var g = groupById(gid);
      if (g) chips += chipHtml(g.name, '', 'folder');
    });
    (m.tagIds || []).forEach(function (tid) {
      var tg = tagById(tid);
      if (tg) chips += chipHtml(tg.name, '', 'layers');
    });
    return (
      '<div class="hub-route' +
      (view.selected === key ? ' is-selected' : '') +
      '" data-hub-route="' +
      escAttr(key) +
      '">' +
      '<div class="hub-route-switch-col">' +
      '<button type="button" class="hub-switch' +
      (pub ? ' is-on' : '') +
      (locked ? ' is-disabled' : '') +
      '" data-hub-toggle="routepub" data-key="' +
      escAttr(key) +
      '" aria-label="' +
      escAttr(t('apihub.publicHint')) +
      '"><span class="hub-switch-thumb"></span></button>' +
      '</div>' +
      '<span class="hub-method ' +
      methodClass(r.method) +
      '">' +
      esc(r.method) +
      '</span>' +
      '<div class="hub-route-main">' +
      '<div class="hub-route-title">' +
      '<span class="hub-route-path">' +
      esc(r.path) +
      '</span>' +
      (title ? '<span class="hub-route-badge">' + esc(title) + '</span>' : '') +
      '<span class="hub-route-badge' +
      (isCustom ? ' is-custom' : '') +
      '">' +
      esc(isCustom ? t('apihub.custom') : t('apihub.builtIn')) +
      '</span>' +
      '</div>' +
      (desc ? '<div class="hub-route-desc">' + esc(desc) + '</div>' : '') +
      (chips ? '<div class="hub-route-meta">' + chips + '</div>' : '') +
      '</div>' +
      '<div class="hub-route-pins">' +
      '<button type="button" class="hub-pin-btn' +
      (m.favorite ? ' is-fav' : '') +
      '" data-hub-act="fav" data-key="' +
      escAttr(key) +
      '" aria-label="' +
      escAttr(m.favorite ? t('apihub.unfavorite') : t('apihub.favorite')) +
      '">' +
      icon('star', '') +
      '</button>' +
      '<button type="button" class="hub-pin-btn' +
      (m.pinned ? ' is-on' : '') +
      '" data-hub-act="pin" data-key="' +
      escAttr(key) +
      '" aria-label="' +
      escAttr(m.pinned ? t('apihub.unpin') : t('apihub.pin')) +
      '">' +
      icon('circle-dot', '') +
      '</button>' +
      '</div>' +
      '<div class="hub-route-actions">' +
      '<button type="button" class="hub-action-btn" data-hub-act="run" data-key="' +
      escAttr(key) +
      '">' +
      icon('send', '') +
      esc(t('apihub.run')) +
      '</button>' +
      groupAssignHtml(key, m) +
      tagAssignHtml(key, m) +
      '<button type="button" class="hub-icon-btn" data-hub-act="auth" data-key="' +
      escAttr(key) +
      '" aria-label="' +
      escAttr(t('apihub.auth')) +
      '">' +
      icon('key-round', '') +
      '</button>' +
      '<button type="button" class="hub-icon-btn" data-hub-act="copylink" data-key="' +
      escAttr(key) +
      '" aria-label="' +
      escAttr(t('apihub.copyLink')) +
      '">' +
      icon('link', '') +
      '</button>' +
      (isCustom
        ? '<button type="button" class="hub-icon-btn" data-hub-act="editroute" data-key="' +
          escAttr(key) +
          '" aria-label="' +
          escAttr(t('apihub.edit')) +
          '">' +
          icon('pencil', '') +
          '</button>' +
          '<button type="button" class="hub-icon-btn" data-hub-act="delroute" data-key="' +
          escAttr(key) +
          '" aria-label="' +
          escAttr(t('apihub.delete')) +
          '">' +
          icon('trash-2', '') +
          '</button>'
        : '') +
      '</div>' +
      '</div>'
    );
  }

  function routesHtml() {
    var list = filteredRoutes();
    if (!list.length) {
      return (
        '<div class="hub-empty">' +
        icon('route', '') +
        esc(t('apihub.empty')) +
        '</div>'
      );
    }
    return list
      .map(function (r) {
        return routeRowHtml(r);
      })
      .join('');
  }

  function listHtml() {
    return (
      '<div class="hub-col hub-list">' +
      '<div class="hub-list-toolbar">' +
      '<div class="hub-search">' +
      icon('search', '') +
      '<input type="text" data-hub-search placeholder="' +
      escAttr(t('apihub.search')) +
      '" value="' +
      escAttr(view.search) +
      '" />' +
      '</div>' +
      '<div class="hub-filters">' +
      '<button type="button" class="hub-filter-chip' +
      (view.favOnly ? ' is-on' : '') +
      '" data-hub-act="filfav">' +
      icon('star', '') +
      esc(t('apihub.favOnly')) +
      '</button>' +
      '<button type="button" class="hub-filter-chip' +
      (view.pubOnly ? ' is-on' : '') +
      '" data-hub-act="filpub">' +
      icon('globe', '') +
      esc(t('apihub.pubOnly')) +
      '</button>' +
      '<button type="button" class="hub-filter-chip' +
      (view.customOnly ? ' is-on' : '') +
      '" data-hub-act="filcustom">' +
      icon('plus', '') +
      esc(t('apihub.customOnly')) +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="hub-list-body" data-hub-list-body>' +
      routesHtml() +
      '</div>' +
      '</div>'
    );
  }

  function kvRowsHtml(list, kind) {
    return (
      '<div class="hub-kv">' +
      (list || [])
        .map(function (row, i) {
          return (
            '<div class="hub-kv-row">' +
            '<input type="text" data-hub-kv="' +
            kind +
            ':' +
            i +
            ':k" placeholder="key" value="' +
            escAttr(row.k) +
            '" />' +
            '<input type="text" data-hub-kv="' +
            kind +
            ':' +
            i +
            ':v" placeholder="' +
            escAttr(t('apihub.key')) +
            '" value="' +
            escAttr(row.v) +
            '" />' +
            '<button type="button" class="hub-kv-del" data-hub-kvdel="' +
            kind +
            ':' +
            i +
            '" aria-label="' +
            escAttr(t('apihub.delete')) +
            '">' +
            icon('x', '') +
            '</button>' +
            '</div>'
          );
        })
        .join('') +
      '</div>' +
      '<button type="button" class="hub-add-row" data-hub-kvadd="' +
      kind +
      '">' +
      icon('plus', '') +
      esc(t('apihub.addRow')) +
      '</button>'
    );
  }

  function requestHtml() {
    var req = view.req;
    return (
      '<div class="hub-req">' +
      '<div class="hub-req-line">' +
      '<div class="hub-method-select" data-dropdown>' +
      '<button type="button" data-dropdown-trigger><span>' +
      esc(req.method) +
      '</span>' +
      icon('chevron-down', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="left:0;right:auto;min-width:6.5rem">' +
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        .map(function (mm) {
          return (
            '<button type="button" class="hub-dd-item" data-hub-reqmethod="' +
            mm +
            '">' +
            '<span class="hub-method ' +
            methodClass(mm) +
            '" style="min-width:2.75rem;height:1.125rem;font-size:0.5625rem;margin:0">' +
            mm +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>' +
      '<input type="text" class="hub-req-path" data-hub-reqpath placeholder="/api/..." value="' +
      escAttr(req.path) +
      '" />' +
      '<button type="button" class="hub-send-btn" data-hub-act="send"' +
      (view.running ? ' disabled' : '') +
      '>' +
      icon('send', '') +
      esc(t('apihub.send')) +
      '</button>' +
      '</div>' +
      '<div class="hub-tabs">' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'params' ? ' is-on' : '') +
      '" data-hub-tab="params">' +
      icon('sliders-horizontal', '') +
      esc(t('apihub.params')) +
      '</button>' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'headers' ? ' is-on' : '') +
      '" data-hub-tab="headers">' +
      icon('list-filter', '') +
      esc(t('apihub.headers')) +
      '</button>' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'body' ? ' is-on' : '') +
      '" data-hub-tab="body">' +
      icon('scroll-text', '') +
      esc(t('apihub.body')) +
      '</button>' +
      '</div>' +
      (view.runTab === 'params' ? kvRowsHtml(req.params, 'params') : '') +
      (view.runTab === 'headers' ? kvRowsHtml(req.headers, 'headers') : '') +
      (view.runTab === 'body'
        ? '<textarea class="hub-body-input" data-hub-reqbody placeholder="{ }">' +
          esc(req.body || '') +
          '</textarea>'
        : '') +
      '</div>'
    );
  }

  function statusClass(s) {
    if (s >= 200 && s < 300) return 'is-2xx';
    if (s >= 400 && s < 500) return 'is-4xx';
    if (s >= 500) return 'is-5xx';
    return 'is-err';
  }

  function fmtSize(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /** 递归解码 JSON 字符串值(美化视图用:settings 等 KV 值以 JSON 字符串落库) */
  function decodeNested(value) {
    if (typeof value === 'string') {
      var t = value.trim();
      if (t && (t.charAt(0) === '{' || t.charAt(0) === '[')) {
        try {
          return decodeNested(JSON.parse(value));
        } catch (e) {
          return value;
        }
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(decodeNested);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        out[k] = decodeNested(value[k]);
      });
      return out;
    }
    return value;
  }

  /** 美化视图文本:解析 JSON → 递归解码嵌套字符串 → 缩进序列化 */
  function viewPretty(text) {
    try {
      return JSON.stringify(decodeNested(JSON.parse(text)), null, 2);
    } catch (e) {
      return prettyJson(text) || text;
    }
  }

  function responseHtml() {
    var res = view.run;
    var html =
      '<div class="hub-res-head">' +
      '<span class="hub-res-title">' +
      icon('circle-dot', '') +
      esc(t('apihub.response')) +
      '</span>';
    if (res) {
      html +=
        '<div class="hub-res-meta">' +
        '<span class="hub-res-status ' +
        statusClass(res.status) +
        '">' +
        (res.status ? String(res.status) : 'ERR') +
        (res.statusText ? ' ' + esc(res.statusText) : '') +
        '</span>' +
        '<span class="hub-res-stat">' +
        res.timeMs +
        ' ms</span>' +
        '<span class="hub-res-stat">' +
        fmtSize(res.size) +
        '</span>' +
        '</div>';
    }
    html +=
      '<div class="hub-res-actions">' +
      '<button type="button" class="hub-res-toggle' +
      (view.resView === 'pretty' ? ' is-on' : '') +
      '" data-hub-resview="pretty">' +
      esc(t('apihub.pretty')) +
      '</button>' +
      '<button type="button" class="hub-res-toggle' +
      (view.resView === 'raw' ? ' is-on' : '') +
      '" data-hub-resview="raw">' +
      esc(t('apihub.raw')) +
      '</button>' +
      '<button type="button" class="hub-res-toggle" data-hub-act="copyres">' +
      icon('copy', '') +
      esc(t('apihub.copy')) +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="hub-res-body">';
    if (view.running) {
      html += '<div class="hub-res-empty">' + icon('circle-dot', '') + esc(t('apihub.sending')) + '</div>';
    } else if (!res) {
      html += '<div class="hub-res-empty">' + icon('route', '') + esc(t('apihub.emptyRun')) + '</div>';
    } else {
      var body = res.text || '';
      if (view.resView === 'pretty' && prettyJson(body) !== null) {
        html += '<pre class="hub-pre">' + highlightJson(body) + '</pre>';
      } else {
        html += '<pre class="hub-pre">' + esc(body) + '</pre>';
      }
      if (res.headers && res.headers.length) {
        html +=
          '<div class="hub-headers-list">' +
          res.headers
            .map(function (h) {
              return '<div><span>' + esc(h[0]) + '</span><span>' + esc(h[1]) + '</span></div>';
            })
            .join('') +
          '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  function historyHtml() {
    var h = view.history || [];
    var html =
      '<div class="hub-history">' +
      '<div class="hub-history-head">' +
      icon('timer', '') +
      esc(t('apihub.history')) +
      '</div>' +
      '<div class="hub-history-list">';
    if (!h.length) {
      html += '<div class="hub-history-empty">' + esc(t('apihub.noRecent')) + '</div>';
    } else {
      html += h
        .map(function (item) {
          return (
            '<div class="hub-history-item" data-hub-replay="' +
            item.ts +
            '">' +
            '<span class="hub-method ' +
            methodClass(item.method) +
            '">' +
            esc(item.method) +
            '</span>' +
            '<span class="hub-history-path">' +
            esc(item.path) +
            '</span>' +
            '<span class="hub-history-status">' +
            item.status +
            '</span>' +
            '</div>'
          );
        })
        .join('');
    }
    html += '</div></div>';
    return html;
  }

  function runHtml() {
    return (
      '<div class="hub-col hub-run">' +
      '<div class="hub-run-scroll">' +
      requestHtml() +
      responseHtml() +
      '</div>' +
      historyHtml() +
      '</div>'
    );
  }

  function sideHtml() {
    return '<div class="hub-side-scroll" data-hub-side>' + sideSectionsHtml() + '</div>';
  }

  function pageHtml() {
    var head =
      '<div class="hub-head">' +
      '<div>' +
      '<h1>' +
      esc(t('apihub.title')) +
      '</h1>' +
      '<p>' +
      esc(t('apihub.desc')) +
      '</p>' +
      '</div>' +
      '<div class="hub-head-actions">' +
      '<button type="button" class="hub-action-btn" data-hub-act="refresh">' +
      icon('rotate-ccw', '') +
      esc(t('apihub.refresh')) +
      '</button>' +
      '<button type="button" class="hub-action-btn is-primary" data-hub-act="newroute">' +
      icon('plus', '') +
      esc(t('apihub.addRoute')) +
      '</button>' +
      '</div>' +
      '</div>';
    if (state.error) {
      return (
        '<div class="hub-page">' +
        head +
        '<div class="hub-grid"><div class="hub-col hub-list"><div class="hub-list-body">' +
        '<div class="hub-empty">' +
        icon('circle-alert', '') +
        esc(state.error) +
        '</div></div></div></div></div>'
      );
    }
    if (!state.loaded) {
      return (
        '<div class="hub-page">' +
        head +
        '<div class="hub-grid"><div class="hub-col hub-list"><div class="hub-list-body">' +
        '<div class="hub-empty">' +
        icon('route', '') +
        esc(t('apihub.loading')) +
        '</div></div></div></div></div>'
      );
    }
    return (
      '<div class="hub-page">' +
      head +
      '<div class="hub-grid">' +
      sideHtml() +
      listHtml() +
      runHtml() +
      '</div>' +
      '</div>'
    );
  }

  function render(path, ctx) {
    return pageHtml();
  }

  /** 全量重渲染(状态变更后) */
  function renderFull() {
    var area = document.querySelector('[data-content-area]');
    if (!area) return;
    area.innerHTML = pageHtml();
  }

  /** 仅刷新中间列表(搜索输入时避免抢焦点) */
  function rerenderList() {
    var body = document.querySelector('[data-hub-list-body]');
    if (body) body.innerHTML = routesHtml();
  }

  /** 仅刷新左侧筛选区(分组/标签激活态) */
  function rerenderSideFilters() {
    var side = document.querySelector('[data-hub-side]');
    if (side) side.innerHTML = sideSectionsHtml();
  }

  /* ---------- 事件委托 ---------- */
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    // 弹窗关闭
    if (target.closest('[data-hub-dlg-close]')) {
      closeDialog();
      return;
    }

    // 下拉触发器:交给核心层打开,不触发重渲染
    if (target.closest('[data-dropdown-trigger]')) return;

    // 公开开关(路由 / 分组)—— 须在树节点筛选之前处理(开关位于树行内)
    var sw = target.closest('[data-hub-toggle]');
    if (sw) {
      var kind = sw.getAttribute('data-hub-toggle');
      if (kind === 'routepub') toggleRoutePublic(sw.getAttribute('data-key'));
      else if (kind === 'grouppub') toggleGroupPublic(sw.getAttribute('data-id'));
      return;
    }

    // 分组/标签节点上下文菜单 —— 先于树筛选处理(菜单项位于树行内)
    var ctx = target.closest('[data-hub-ctx]');
    if (ctx) {
      handleCtx(ctx);
      return;
    }

    // 树节点:分组/标签筛选(点击 caret 只展开,不筛选)
    var caret = target.closest('[data-hub-caret]');
    if (caret) {
      var cKind = caret.getAttribute('data-hub-caret');
      var cId = caret.getAttribute('data-id');
      if (cKind === 'group') view.expandedGroups[cId] = !view.expandedGroups[cId];
      else view.expandedTags[cId] = !view.expandedTags[cId];
      renderFull();
      return;
    }
    var tree = target.closest('[data-hub-tree]');
    if (tree) {
      var id = tree.getAttribute('data-id');
      if (tree.getAttribute('data-hub-tree') === 'group') {
        view.groupFilter = view.groupFilter === id ? null : id;
      } else {
        view.tagFilter = view.tagFilter === id ? null : id;
      }
      rerenderList();
      rerenderSideFilters();
      return;
    }

    // 分组/标签成员选择(下拉项)
    var sg = target.closest('[data-hub-setgroup]');
    if (sg) {
      toggleRouteGroup(sg.getAttribute('data-hub-setgroup'), sg.getAttribute('data-id'));
      return;
    }
    var st = target.closest('[data-hub-settag]');
    if (st) {
      toggleRouteTag(st.getAttribute('data-hub-settag'), st.getAttribute('data-id'));
      return;
    }

    // 默认鉴权下拉项
    var ao = target.closest('[data-hub-authopt]');
    if (ao) {
      closeDropdowns();
      setDefaultAuth(ao.getAttribute('data-mode'));
      return;
    }

    // 通用动作(按钮)
    var actBtn = target.closest('[data-hub-act]');
    if (actBtn) {
      var a = actBtn.getAttribute('data-hub-act');
      var key = actBtn.getAttribute('data-key');
      closeDropdowns(); // 动作触发后收起所有下拉
      switch (a) {
        case 'run':
          selectRoute(key);
          runRequest();
          break;
        case 'fav':
          toggleFav(key);
          break;
        case 'pin':
          togglePin(key);
          break;
        case 'auth':
          authDialog(key);
          break;
        case 'copylink':
          copyLink(key);
          break;
        case 'editroute':
          routeFormDialog(key);
          break;
        case 'delroute':
          confirmDialog(
            t('apihub.deleteConfirm'),
            t('apihub.deleteRouteMsg'),
            t('apihub.delete'),
            function () {
              deleteCustomRoute(key.slice(3));
            },
            true
          );
          break;
        case 'newgroup':
          promptNameDialog(t('apihub.newGroup'), '', '', function (name) {
            addGroup(name, '');
          });
          break;
        case 'newtag':
          promptNameDialog(t('apihub.newTag'), '', '', function (name) {
            addTag(name, '');
          });
          break;
        case 'newroute':
          routeFormDialog(null);
          break;
        case 'refresh':
          view.history = [];
          view.run = null;
          state.loaded = false;
          state.error = null;
          renderFull();
          load();
          break;
        case 'filfav':
          view.favOnly = !view.favOnly;
          renderFull();
          break;
        case 'filpub':
          view.pubOnly = !view.pubOnly;
          renderFull();
          break;
        case 'filcustom':
          view.customOnly = !view.customOnly;
          renderFull();
          break;
        case 'clrgroup':
          view.groupFilter = null;
          renderFull();
          break;
        case 'clrtag':
          view.tagFilter = null;
          renderFull();
          break;
        case 'send':
          runRequest();
          break;
        case 'copyres':
          if (view.run) {
            var txt = view.run.text;
            if (view.resView === 'pretty' && prettyJson(txt) !== null) txt = prettyJson(txt);
            copyText(txt);
          }
          break;
      }
      return;
    }

    // 请求方法选择
    var rm = target.closest('[data-hub-reqmethod]');
    if (rm) {
      view.req.method = rm.getAttribute('data-hub-reqmethod');
      if (!hasBody(view.req.method) && view.runTab === 'body') view.runTab = 'params';
      closeDropdowns();
      renderFull();
      return;
    }

    // 标签页切换
    var tab = target.closest('[data-hub-tab]');
    if (tab) {
      view.runTab = tab.getAttribute('data-hub-tab');
      renderFull();
      return;
    }

    // 响应视图切换
    var rv = target.closest('[data-hub-resview]');
    if (rv) {
      view.resView = rv.getAttribute('data-hub-resview');
      renderFull();
      return;
    }

    // KV 行增删
    var kvdel = target.closest('[data-hub-kvdel]');
    if (kvdel) {
      var parts = kvdel.getAttribute('data-hub-kvdel').split(':');
      var list = parts[0] === 'params' ? view.req.params : view.req.headers;
      list.splice(parseInt(parts[1], 10), 1);
      renderFull();
      return;
    }
    var kvadd = target.closest('[data-hub-kvadd]');
    if (kvadd) {
      var which = kvadd.getAttribute('data-hub-kvadd');
      if (which === 'params') view.req.params.push({ k: '', v: '' });
      else view.req.headers.push({ k: '', v: '' });
      renderFull();
      return;
    }

    // 历史回放
    var replay = target.closest('[data-hub-replay]');
    if (replay) {
      var hts = replay.getAttribute('data-hub-replay');
      for (var i = 0; i < view.history.length; i++) {
        if (String(view.history[i].ts) === hts) {
          rerunHistory(view.history[i]);
          break;
        }
      }
      return;
    }

    // 路由行选中
    var row = target.closest('[data-hub-route]');
    if (row) {
      selectRoute(row.getAttribute('data-hub-route'));
      return;
    }
  });

  /** 分组/标签节点上下文菜单动作 */
  function handleCtx(ctx) {
    var ck = ctx.getAttribute('data-kind');
    var cid = ctx.getAttribute('data-id');
    var act = ctx.getAttribute('data-hub-ctx');
    closeDropdowns();
    if (act === 'newchild') {
      promptNameDialog(
        ck === 'group' ? t('apihub.newSubgroup') : t('apihub.newSubtag'),
        '',
        '',
        function (name) {
          if (ck === 'group') addGroup(name, cid);
          else addTag(name, cid);
        }
      );
    } else if (act === 'rename') {
      var cur = ck === 'group' ? groupById(cid) : tagById(cid);
      promptNameDialog(
        t('apihub.rename'),
        '',
        cur ? cur.name : '',
        function (name) {
          if (ck === 'group') renameGroup(cid, name);
          else renameTag(cid, name);
        }
      );
    } else if (act === 'del') {
      confirmDialog(
        t('apihub.deleteConfirm'),
        ck === 'group' ? t('apihub.deleteGroupMsg') : t('apihub.deleteTagMsg'),
        t('apihub.delete'),
        function () {
          if (ck === 'group') deleteGroup(cid);
          else deleteTag(cid);
        },
        true
      );
    }
  }

  // 输入:搜索 / KV 行 / 请求路径/体 / 默认 API Key(实时更新,不重渲染以免抢焦点)
  document.addEventListener('input', function (e) {
    var target = e.target;
    if (!target || !target.getAttribute) return;

    if (target.hasAttribute('data-hub-search')) {
      view.search = target.value;
      rerenderList();
      return;
    }
    var kv = target.getAttribute('data-hub-kv');
    if (kv) {
      var parts = kv.split(':');
      var list = parts[0] === 'params' ? view.req.params : view.req.headers;
      var idx = parseInt(parts[1], 10);
      if (list[idx]) list[idx][parts[2]] = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-reqpath')) {
      view.req.path = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-reqbody')) {
      view.req.body = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-default-apikey')) {
      setDefaultApiKey(target.value);
      return;
    }
  });

  // 回车键:请求路径框 → 发送
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var target = e.target;
    if (target && target.hasAttribute && target.hasAttribute('data-hub-reqpath')) {
      e.preventDefault();
      runRequest();
    }
  });

  /* ---------- 内容挂载后初始化(懒加载数据) ---------- */
  document.addEventListener('app:afterRender', function (ev) {
    var detail = ev.detail || {};
    if (detail.path === '/apihub' && !state.loaded && !state.error) {
      load();
    }
  });

  App.defineModule({ id: 'apihub', render: render });
})();
