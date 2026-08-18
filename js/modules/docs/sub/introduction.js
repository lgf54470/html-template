/* ============================================================
 * docs 子模块:简介(独立文件,自包含)
 * 只注册 docs:introduction 的实现,与其它子模块互不影响。
 * 文案全部来自模块懒加载词典 i18n.js(三语言)。
 * ============================================================ */
(function () {
  'use strict';

  function section(t, headKey, bodyKey) {
    return (
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' +
      t(headKey) +
      '</h2>' +
      '<p class="mt-2 text-sm text-muted-foreground">' +
      t(bodyKey) +
      '</p>' +
      '</div>'
    );
  }

  function render(route, ctx) {
    var t = ctx.t;
    var ui = App.ui;
    var icon = App.icon;

    var body =
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' +
      t('docs.introduction.s1') +
      '</h2>' +
      '<p class="mt-2 text-sm text-muted-foreground">' +
      t('docs.introduction.s1p') +
      '</p>' +
      '<ul class="mt-3 list-disc space-y-1 pl-5">' +
      '<li>' +
      t('docs.introduction.l1') +
      '</li>' +
      '<li>' +
      t('docs.introduction.l2') +
      '</li>' +
      '<li>' +
      t('docs.introduction.l3') +
      '</li>' +
      '<li>' +
      t('docs.introduction.l4') +
      '</li>' +
      '</ul></div>' +
      section(t, 'docs.introduction.s2', 'docs.introduction.s2p') +
      section(t, 'docs.introduction.s3', 'docs.introduction.s3p');

    return (
      '<div class="mx-auto flex max-w-3xl flex-col gap-6 docs-page">' +
      '<div data-slot="card" data-size="default" class="' +
      ui.cardClass('') +
      '">' +
      '<div class="' +
      ui.cardContentClass('flex flex-col items-center gap-4 py-16 text-center') +
      '">' +
      '<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">' +
      icon.iconSvg('book-open', { class: 'size-8' }) +
      '</div>' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">' +
      t('docs.introduction.title') +
      '</h1>' +
      '<p class="max-w-md text-sm text-muted-foreground">' +
      t('docs.introduction.desc') +
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

  App.defineModule({ id: 'docs', sub: 'introduction', render: render });
})();
