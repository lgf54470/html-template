/* ============================================================
 * dashboard 模块 — 实现(懒加载,首次访问 #/ 时才下载)
 * 只依赖核心层 App.ui / App.icon,不引用任何其它模块
 * ============================================================ */
(function () {
  'use strict';

  var STATS = [
    { labelKey: 'home.statRequests', icon: 'activity', value: '128,430', chart: 'bg-chart-1/10 text-chart-1' },
    { labelKey: 'home.statTokens', icon: 'coins', value: '4.2M', chart: 'bg-chart-2/10 text-chart-2' },
    { labelKey: 'home.statChannels', icon: 'route', value: '12', chart: 'bg-chart-3/10 text-chart-3' },
    { labelKey: 'home.statLatency', icon: 'timer', value: '183ms', chart: 'bg-chart-4/10 text-chart-4' },
  ];

  var ACTIVITIES = [];
  for (var i = 0; i < 14; i++) {
    ACTIVITIES.push({
      id: i + 1,
      desc: 'channel-' + ((i % 5) + 1) + ' · model gpt-4o-mini · 1.2s · ' + (1000 + i * 137) + ' tokens',
      ok: i % 4 !== 0,
    });
  }

  function render(route, ctx) {
    var t = ctx.t;
    var ui = App.ui;
    var icon = App.icon;

    var statsHtml = STATS.map(function (stat) {
      return '<div data-slot="card" data-size="default" class="' + ui.cardClass('') + '">' +
        '<div class="' + ui.cardHeaderClass('flex! flex-row items-center justify-between gap-3') + '">' +
        '<div data-slot="card-title" class="' + ui.cardTitleClass('text-sm font-medium text-muted-foreground') + '">' + t(stat.labelKey) + '</div>' +
        '<span class="flex size-9 shrink-0 items-center justify-center rounded-lg ' + stat.chart + '">' + icon.iconSvg(stat.icon, { class: 'size-4.5' }) + '</span>' +
        '</div>' +
        '<div class="' + ui.cardContentClass() + '">' +
        '<div class="text-2xl font-bold tracking-tight">' + stat.value + '</div>' +
        '</div></div>';
    }).join('');

    var activitiesHtml = ACTIVITIES.map(function (item) {
      return '<div class="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">' +
        '<span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">' + item.id + '</span>' +
        '<div class="min-w-0 flex-1">' +
        '<p class="truncate text-sm font-medium">' + t('home.requestTitle', item.id) + '</p>' +
        '<p class="truncate text-xs text-muted-foreground">' + item.desc + '</p>' +
        '</div>' +
        '<span data-slot="badge" data-variant="' + (item.ok ? 'secondary' : 'outline') + '" class="' + ui.badgeClass(item.ok ? 'secondary' : 'outline') + '">' + (item.ok ? t('home.success') : t('home.retrying')) + '</span>' +
        '</div>';
    }).join('');

    return '<div class="mx-auto flex max-w-5xl flex-col gap-6">' +
      '<div data-slot="card" data-size="default" class="' + ui.cardClass('[--card-spacing:--spacing(6)] shadow-sm') + '">' +
      '<div class="' + ui.cardContentClass() + '">' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">' + t('home.welcomeTitle') + '</h1>' +
      '<p class="mt-2 max-w-2xl text-sm text-muted-foreground">' + t('home.welcomeDesc') + '</p>' +
      '</div></div>' +
      '<section>' +
      '<h2 class="font-heading mb-3 text-lg font-medium">' + t('home.overview') + '</h2>' +
      '<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">' + statsHtml + '</div>' +
      '</section>' +
      '<div data-slot="card" data-size="default" class="' + ui.cardClass('[--card-spacing:--spacing(6)] shadow-sm') + '">' +
      '<div class="' + ui.cardContentClass('flex flex-col gap-4') + '">' +
      '<div>' +
      '<h2 class="font-heading text-lg font-medium">' + t('home.activityTitle') + '</h2>' +
      '<p class="mt-1 text-sm text-muted-foreground">' + t('home.activityDesc') + '</p>' +
      '</div>' +
      '<div class="space-y-3">' + activitiesHtml + '</div>' +
      '</div></div></div>';
  }

  App.defineModule({ id: 'dashboard', render: render });
})();
