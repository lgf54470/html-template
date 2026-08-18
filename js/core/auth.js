/* ============================================================
 * auth.js — 全局 x-auth-password 鉴权登录(零依赖)
 * ------------------------------------------------------------
 * - 登录页(整页居中卡片):访问密码 + 2x4 会话有效期网格 + 「下一次浏览器打开」
 * - 有效期选项:3/6/9/12/24 小时、7/14/30 天、下一次浏览器打开
 * - 令牌存储:时长选项存 localStorage;浏览器选项存 sessionStorage(关浏览器即失效)
 * - 服务端会话在 auth_sessions 表,客户端同时校验服务端返回的过期时间
 * - App.start() 通过 isAuthed() 门禁:未登录渲染登录页,登录成功后重新启动
 * ============================================================ */
(function () {
  'use strict';

  var TOKEN_KEY = 'html-template-auth-token';
  var EXPIRY_KEY = 'html-template-auth-expiry';

  var EXPIRY_ITEMS = [
    { id: '3h', labelKey: 'auth.expiry.3h' },
    { id: '6h', labelKey: 'auth.expiry.6h' },
    { id: '9h', labelKey: 'auth.expiry.9h' },
    { id: '12h', labelKey: 'auth.expiry.12h' },
    { id: '24h', labelKey: 'auth.expiry.24h' },
    { id: '7d', labelKey: 'auth.expiry.7d' },
    { id: '14d', labelKey: 'auth.expiry.14d' },
    { id: '30d', labelKey: 'auth.expiry.30d' },
  ];
  var BROWSER_EXPIRY = { id: 'browser', labelKey: 'auth.expiry.browser' };

  var pendingExpiry = '24h';
  var authViewShown = false;

  function readStore(expiry) {
    return expiry === 'browser' ? window.sessionStorage : window.localStorage;
  }

  function safeGet(store, key) {
    try {
      return store.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function safeSet(store, key, value) {
    try {
      store.setItem(key, value);
    } catch (e) {
      /* ignore */
    }
  }
  function safeRemove(store, key) {
    try {
      store.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  function token() {
    return (
      safeGet(window.localStorage, TOKEN_KEY) || safeGet(window.sessionStorage, TOKEN_KEY) || null
    );
  }

  function expiryDeadline() {
    return (
      safeGet(window.localStorage, EXPIRY_KEY) || safeGet(window.sessionStorage, EXPIRY_KEY) || null
    );
  }

  function clearToken() {
    safeRemove(window.localStorage, TOKEN_KEY);
    safeRemove(window.localStorage, EXPIRY_KEY);
    safeRemove(window.sessionStorage, TOKEN_KEY);
    safeRemove(window.sessionStorage, EXPIRY_KEY);
  }

  function isAuthed() {
    var tok = token();
    if (!tok) return false;
    var deadline = expiryDeadline();
    if (deadline && Date.parse(deadline) <= Date.now()) {
      clearToken();
      return false;
    }
    return true;
  }

  function storeToken(tok, expiresAt, expiry) {
    var store = readStore(expiry);
    clearToken();
    safeSet(store, TOKEN_KEY, tok);
    safeSet(store, EXPIRY_KEY, expiresAt);
  }

  /* ---------- 登录视图 ---------- */
  function t() {
    return App.i18n.makeT(App.settings.readSettings().locale);
  }

  function expiryItemMarkup(item, selected) {
    var cls = 'auth-expiry-item' + (selected ? ' is-selected' : '');
    var locked = item.locked;
    return (
      '<button type="button" data-auth-expiry="' +
      item.id +
      '"' +
      (locked ? ' disabled' : '') +
      ' class="' +
      cls +
      '">' +
      (selected
        ? '<span class="auth-expiry-check">' + App.icon.iconSvg('circle-check') + '</span>'
        : '') +
      '<span>' +
      t()(item.labelKey) +
      '</span>' +
      '</button>'
    );
  }

  function renderLogin() {
    authViewShown = true;
    var tt = t();
    var grid =
      '<div class="auth-expiry-grid">' +
      EXPIRY_ITEMS.map(function (it) {
        return expiryItemMarkup(it, pendingExpiry === it.id);
      }).join('') +
      '</div>' +
      '<div class="auth-expiry-grid auth-expiry-grid-browser">' +
      expiryItemMarkup(BROWSER_EXPIRY, pendingExpiry === 'browser') +
      '</div>';

    var html =
      '<div class="auth-wrap">' +
      '<div data-slot="card" data-size="default" class="auth-card">' +
      '<div class="auth-card-head">' +
      '<div class="auth-logo">' +
      App.icon.iconSvg('lock', { class: 'size-6' }) +
      '</div>' +
      '<h1>' +
      tt('auth.title') +
      '</h1>' +
      '<p>' +
      tt('auth.description') +
      '</p>' +
      '</div>' +
      '<form data-auth-form class="auth-form" autocomplete="off">' +
      '<div class="auth-field">' +
      '<label class="auth-label" for="auth-password">' +
      tt('auth.passwordLabel') +
      '</label>' +
      '<input id="auth-password" data-auth-password type="password" class="auth-input" ' +
      'placeholder="' +
      tt('auth.passwordPlaceholder') +
      '" autocomplete="current-password" />' +
      '</div>' +
      '<div class="auth-field">' +
      '<span class="auth-label">' +
      tt('auth.expiryLabel') +
      '</span>' +
      grid +
      '</div>' +
      '<p data-auth-error class="auth-error" role="alert"></p>' +
      '<button type="submit" data-auth-login class="auth-submit">' +
      App.icon.iconSvg('log-in', { class: 'size-4' }) +
      '<span>' +
      tt('auth.login') +
      '</span>' +
      '</button>' +
      '</form>' +
      '</div>' +
      '<p class="auth-footer">' +
      tt('auth.footer') +
      '</p>' +
      '</div>';

    document.getElementById('app').innerHTML = html;
    var input = document.querySelector('[data-auth-password]');
    if (input) {
      try {
        input.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function setError(message) {
    var el = document.querySelector('[data-auth-error]');
    if (el) el.textContent = message || '';
  }

  function selectExpiry(id) {
    pendingExpiry = id;
    document.querySelectorAll('[data-auth-expiry]').forEach(function (b) {
      var sel = b.dataset.authExpiry === id;
      b.classList.toggle('is-selected', sel);
      b.setAttribute('aria-pressed', String(sel));
      var check = b.querySelector('.auth-expiry-check');
      if (check) check.remove();
      if (sel && !b.querySelector('.auth-expiry-check')) {
        var span = document.createElement('span');
        span.className = 'auth-expiry-check';
        span.innerHTML = App.icon.iconSvg('circle-check');
        b.appendChild(span);
      }
    });
  }

  function doLogin() {
    var input = document.querySelector('[data-auth-password]');
    var password = input ? input.value : '';
    if (!password) {
      setError(t()('auth.required'));
      return;
    }
    var btn = document.querySelector('[data-auth-login]');
    if (btn) btn.disabled = true;
    App.api
      .post('/api/auth/login', { password: password, expiry: pendingExpiry })
      .then(function (res) {
        storeToken(res.token, res.expiresAt, res.expiry || pendingExpiry);
        authViewShown = false;
        setError('');
        if (App.logger)
          App.logger.info('auth', '登录成功(会话有效期: ' + (res.expiry || pendingExpiry) + ')');
        App.start();
      })
      .catch(function (err) {
        if (btn) btn.disabled = false;
        var msg;
        if (err && err.status) {
          msg = (err.data && err.data.message) || t()('auth.error');
        } else {
          msg = t()('auth.serverRequired'); // 网络错误(如 file:// 直开):提示需要服务器
        }
        if (App.logger) App.logger.warn('auth', '登录失败: ' + msg, err);
        setError(msg);
      });
  }

  /* ---------- 事件(登录视图内) ---------- */
  document.addEventListener('click', function (e) {
    if (!authViewShown || !e.target || !e.target.closest) return;
    var exp = e.target.closest('[data-auth-expiry]');
    if (exp) {
      selectExpiry(exp.dataset.authExpiry);
      return;
    }
    if (e.target.closest('[data-auth-login]')) {
      e.preventDefault();
      doLogin();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!authViewShown || !e.target || !e.target.closest) return;
    if (e.key === 'Enter' && e.target.closest('[data-auth-form]')) {
      e.preventDefault();
      doLogin();
    }
  });

  /* ---------- 公开 API ---------- */
  window.App = window.App || {};
  App.auth = {
    token: token,
    isAuthed: isAuthed,
    renderLogin: renderLogin,
    selectExpiry: selectExpiry,
    login: doLogin,
    logout: function () {
      var tok = token();
      if (tok) {
        App.api.post('/api/auth/logout').catch(function () {
          /* ignore */
        });
      }
      clearToken();
      authViewShown = true;
      if (App.logger) App.logger.info('auth', '已登出');
      renderLogin();
    },
    /** API 401 回调:清除本地令牌并回到登录页 */
    onUnauthorized: function () {
      clearToken();
      renderLogin();
    },
  };
})();
