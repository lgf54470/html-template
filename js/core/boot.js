/* ============================================================
 * boot.js — 引导入口(零依赖)
 * ------------------------------------------------------------
 * 1. 按依赖顺序加载核心运行时(js/core/*)
 * 2. 加载全部模块清单 js/modules/&lt;name&gt;/manifest.js(仅元信息,体积极小)
 * 3. 启动应用 App.start()
 *
 * 【新增模块三步】
 * 1. 创建 js/modules/<name>/ 目录
 * 2. 编写 manifest.js(元信息)+ module.js(实现)
 * 3. 在下方 MODULE_DIRS 中登记目录名
 * 完全无需改动 index.html 与任何核心文件。
 * ============================================================ */
(function () {
  'use strict';

  /** 核心运行时加载顺序(依赖顺序,勿乱序) */
  var CORE = [
    'logger',
    'i18n',
    'icons-data',
    'icons',
    'settings',
    'api',
    'auth',
    'ui',
    'avatar',
    'shell',
    'app',
    'workspace',
    'profile',
    'interactions',
  ];

  /** 模块目录清单:侧边栏每个一级菜单对应一个模块 */
  var MODULE_DIRS = ['dashboard', 'channels', 'tokens', 'logs', 'docs', 'settings'];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error('脚本加载失败: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function loadScripts(list) {
    return list.reduce(function (p, src) {
      return p.then(function () {
        return loadScript(src);
      });
    }, Promise.resolve());
  }

  loadScripts(
    CORE.map(function (f) {
      return 'js/core/' + f + '.js';
    })
  )
    .then(function () {
      return loadScripts(
        MODULE_DIRS.map(function (d) {
          return 'js/modules/' + d + '/manifest.js';
        })
      );
    })
    .then(function () {
      if (App.logger) App.logger.info('boot', '核心运行时 + 模块清单加载完成,启动应用');
      App.start();
    })
    .catch(function (e) {
      // logger 可能尚未加载,优先用 logger,回退原生 console
      if (App.logger) App.logger.error('boot', '应用启动失败', e);
      else console.error('[boot] 启动失败', e);
      var app = document.getElementById('app');
      if (app) {
        app.innerHTML =
          '<div style="padding:40px;font-family:monospace;color:var(--destructive)">' +
          'Boot failed: ' +
          e.message +
          '</div>';
      }
    });
})();
