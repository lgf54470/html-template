/* ============================================================
 * system 模块 — 实现
 * ============================================================ */
(function () {
  'use strict';

  function render(route, ctx) {
    return App.ui.placeholderCard(
      ctx.t,
      'settings',
      ctx.t('system.title'),
      ctx.t('system.desc'),
    );
  }

  App.defineModule({ id: 'system', render: render });
})();
