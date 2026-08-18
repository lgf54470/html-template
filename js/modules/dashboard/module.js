/* ============================================================
 * dashboard 模块 — 实现(懒加载,首次访问 #/ 时才下载)
 * 复刻参考项目 shadcn-admin 的 Dashboard 页:统计卡 + 标签页 +
 * Chart.js 柱状/面积图 + 最近销售 + 分析(流量/来源/设备)。
 * 只依赖核心层 App.ui / App.icon;图表用 js/lib/chart.umd.js
 * (单文件 Chart.js v4.4.7,index.html 入口同步加载)。
 * ============================================================ */
(function () {
  'use strict';

  var icon = function () {
    return App.icon;
  };

  /* ---------- 数据(固定值,与参考项目一致) ---------- */
  var STATS = [
    { key: 'revenue', value: '$45,231.89', delta: '+20.1% from last month', ic: 'dollar-sign' },
    { key: 'subscriptions', value: '+2350', delta: '+180.1% from last month', ic: 'users' },
    { key: 'sales', value: '+12,234', delta: '+19% from last month', ic: 'credit-card' },
    { key: 'active', value: '+573', delta: '+201 since last hour', ic: 'activity' },
  ];

  var ANALYTICS_STATS = [
    { key: 'clicks', value: '1,248', delta: '+12.4% vs last week', ic: 'activity' },
    { key: 'uniques', value: '832', delta: '+5.8% vs last week', ic: 'users' },
    { key: 'bounce', value: '42%', delta: '-3.2% vs last week', ic: 'circle-dot' },
    { key: 'session', value: '3m 24s', delta: '+18s vs last week', ic: 'timer' },
  ];

  var BAR_DATA = [
    { name: 'Jan', total: 1870 },
    { name: 'Feb', total: 2250 },
    { name: 'Mar', total: 1320 },
    { name: 'Apr', total: 3120 },
    { name: 'May', total: 2490 },
    { name: 'Jun', total: 3980 },
    { name: 'Jul', total: 2110 },
    { name: 'Aug', total: 3540 },
    { name: 'Sep', total: 2830 },
    { name: 'Oct', total: 1890 },
    { name: 'Nov', total: 3310 },
    { name: 'Dec', total: 4140 },
  ];

  var AREA_DATA = [
    { name: 'Mon', clicks: 420, uniques: 260 },
    { name: 'Tue', clicks: 510, uniques: 330 },
    { name: 'Wed', clicks: 640, uniques: 410 },
    { name: 'Thu', clicks: 580, uniques: 380 },
    { name: 'Fri', clicks: 720, uniques: 450 },
    { name: 'Sat', clicks: 460, uniques: 310 },
    { name: 'Sun', clicks: 390, uniques: 240 },
  ];

  var RECENT_SALES = [
    {
      initials: 'OM',
      name: 'Olivia Martin',
      email: 'olivia.martin@email.com',
      amount: '+$1,999.00',
    },
    { initials: 'JL', name: 'Jackson Lee', email: 'jackson.lee@email.com', amount: '+$39.00' },
    {
      initials: 'IN',
      name: 'Isabella Nguyen',
      email: 'isabella.nguyen@email.com',
      amount: '+$299.00',
    },
    { initials: 'WK', name: 'William Kim', email: 'will@email.com', amount: '+$99.00' },
    { initials: 'SD', name: 'Sofia Davis', email: 'sofia.davis@email.com', amount: '+$39.00' },
  ];

  var REFERRERS = [
    { name: 'Direct', value: 512 },
    { name: 'Product Hunt', value: 238 },
    { name: 'Twitter', value: 174 },
    { name: 'Blog', value: 104 },
  ];

  var DEVICES = [
    { name: 'Desktop', value: 74 },
    { name: 'Mobile', value: 22 },
    { name: 'Tablet', value: 4 },
  ];

  /* ---------- Chart.js 图表(js/lib/chart.umd.js,入口同步加载) ---------- */
  /** 固定高度容器 + canvas 占位;图表在渲染完成后经 app:afterRender 初始化 */
  function chartBoxHtml(height, kind, ariaLabel) {
    return (
      '<div style="position:relative;height:' +
      height +
      'px">' +
      '<canvas data-db-chart="' +
      kind +
      '" role="img" aria-label="' +
      ariaLabel +
      '"></canvas>' +
      '</div>'
    );
  }

  function barChartHtml(t) {
    return chartBoxHtml(350, 'overview-bar', t('dashboard.chart.barAria'));
  }

  function areaChartHtml(t) {
    return chartBoxHtml(300, 'analytics-area', t('dashboard.chart.areaAria'));
  }

  /** 读取设计系统 CSS 变量(主题/强调色变化后重新读取,图表配色随之刷新) */
  function cssVar(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v || '').trim();
  }

  function chartColors() {
    return {
      primary: cssVar('--primary') || '#18181b',
      muted: cssVar('--muted-foreground') || '#71717a',
      border: cssVar('--border') || '#e4e4e7',
      popover: cssVar('--popover') || '#ffffff',
      foreground: cssVar('--foreground') || '#18181b',
    };
  }

  /** 类 shadcn 的 Tooltip(跟随 popover/边框/前景设计变量) */
  function tooltipConfig(colors) {
    return {
      backgroundColor: colors.popover,
      titleColor: colors.foreground,
      bodyColor: colors.muted,
      borderColor: colors.border,
      borderWidth: 1,
      cornerRadius: 8,
      padding: 8,
      boxPadding: 4,
      displayColors: false,
      titleFont: { size: 12, weight: '600' },
      bodyFont: { size: 12 },
    };
  }

  /** Overview 柱状图(与参考 recharts BarChart 对齐:无网格、y 轴 $ 前缀、圆角柱) */
  function barChartConfig() {
    var colors = chartColors();
    return {
      type: 'bar',
      data: {
        labels: BAR_DATA.map(function (d) {
          return d.name;
        }),
        datasets: [
          {
            label: 'Total',
            data: BAR_DATA.map(function (d) {
              return d.total;
            }),
            backgroundColor: colors.primary,
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 42,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: tooltipConfig(colors) },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: colors.muted, font: { size: 12 } },
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: colors.muted,
              font: { size: 12 },
              callback: function (v) {
                return '$' + v;
              },
            },
          },
        },
      },
    };
  }

  /** Analytics 面积图(与参考 recharts AreaChart 对齐:渐变填充、平滑曲线、无点) */
  function areaChartConfig() {
    var colors = chartColors();
    function dataset(key, label, color) {
      return {
        label: label,
        data: AREA_DATA.map(function (d) {
          return d[key];
        }),
        borderColor: color,
        backgroundColor: function (context) {
          var chart = context.chart;
          if (!chart.chartArea) return color;
          var g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
          g.addColorStop(0, color);
          g.addColorStop(1, 'transparent');
          return g;
        },
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
      };
    }
    return {
      type: 'line',
      data: {
        labels: AREA_DATA.map(function (d) {
          return d.name;
        }),
        datasets: [
          dataset('clicks', 'Clicks', colors.primary),
          dataset('uniques', 'Uniques', colors.muted),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: tooltipConfig(colors) },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: colors.muted, font: { size: 12 } },
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: colors.muted, font: { size: 12 } },
          },
        },
      },
    };
  }

  /**
   * 初始化 / 刷新图表。force=true 时销毁重建(路由重渲染、主题变化后重新
   * 读取设计变量);false 时只补建缺失图表并对可见图表 resize(切到
   * Analytics 标签时 analytics-area 首次可见,Chart.js 经 ResizeObserver
   * 自动适配宽度)。
   */
  function initCharts(force) {
    if (!window.Chart) return;
    Array.prototype.forEach.call(
      document.querySelectorAll('canvas[data-db-chart]'),
      function (cv) {
        var existing = window.Chart.getChart(cv);
        if (existing && !force) {
          if (cv.offsetParent !== null) existing.resize();
          return;
        }
        if (existing) existing.destroy();
        var kind = cv.getAttribute('data-db-chart');
        var cfg = kind === 'overview-bar' ? barChartConfig() : areaChartConfig();
        new window.Chart(cv, cfg);
      }
    );
  }

  /** 图表默认字体跟随设计系统正文字体 */
  function applyChartFont() {
    if (!window.Chart) return;
    var f = cssVar('--font-sans-base');
    if (f) window.Chart.defaults.font.family = f;
  }

  /* ---------- 卡片与列表 ---------- */
  function statCard(t, stat) {
    return (
      '<div data-slot="card" class="' +
      App.ui.cardClass('') +
      '">' +
      '<div class="' +
      App.ui.cardHeaderClass('flex! flex-row items-center justify-between gap-3') +
      '">' +
      '<div data-slot="card-title" class="' +
      App.ui.cardTitleClass('text-sm font-medium') +
      '">' +
      t('dashboard.stat.' + stat.key) +
      '</div>' +
      '<span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">' +
      icon().iconSvg(stat.ic, { class: 'size-4' }) +
      '</span>' +
      '</div>' +
      '<div class="' +
      App.ui.cardContentClass('') +
      '">' +
      '<div class="text-2xl font-bold">' +
      stat.value +
      '</div>' +
      '<p class="text-xs text-muted-foreground">' +
      stat.delta +
      '</p>' +
      '</div></div>'
    );
  }

  function recentSalesHtml(_t) {
    return (
      '<div class="space-y-8">' +
      RECENT_SALES.map(function (s) {
        return (
          '<div class="flex items-center gap-4">' +
          '<span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">' +
          s.initials +
          '</span>' +
          '<div class="flex flex-1 flex-wrap items-center justify-between">' +
          '<div class="space-y-1">' +
          '<p class="text-sm leading-none font-medium">' +
          s.name +
          '</p>' +
          '<p class="text-sm text-muted-foreground">' +
          s.email +
          '</p>' +
          '</div>' +
          '<div class="font-medium">' +
          s.amount +
          '</div>' +
          '</div></div>'
        );
      }).join('') +
      '</div>'
    );
  }

  function barListHtml(t, items, formatter, barClass) {
    var max = Math.max.apply(
      null,
      items
        .map(function (i) {
          return i.value;
        })
        .concat([1])
    );
    return (
      '<ul class="space-y-3">' +
      items
        .map(function (i) {
          var width = Math.round((i.value / max) * 100);
          return (
            '<li class="flex items-center justify-between gap-3">' +
            '<div class="min-w-0 flex-1">' +
            '<div class="mb-1 truncate text-xs text-muted-foreground">' +
            i.name +
            '</div>' +
            '<div class="h-2.5 w-full rounded-full bg-muted">' +
            '<div class="h-2.5 rounded-full ' +
            barClass +
            '" style="width:' +
            width +
            '%"></div>' +
            '</div></div>' +
            '<div class="ps-2 text-xs font-medium tabular-nums">' +
            formatter(i.value) +
            '</div>' +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  /* ---------- 标签页 ---------- */
  function tabsHtml(t) {
    var tabs = [
      { id: 'overview', label: t('dashboard.tab.overview'), disabled: false },
      { id: 'analytics', label: t('dashboard.tab.analytics'), disabled: false },
      { id: 'reports', label: t('dashboard.tab.reports'), disabled: true },
      { id: 'notifications', label: t('dashboard.tab.notifications'), disabled: true },
    ];
    return (
      '<div class="w-full overflow-x-auto pb-2">' +
      '<div role="tablist" class="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">' +
      tabs
        .map(function (tab) {
          return (
            '<button type="button" role="tab" data-db-tab="' +
            tab.id +
            '" class="db-tab' +
            (tab.id === 'overview' ? ' is-active' : '') +
            (tab.disabled ? ' is-disabled' : '') +
            '"' +
            (tab.disabled ? ' disabled' : '') +
            '>' +
            tab.label +
            '</button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  function overviewTab(t) {
    return (
      '<div data-db-panel="overview" class="db-panel space-y-4">' +
      '<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">' +
      STATS.map(function (s) {
        return statCard(t, s);
      }).join('') +
      '</div>' +
      '<div class="grid grid-cols-1 gap-4 lg:grid-cols-7">' +
      '<div data-slot="card" class="' +
      App.ui.cardClass('col-span-1 lg:col-span-4') +
      '">' +
      '<div class="' +
      App.ui.cardHeaderClass('') +
      '">' +
      '<div data-slot="card-title" class="' +
      App.ui.cardTitleClass('') +
      '">' +
      t('dashboard.overview.title') +
      '</div>' +
      '</div>' +
      '<div class="' +
      App.ui.cardContentClass('ps-2') +
      '">' +
      barChartHtml(t) +
      '</div>' +
      '</div>' +
      '<div data-slot="card" class="' +
      App.ui.cardClass('col-span-1 lg:col-span-3') +
      '">' +
      '<div class="' +
      App.ui.cardHeaderClass('') +
      '">' +
      '<div data-slot="card-title" class="' +
      App.ui.cardTitleClass('') +
      '">' +
      t('dashboard.recent.title') +
      '</div>' +
      '<div data-slot="card-description" class="text-sm text-muted-foreground">' +
      t('dashboard.recent.desc') +
      '</div>' +
      '</div>' +
      '<div class="' +
      App.ui.cardContentClass('') +
      '">' +
      recentSalesHtml(t) +
      '</div>' +
      '</div></div></div>'
    );
  }

  function analyticsTab(t) {
    return (
      '<div data-db-panel="analytics" class="db-panel hidden space-y-4">' +
      '<div data-slot="card" class="' +
      App.ui.cardClass('') +
      '">' +
      '<div class="' +
      App.ui.cardHeaderClass('') +
      '">' +
      '<div data-slot="card-title" class="' +
      App.ui.cardTitleClass('') +
      '">' +
      t('dashboard.traffic.title') +
      '</div>' +
      '<div data-slot="card-description" class="text-sm text-muted-foreground">' +
      t('dashboard.traffic.desc') +
      '</div>' +
      '</div>' +
      '<div class="' +
      App.ui.cardContentClass('px-6') +
      '">' +
      areaChartHtml(t) +
      '</div>' +
      '</div>' +
      '<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">' +
      ANALYTICS_STATS.map(function (s) {
        return statCard(t, s);
      }).join('') +
      '</div>' +
      '<div class="grid grid-cols-1 gap-4 lg:grid-cols-7">' +
      '<div data-slot="card" class="' +
      App.ui.cardClass('col-span-1 lg:col-span-4') +
      '">' +
      '<div class="' +
      App.ui.cardHeaderClass('') +
      '">' +
      '<div data-slot="card-title" class="' +
      App.ui.cardTitleClass('') +
      '">' +
      t('dashboard.referrers.title') +
      '</div>' +
      '<div data-slot="card-description" class="text-sm text-muted-foreground">' +
      t('dashboard.referrers.desc') +
      '</div>' +
      '</div>' +
      '<div class="' +
      App.ui.cardContentClass('') +
      '">' +
      barListHtml(
        t,
        REFERRERS,
        function (n) {
          return String(n);
        },
        'bg-primary'
      ) +
      '</div>' +
      '</div>' +
      '<div data-slot="card" class="' +
      App.ui.cardClass('col-span-1 lg:col-span-3') +
      '">' +
      '<div class="' +
      App.ui.cardHeaderClass('') +
      '">' +
      '<div data-slot="card-title" class="' +
      App.ui.cardTitleClass('') +
      '">' +
      t('dashboard.devices.title') +
      '</div>' +
      '<div data-slot="card-description" class="text-sm text-muted-foreground">' +
      t('dashboard.devices.desc') +
      '</div>' +
      '</div>' +
      '<div class="' +
      App.ui.cardContentClass('') +
      '">' +
      barListHtml(
        t,
        DEVICES,
        function (n) {
          return n + '%';
        },
        'bg-muted-foreground'
      ) +
      '</div>' +
      '</div></div></div>'
    );
  }

  /* ---------- 渲染 ---------- */
  function render(route, ctx) {
    var t = ctx.t;
    return (
      '<div class="mx-auto flex max-w-7xl flex-col gap-4">' +
      '<div class="mb-2 flex items-center justify-between space-y-2">' +
      '<h1 class="text-2xl font-bold tracking-tight">' +
      t('dashboard.title') +
      '</h1>' +
      '<button type="button" data-db-download class="' +
      App.ui.buttonClass('default') +
      '">' +
      t('dashboard.download') +
      '</button>' +
      '</div>' +
      tabsHtml(t) +
      overviewTab(t) +
      analyticsTab(t) +
      '</div>'
    );
  }

  /* ---------- 交互(事件委托) ---------- */
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var tab = target.closest('[data-db-tab]');
    if (tab) {
      if (tab.disabled) return;
      document.querySelectorAll('[data-db-tab]').forEach(function (el) {
        el.classList.toggle('is-active', el === tab);
      });
      var id = tab.getAttribute('data-db-tab');
      document.querySelectorAll('[data-db-panel]').forEach(function (panel) {
        panel.classList.toggle('hidden', panel.getAttribute('data-db-panel') !== id);
      });
      initCharts(false); // 首次切到 Analytics 时补建面积图;已可见图表仅 resize
      return;
    }
    if (target.closest('[data-db-download]')) {
      App.ui.toast('Dashboard exported to CSV.', 'default');
      return;
    }
  });

  /* ---------- 图表生命周期:路由渲染完成后初始化,主题/外观变化后重建 ---------- */
  document.addEventListener('app:afterRender', function (e) {
    var path = e.detail && e.detail.path;
    if (path !== '/' && path !== '') return;
    applyChartFont();
    initCharts(true);
  });
  document.addEventListener('app:themechange', function () {
    if (App.currentPath && App.currentPath() !== '/') return;
    applyChartFont();
    initCharts(true);
  });

  App.defineModule({ id: 'dashboard', render: render });
})();
