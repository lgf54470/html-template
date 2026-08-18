/* ============================================================
 * channels 模块 — 实现
 * 复用核心层通用占位页 App.ui.placeholderCard,仅提供本模块文案
 * ============================================================ */
(function () {
  'use strict';

  function render(route, ctx) {
    return App.ui.placeholderCard(ctx.t, 'route', ctx.t('channels.title'), ctx.t('channels.desc'));
  }

  App.defineModule({ id: 'channels', render: render });
})();
