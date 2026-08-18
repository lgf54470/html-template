/* ============================================================
 * docs 子模块:更新日志(独立文件,自包含)
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
      t('docs.changelog.v1') +
      '</h2>' +
      '<ul class="mt-3 list-disc space-y-1 pl-5">' +
      '<li>' +
      t('docs.changelog.l1') +
      '</li>' +
      '<li>' +
      t('docs.changelog.l2') +
      '</li>' +
      '<li>' +
      t('docs.changelog.l3') +
      '</li>' +
      '<li>' +
      t('docs.changelog.l4') +
      '</li>' +
      '<li>' +
      t('docs.changelog.l5') +
      '</li>' +
      '</ul></div>';

    return (
      '<div class="mx-auto flex max-w-3xl flex-col gap-6 docs-page">' +
      '<div data-slot="card" data-size="default" class="' +
      ui.cardClass('') +
      '">' +
      '<div class="' +
      ui.cardContentClass('flex flex-col items-center gap-4 py-16 text-center') +
      '">' +
      '<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">' +
      icon.iconSvg('scroll-text', { class: 'size-8' }) +
      '</div>' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">' +
      t('docs.changelog.title') +
      '</h1>' +
      '<p class="max-w-md text-sm text-muted-foreground">' +
      t('docs.changelog.desc') +
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

  App.defineModule({ id: 'docs', sub: 'changelog', render: render });
})();
