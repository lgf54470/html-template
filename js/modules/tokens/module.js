/* ============================================================
 * tokens 模块 — 实现
 * ============================================================ */
(function () {
  'use strict';

  function render(route, ctx) {
    return App.ui.placeholderCard(
      ctx.t,
      'key-round',
      ctx.t('tokens.title'),
      ctx.t('tokens.desc'),
    );
  }

  App.defineModule({ id: 'tokens', render: render });
})();
