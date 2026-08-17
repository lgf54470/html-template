/* ============================================================
 * logs 模块 — 实现
 * ============================================================ */
(function () {
  'use strict';

  function render(route, ctx) {
    return App.ui.placeholderCard(
      ctx.t,
      'scroll-text',
      ctx.t('logs.title'),
      ctx.t('logs.desc'),
    );
  }

  App.defineModule({ id: 'logs', render: render });
})();
