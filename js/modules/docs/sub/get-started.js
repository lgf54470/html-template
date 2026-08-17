/* ============================================================
 * docs 子模块:快速开始(独立文件,自包含)
 * ============================================================ */
(function () {
  'use strict';

  function render(route, ctx) {
    var t = ctx.t;
    var ui = App.ui;
    var icon = App.icon;

    var body =
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' + t('docs.getStarted.s1') + '</h2>' +
      '<p class="mt-2 text-sm text-muted-foreground">' + t('docs.getStarted.s1p') + '</p>' +
      '</div>' +
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' + t('docs.getStarted.s2') + '</h2>' +
      '<p class="mt-2 text-sm text-muted-foreground">' + t('docs.getStarted.s2p') + '</p>' +
      '<ol class="mt-3 list-decimal space-y-1 pl-5">' +
      '<li><code>js/modules/&lt;name&gt;/</code></li>' +
      '<li>' + t('docs.getStarted.step2') + '</li>' +
      '<li>' + t('docs.getStarted.step3') + '</li>' +
      '</ol></div>' +
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' + t('docs.getStarted.s3') + '</h2>' +
      '<p class="mt-2 text-sm text-muted-foreground">' + t('docs.getStarted.s3p') + '</p>' +
      '</div>';

    return '<div class="mx-auto flex max-w-3xl flex-col gap-6 docs-page">' +
      '<div data-slot="card" data-size="default" class="' + ui.cardClass('') + '">' +
      '<div class="' + ui.cardContentClass('flex flex-col items-center gap-4 py-16 text-center') + '">' +
      '<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">' + icon.iconSvg('rocket', { class: 'size-8' }) + '</div>' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">' + t('docs.getStarted.title') + '</h1>' +
      '<p class="max-w-md text-sm text-muted-foreground">' + t('docs.getStarted.desc') + '</p>' +
      '<span data-slot="badge" data-variant="secondary" class="' + ui.badgeClass('secondary') + '">' + t('docs.wip') + '</span>' +
      '</div></div>' +
      '<div data-slot="card" data-size="default" class="' + ui.cardClass('') + '">' +
      '<div class="' + ui.cardContentClass('flex flex-col gap-6') + '">' + body + '</div>' +
      '</div></div>';
  }

  App.defineModule({ id: 'docs', sub: 'get-started', render: render });
})();
