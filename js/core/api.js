/* ============================================================
 * api.js — API 客户端(零依赖)
 * ------------------------------------------------------------
 * 封装 fetch:自动附加 x-auth-token 请求头(由 auth.js 维护),
 * 401 时回调 App.auth.onUnauthorized(默认回到登录页)。
 * 全部请求带 Cache-Control: no-store,避免浏览器缓存敏感数据。
 * ============================================================ */
(function () {
  'use strict';

  function request(method, pathname, body) {
    var headers = { 'Cache-Control': 'no-store' };
    var token = App.auth ? App.auth.token() : null;
    if (token) headers['x-auth-token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch(pathname, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = null;
          }
          if (res.status === 401) {
            if (App.logger) App.logger.warn('api', '会话失效(401): ' + method + ' ' + pathname);
            if (App.auth && typeof App.auth.onUnauthorized === 'function') {
              App.auth.onUnauthorized();
            }
            var err = new Error((data && data.message) || '未授权');
            err.status = 401;
            throw err;
          }
          if (!res.ok) {
            if (App.logger)
              App.logger.error(
                'api',
                '请求失败 ' + method + ' ' + pathname + ' → ' + res.status,
                data
              );
            var e2 = new Error((data && data.message) || 'HTTP ' + res.status);
            e2.status = res.status;
            e2.data = data;
            throw e2;
          }
          return data;
        });
      })
      .catch(function (e) {
        // 网络层错误(服务器未启动 / 断网):有 status 的错误已在上面处理,这里只记连接失败
        if (e && e.status == null && App.logger) {
          App.logger.error('api', '网络请求失败: ' + method + ' ' + pathname, e);
        }
        throw e;
      });
  }

  window.App = window.App || {};
  App.api = {
    get: function (p) {
      return request('GET', p);
    },
    post: function (p, body) {
      return request('POST', p, body);
    },
    put: function (p, body) {
      return request('PUT', p, body);
    },
    del: function (p, body) {
      return request('DELETE', p, body);
    },
  };
})();
