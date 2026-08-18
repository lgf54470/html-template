/* ============================================================
 * docs 子模块:教程(独立文件,自包含)
 * ============================================================ */
(function () {
  'use strict';

  function render(route, ctx) {
    var t = ctx.t;
    var ui = App.ui;
    var icon = App.icon;

    var body =
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' +
      t('docs.tutorials.s1') +
      '</h2>' +
      '<p class="mt-2 text-sm text-muted-foreground">' +
      t('docs.tutorials.s1p') +
      '</p>' +
      '<pre><code>' +
      t('docs.tutorials.code1') +
      '</code></pre>' +
      '</div>' +
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' +
      t('docs.tutorials.s2') +
      '</h2>' +
      '<p class="mt-2 text-sm text-muted-foreground">' +
      t('docs.tutorials.s2p') +
      '</p>' +
      '<pre><code>' +
      t('docs.tutorials.code2') +
      '</code></pre>' +
      '</div>' +
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' +
      t('docs.tutorials.s3') +
      '</h2>' +
      '<p class="mt-2 text-sm text-muted-foreground">' +
      t('docs.tutorials.s3p') +
      '</p>' +
      '</div>';

    return (
      '<div class="mx-auto flex max-w-3xl flex-col gap-6 docs-page">' +
      '<div data-slot="card" data-size="default" class="' +
      ui.cardClass('') +
      '">' +
      '<div class="' +
      ui.cardContentClass('flex flex-col items-center gap-4 py-16 text-center') +
      '">' +
      '<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">' +
      icon.iconSvg('circle-check', { class: 'size-8' }) +
      '</div>' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">' +
      t('docs.tutorials.title') +
      '</h1>' +
      '<p class="max-w-md text-sm text-muted-foreground">' +
      t('docs.tutorials.desc') +
      '</p>' +
      '<span data-slot="badge" data-variant="secondary" class="' +
      ui.badgeClass('secondary') +
      '">' +
      t('docs.wip') +
      '</span>' +
      '</div></div>' +
      '<div data-slot="card" data-size="default" class="' +
      ui.cardClass('') +
      '">' +
      '<div class="' +
      ui.cardContentClass('flex flex-col gap-6') +
      '">' +
      body +
      '</div>' +
      '</div></div>'
    );
  }

  App.defineModule({ id: 'docs', sub: 'tutorials', render: render });
})();
