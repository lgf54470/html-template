/* ============================================================
 * tasks 模块 — 实现(懒加载,首次访问 #/tasks 时下载)
 * 复刻参考项目 shadcn-admin 的 Tasks 页(数据表格):
 * - 模糊搜索(标题/ID) + 状态/优先级 分面过滤器(可搜索选项)
 * - 字段显示控制下拉(View) + 列排序(升/降/隐藏)
 * - 行选择(全选/反选) + 悬浮批量操作栏 + 分页(页码省略号)
 * - 行操作菜单(编辑/标签子菜单/删除) + 新建/编辑抽屉 + 导入弹窗
 * - 多选删除需输入 DELETE 确认;轻提示用 App.ui.toast
 * 零依赖自研,数据为固定种子生成的 100 条任务。
 * ============================================================ */
(function () {
  'use strict';

  var icon = function () {
    return App.icon;
  };

  /* ---------- 选项定义(与参考项目一致) ---------- */
  var LABELS = [
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
    { value: 'documentation', label: 'Documentation' },
  ];
  var STATUSES = [
    { value: 'backlog', label: 'Backlog', icon: 'circle-help' },
    { value: 'todo', label: 'Todo', icon: 'circle' },
    { value: 'in progress', label: 'In Progress', icon: 'timer' },
    { value: 'done', label: 'Done', icon: 'circle-check' },
    { value: 'canceled', label: 'Canceled', icon: 'circle-off' },
  ];
  var PRIORITIES = [
    { value: 'low', label: 'Low', icon: 'arrow-down' },
    { value: 'medium', label: 'Medium', icon: 'arrow-right' },
    { value: 'high', label: 'High', icon: 'arrow-up' },
    { value: 'critical', label: 'Critical', icon: 'circle-alert' },
  ];
  var PAGE_SIZES = [10, 20, 30, 40, 50];

  function byValue(arr, v) {
    for (var i = 0; i < arr.length; i++) if (arr[i].value === v) return arr[i];
    return null;
  }

  /* ---------- 固定种子任务数据(100 条,每次加载一致) ---------- */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(20240817);
  function pick(arr) {
    return arr[Math.floor(rnd() * arr.length)];
  }
  function int(min, max) {
    return Math.floor(rnd() * (max - min + 1)) + min;
  }
  var WORDS = [
    'implement',
    'design',
    'review',
    'refactor',
    'optimize',
    'document',
    'fix',
    'integrate',
    'migrate',
    'configure',
    'validate',
    'monitor',
    'dashboard',
    'checkout',
    'payment',
    'auth',
    'session',
    'webhook',
    'notification',
    'search',
    'filter',
    'pagination',
    'sidebar',
    'layout',
    'theme',
    'component',
    'table',
    'form',
    'dialog',
    'toast',
    'export',
    'import',
    'endpoint',
    'database',
    'schema',
    'migration',
    'index',
    'caching',
    'rate-limit',
    'logging',
    'error-handling',
    'responsive',
    'accessibility',
    'dark-mode',
    'onboarding',
    'billing',
    'subscription',
    'reporting',
    'analytics',
    'sync',
    'batch',
    'queue',
    'upload',
    'preview',
  ];
  var VERBS = [
    'flow',
    'page',
    'system',
    'module',
    'service',
    'view',
    'pipeline',
    'workflow',
    'API',
    'UX',
    'UI',
    'panel',
    'modal',
    'card',
    'screen',
  ];
  function title() {
    var w = pick(WORDS);
    var v = pick(VERBS);
    return w.charAt(0).toUpperCase() + w.slice(1) + ' ' + v + ' #' + int(1, 99);
  }
  var TASKS = [];
  var usedIds = {};
  for (var i = 0; i < 100; i++) {
    var id;
    do {
      id = 'TASK-' + int(1000, 9999);
    } while (usedIds[id]);
    usedIds[id] = true;
    TASKS.push({
      id: id,
      title: title(),
      status: pick(STATUSES).value,
      label: pick(LABELS).value,
      priority: pick(PRIORITIES).value,
    });
  }

  /* ---------- 表格状态 ---------- */
  var state = {
    search: '',
    filterStatus: [], // 选中值数组
    filterPriority: [],
    filterSearch: { status: '', priority: '' }, // 过滤器弹层内的搜索词
    sort: { key: '', dir: '' },
    page: 1,
    pageSize: 10,
    selection: {}, // id → true
    visibility: { title: true, status: true, priority: true },
    dialog: null, // create | update | import | delete | bulk-delete
    currentRow: null,
  };

  function filteredTasks() {
    var q = state.search.trim().toLowerCase();
    var rows = TASKS.filter(function (t) {
      if (q && t.id.toLowerCase().indexOf(q) === -1 && t.title.toLowerCase().indexOf(q) === -1) {
        return false;
      }
      if (state.filterStatus.length && state.filterStatus.indexOf(t.status) === -1) return false;
      if (state.filterPriority.length && state.filterPriority.indexOf(t.priority) === -1)
        return false;
      return true;
    });
    if (state.sort.key) {
      var dir = state.sort.dir === 'desc' ? -1 : 1;
      rows = rows.slice().sort(function (a, b) {
        var av = String(a[state.sort.key]).toLowerCase();
        var bv = String(b[state.sort.key]).toLowerCase();
        return av < bv ? -dir : av > bv ? dir : 0;
      });
    }
    return rows;
  }

  function pageCount() {
    return Math.max(1, Math.ceil(filteredTasks().length / state.pageSize));
  }

  function pageTasks() {
    var rows = filteredTasks();
    var start = (state.page - 1) * state.pageSize;
    return rows.slice(start, start + state.pageSize);
  }

  function selectedCount() {
    return Object.keys(state.selection).filter(function (id) {
      return (
        state.selection[id] &&
        TASKS.some(function (t) {
          return t.id === id;
        })
      );
    }).length;
  }

  /* ---------- 页码省略号(复刻参考实现) ---------- */
  function pageNumbers(current, total) {
    var max = 5;
    var out = [];
    if (total <= max) {
      for (var i = 1; i <= total; i++) out.push(i);
    } else {
      out.push(1);
      if (current <= 3) {
        for (var j = 2; j <= 4; j++) out.push(j);
        out.push('...', total);
      } else if (current >= total - 2) {
        out.push('...');
        for (var k = total - 3; k <= total; k++) out.push(k);
      } else {
        out.push('...');
        for (var m = current - 1; m <= current + 1; m++) out.push(m);
        out.push('...', total);
      }
    }
    return out;
  }

  /* ---------- 转义 ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ---------- 渲染:工具栏 ---------- */
  function sortBtn(t, key, label) {
    var s = state.sort;
    var arrow = s.key === key ? (s.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'chevrons-up-down';
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-task-sort="' +
      key +
      '" class="' +
      App.ui.buttonClass('ghost', 'sm', 'h-8 px-2 font-semibold!') +
      '">' +
      '<span>' +
      label +
      '</span>' +
      icon().iconSvg(arrow, { class: 'size-3.5' }) +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('min-w-40') +
      '">' +
      '<button type="button" data-task-sort-opt="asc" data-key="' +
      key +
      '" class="' +
      App.ui.dropdownItemClass() +
      '">' +
      icon().iconSvg('arrow-up', { class: 'size-3.5 text-muted-foreground/70' }) +
      'Asc</button>' +
      '<button type="button" data-task-sort-opt="desc" data-key="' +
      key +
      '" class="' +
      App.ui.dropdownItemClass() +
      '">' +
      icon().iconSvg('arrow-down', { class: 'size-3.5 text-muted-foreground/70' }) +
      'Desc</button>' +
      App.ui.dropdownSeparator() +
      '<button type="button" data-task-hide-col data-key="' +
      key +
      '" class="' +
      App.ui.dropdownItemClass() +
      '">' +
      icon().iconSvg('eye-off', { class: 'size-3.5 text-muted-foreground/70' }) +
      'Hide</button>' +
      '</div></div>'
    );
  }

  function filterBtn(t, kind, title, options) {
    var sel = kind === 'status' ? state.filterStatus : state.filterPriority;
    var optSearch = kind === 'status' ? state.filterSearch.status : state.filterSearch.priority;
    var visible = options.filter(function (o) {
      return o.label.toLowerCase().indexOf(optSearch.toLowerCase()) !== -1;
    });
    var badges = '';
    if (sel.length) {
      badges =
        '<span class="mx-2 h-4 w-px bg-border"></span>' +
        sel
          .map(function (v) {
            var o = byValue(options, v);
            return o
              ? '<span class="hidden rounded-sm bg-secondary px-1.5 text-xs font-normal text-secondary-foreground lg:inline-block">' +
                  o.label +
                  '</span>'
              : '';
          })
          .join('') +
        (sel.length > 2
          ? '<span class="rounded-sm bg-secondary px-1.5 text-xs font-normal text-secondary-foreground">' +
            sel.length +
            ' selected</span>'
          : '');
    }
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-task-filter="' +
      kind +
      '" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8 border-dashed') +
      '">' +
      icon().iconSvg('circle-plus', { class: 'size-4' }) +
      title +
      badges +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-56') +
      '">' +
      App.ui.searchInput.html({
        placeholder: title,
        value: optSearch,
        attrs: 'data-task-filter-search="' + kind + '"',
        class: 'tk-filter-search-wrap',
      }) +
      '<div class="tk-filter-list">' +
      visible
        .map(function (o) {
          var isSel = sel.indexOf(o.value) !== -1;
          return (
            '<button type="button" data-task-filter-opt="' +
            kind +
            '" data-value="' +
            o.value +
            '" class="' +
            App.ui.dropdownItemClass('') +
            '">' +
            '<span class="tk-check' +
            (isSel ? ' is-checked' : '') +
            '">' +
            icon().iconSvg('check', { class: 'size-3' }) +
            '</span>' +
            (o.icon
              ? '<span class="text-muted-foreground">' +
                icon().iconSvg(o.icon, { class: 'size-4' }) +
                '</span>'
              : '') +
            '<span>' +
            o.label +
            '</span>' +
            '<span class="ms-auto font-mono text-xs">' +
            filteredTasks().filter(function (x) {
              return x[kind] === o.value;
            }).length +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      (visible.length
        ? ''
        : '<div class="px-2 py-6 text-center text-sm text-muted-foreground">No results found.</div>') +
      '</div>' +
      (sel.length
        ? App.ui.dropdownSeparator() +
          '<button type="button" data-task-filter-clear="' +
          kind +
          '" class="' +
          App.ui.dropdownItemClass('justify-center! text-center') +
          '">Clear filters</button>'
        : '') +
      '</div></div>'
    );
  }

  function viewBtn(t) {
    var cols = [
      { key: 'title', label: t('tasks.col.title') },
      { key: 'status', label: t('tasks.col.status') },
      { key: 'priority', label: t('tasks.col.priority') },
    ];
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-task-view class="' +
      App.ui.buttonClass('outline', 'sm', 'ms-auto hidden h-8 lg:inline-flex') +
      '">' +
      icon().iconSvg('sliders-horizontal', { class: 'size-4' }) +
      t('tasks.view') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-48') +
      '">' +
      '<div class="' +
      App.ui.dropdownLabelClass('') +
      '">' +
      t('tasks.toggleCols') +
      '</div>' +
      App.ui.dropdownSeparator() +
      cols
        .map(function (c) {
          var vis = state.visibility[c.key];
          return (
            '<button type="button" data-task-view-col="' +
            c.key +
            '" class="' +
            App.ui.dropdownItemClass('') +
            '">' +
            '<span class="tk-check' +
            (vis ? ' is-checked' : '') +
            '">' +
            icon().iconSvg('check', { class: 'size-3' }) +
            '</span>' +
            '<span class="capitalize">' +
            c.label +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  function toolbarHtml(t) {
    var isFiltered =
      state.search !== '' || state.filterStatus.length || state.filterPriority.length;
    return (
      '<div class="flex items-center justify-between">' +
      '<div class="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">' +
      '<div class="tk-search-input-wrap">' +
      App.ui.searchInput.html({
        placeholder: t('tasks.searchPlaceholder'),
        value: state.search,
        attrs: 'data-task-search',
        clearLabel: t('tasks.searchPlaceholder'),
      }) +
      '</div>' +
      '<div class="flex gap-x-2">' +
      filterBtn(t, 'status', t('tasks.filter.status'), STATUSES) +
      filterBtn(t, 'priority', t('tasks.filter.priority'), PRIORITIES) +
      '</div>' +
      (isFiltered
        ? '<button type="button" data-task-reset class="' +
          App.ui.buttonClass('ghost', 'sm', 'h-8 px-2 lg:px-3') +
          '">' +
          t('tasks.reset') +
          icon().iconSvg('x', { class: 'ms-2 size-4' }) +
          '</button>'
        : '') +
      '</div>' +
      viewBtn(t) +
      '</div>'
    );
  }

  /* ---------- 渲染:表格 ---------- */
  function checkboxHtml(checked, indeterminate, attrs) {
    return (
      '<span class="tk-check' +
      (checked || indeterminate ? ' is-checked' : '') +
      (indeterminate ? ' is-indeterminate' : '') +
      '" data-role="check">' +
      (indeterminate
        ? '<span class="tk-indeterminate"></span>'
        : icon().iconSvg('check', { class: 'size-3' })) +
      '</span>' +
      '<input type="checkbox" ' +
      attrs +
      (checked ? ' checked' : '') +
      ' class="tk-check-input" />'
    );
  }

  function labelBadge(value) {
    var l = byValue(LABELS, value);
    return l ? '<span class="tk-badge" data-variant="outline">' + l.label + '</span>' : '';
  }

  function statusCell(t) {
    var s = byValue(STATUSES, t.status);
    if (!s) return '';
    return (
      '<div class="flex w-28 items-center gap-2">' +
      icon().iconSvg(s.icon, { class: 'size-4 text-muted-foreground' }) +
      '<span>' +
      s.label +
      '</span></div>'
    );
  }

  function priorityCell(t) {
    var p = byValue(PRIORITIES, t.priority);
    if (!p) return '';
    return (
      '<div class="flex items-center gap-2">' +
      icon().iconSvg(p.icon, { class: 'size-4 text-muted-foreground' }) +
      '<span>' +
      p.label +
      '</span></div>'
    );
  }

  function rowActionsHtml(t, row) {
    var sub = LABELS.map(function (l) {
      return (
        '<button type="button" data-task-row-label="' +
        row.id +
        '" data-value="' +
        l.value +
        '" class="' +
        App.ui.dropdownItemClass(row.label === l.value ? ' bg-accent text-accent-foreground' : '') +
        '">' +
        l.label +
        (row.label === l.value ? icon().iconSvg('check', { class: 'size-4' }) : '') +
        '</button>'
      );
    }).join('');
    return (
      '<div class="relative text-right" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-task-row-menu="' +
      row.id +
      '" aria-label="' +
      t('tasks.openMenu') +
      '" class="' +
      App.ui.buttonClass('ghost', 'icon', 'size-8') +
      '">' +
      icon().iconSvg('ellipsis', { class: 'size-4' }) +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-40 right-0!') +
      '">' +
      '<button type="button" data-task-row-edit="' +
      row.id +
      '" class="' +
      App.ui.dropdownItemClass() +
      '">' +
      t('tasks.row.edit') +
      '</button>' +
      '<button type="button" disabled class="' +
      App.ui.dropdownItemClass('data-[disabled]:opacity-50') +
      '">' +
      t('tasks.row.copy') +
      '</button>' +
      '<button type="button" disabled class="' +
      App.ui.dropdownItemClass('data-[disabled]:opacity-50') +
      '">' +
      t('tasks.row.favorite') +
      '</button>' +
      App.ui.dropdownSeparator() +
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="' +
      App.ui.dropdownItemClass('w-full') +
      '">' +
      t('tasks.row.labels') +
      icon().iconSvg('chevron-right', { class: 'ms-auto size-4' }) +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-36') +
      '">' +
      sub +
      '</div>' +
      '</div>' +
      App.ui.dropdownSeparator() +
      '<button type="button" data-task-row-delete="' +
      row.id +
      '" class="' +
      App.ui.dropdownItemClass(
        'text-destructive! focus-visible:text-destructive! data-[highlighted]:text-destructive!'
      ) +
      '">' +
      t('tasks.row.delete') +
      icon().iconSvg('trash-2', { class: 'ms-auto size-4' }) +
      '</button>' +
      '</div></div>'
    );
  }

  function tableHtml(t) {
    var rows = pageTasks();
    var allPageSelected =
      rows.length > 0 &&
      rows.every(function (r) {
        return state.selection[r.id];
      });
    var somePageSelected = rows.some(function (r) {
      return state.selection[r.id];
    });
    var vis = state.visibility;
    var showTitle = vis.title;
    var showStatus = vis.status;
    var showPriority = vis.priority;

    var bodyHtml;
    if (rows.length === 0) {
      bodyHtml =
        '<tr><td colspan="' +
        (4 + (showTitle ? 1 : 0) + (showStatus ? 1 : 0) + (showPriority ? 1 : 0)) +
        '" class="h-24 text-center text-muted-foreground">No results.</td></tr>';
    } else {
      bodyHtml = rows
        .map(function (r) {
          var isSel = !!state.selection[r.id];
          return (
            '<tr class="tk-row' +
            (isSel ? ' is-selected' : '') +
            '" data-task-row="' +
            r.id +
            '">' +
            '<td class="tk-td w-12"><label class="tk-checkbox" data-task-check="' +
            r.id +
            '">' +
            checkboxHtml(isSel, false, 'data-task-check="' + r.id + '"') +
            '</label></td>' +
            '<td class="tk-td w-20 text-muted-foreground">' +
            r.id +
            '</td>' +
            (showTitle
              ? '<td class="tk-td ps-4"><div class="flex items-center space-x-2">' +
                labelBadge(r.label) +
                '<span class="truncate font-medium">' +
                esc(r.title) +
                '</span></div></td>'
              : '') +
            (showStatus ? '<td class="tk-td ps-4">' + statusCell(r) + '</td>' : '') +
            (showPriority ? '<td class="tk-td ps-3">' + priorityCell(r) + '</td>' : '') +
            '<td class="tk-td">' +
            rowActionsHtml(t, r) +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    }

    return (
      '<div class="overflow-hidden rounded-md border">' +
      '<table class="tk-table">' +
      '<thead><tr class="border-b">' +
      '<th class="tk-th w-12"><label class="tk-checkbox" data-task-check-all>' +
      checkboxHtml(allPageSelected, !allPageSelected && somePageSelected, 'data-task-check-all') +
      '</label></th>' +
      '<th class="tk-th w-20">' +
      t('tasks.col.task') +
      '</th>' +
      (showTitle
        ? '<th class="tk-th ps-1">' + sortBtn(t, 'title', t('tasks.col.title')) + '</th>'
        : '') +
      (showStatus
        ? '<th class="tk-th ps-1">' + sortBtn(t, 'status', t('tasks.col.status')) + '</th>'
        : '') +
      (showPriority
        ? '<th class="tk-th ps-1">' + sortBtn(t, 'priority', t('tasks.col.priority')) + '</th>'
        : '') +
      '<th class="tk-th"></th>' +
      '</tr></thead>' +
      '<tbody>' +
      bodyHtml +
      '</tbody>' +
      '</table></div>'
    );
  }

  /* ---------- 渲染:分页 ---------- */
  function paginationHtml(t) {
    var current = state.page;
    var total = pageCount();
    var nums = pageNumbers(current, total);
    var btnBase =
      'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';
    return (
      '<div class="tk-pagination">' +
      '<div class="flex items-center gap-2">' +
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8 w-20') +
      '">' +
      '<span>' +
      state.pageSize +
      '</span>' +
      icon().iconSvg('chevrons-up-down', { class: 'size-3.5' }) +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('min-w-16') +
      '">' +
      PAGE_SIZES.map(function (n) {
        return (
          '<button type="button" data-task-page-size="' +
          n +
          '" class="' +
          App.ui.dropdownItemClass() +
          '">' +
          n +
          '</button>'
        );
      }).join('') +
      '</div></div>' +
      '<p class="hidden text-sm font-medium sm:block">' +
      t('tasks.rowsPerPage') +
      '</p>' +
      '</div>' +
      '<div class="flex items-center gap-1 sm:space-x-1">' +
      '<span class="hidden w-28 text-center text-sm font-medium sm:block">' +
      t('tasks.pageOf', current, total) +
      '</span>' +
      '<button type="button" data-task-page="first" class="' +
      btnBase +
      '" ' +
      (current === 1 ? 'disabled' : '') +
      ' aria-label="' +
      t('tasks.firstPage') +
      '">' +
      icon().iconSvg('chevrons-left', { class: 'size-4' }) +
      '</button>' +
      '<button type="button" data-task-page="prev" class="' +
      btnBase +
      '" ' +
      (current === 1 ? 'disabled' : '') +
      ' aria-label="' +
      t('tasks.prevPage') +
      '">' +
      icon().iconSvg('chevron-left', { class: 'size-4' }) +
      '</button>' +
      nums
        .map(function (n) {
          if (n === '...') return '<span class="px-1 text-sm text-muted-foreground">...</span>';
          return (
            '<button type="button" data-task-page="' +
            n +
            '" class="' +
            btnBase +
            ' ' +
            (current === n
              ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80'
              : 'bg-background hover:bg-muted') +
            '" aria-label="' +
            t('tasks.goToPage', n) +
            '">' +
            n +
            '</button>'
          );
        })
        .join('') +
      '<button type="button" data-task-page="next" class="' +
      btnBase +
      '" ' +
      (current >= total ? 'disabled' : '') +
      ' aria-label="' +
      t('tasks.nextPage') +
      '">' +
      icon().iconSvg('chevron-right', { class: 'size-4' }) +
      '</button>' +
      '<button type="button" data-task-page="last" class="' +
      btnBase +
      '" ' +
      (current >= total ? 'disabled' : '') +
      ' aria-label="' +
      t('tasks.lastPage') +
      '">' +
      icon().iconSvg('chevrons-right', { class: 'size-4' }) +
      '</button>' +
      '</div></div>'
    );
  }

  /* ---------- 渲染:批量操作浮动条 ---------- */
  function bulkActionsHtml(t) {
    var count = selectedCount();
    if (!count) return '';
    var dd = function (label, iconName, items, action) {
      return (
        '<div class="relative" data-dropdown>' +
        '<button type="button" data-dropdown-trigger data-tip="' +
        label +
        '" aria-label="' +
        label +
        '" class="' +
        App.ui.buttonClass('outline', 'icon', 'size-8 rounded-md!') +
        '">' +
        icon().iconSvg(iconName, { class: 'size-4' }) +
        '</button>' +
        '<div data-dropdown-menu class="' +
        App.ui.dropdownContentClass('min-w-40') +
        '">' +
        items
          .map(function (it) {
            return (
              '<button type="button" data-task-bulk="' +
              action +
              '" data-value="' +
              it.value +
              '" class="' +
              App.ui.dropdownItemClass() +
              '">' +
              (it.icon
                ? '<span class="text-muted-foreground">' +
                  icon().iconSvg(it.icon, { class: 'size-4' }) +
                  '</span>'
                : '') +
              it.label +
              '</button>'
            );
          })
          .join('') +
        '</div></div>'
      );
    };
    return (
      '<div role="toolbar" class="tk-bulk-bar">' +
      '<button type="button" data-task-clear-selection class="' +
      App.ui.buttonClass('outline', 'icon', 'size-6 rounded-full!') +
      '" aria-label="' +
      t('tasks.clearSelection') +
      '" data-tip="' +
      t('tasks.clearSelection') +
      '">' +
      icon().iconSvg('x', { class: 'size-4' }) +
      '</button>' +
      '<span class="mx-1 h-5 w-px bg-border"></span>' +
      '<div class="flex items-center gap-1 text-sm">' +
      '<span class="rounded-lg bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">' +
      count +
      '</span>' +
      '<span class="hidden sm:inline">' +
      t(count > 1 ? 'tasks.tasksSelected' : 'tasks.taskSelected') +
      '</span>' +
      '</div>' +
      '<span class="mx-1 h-5 w-px bg-border"></span>' +
      dd(t('tasks.bulkStatus'), 'circle-arrow-up', STATUSES, 'status') +
      dd(t('tasks.bulkPriority'), 'arrow-up-down', PRIORITIES, 'priority') +
      '<button type="button" data-task-bulk-export class="' +
      App.ui.buttonClass('outline', 'icon', 'size-8 rounded-md!') +
      '" data-tip="' +
      t('tasks.bulkExport') +
      '" aria-label="' +
      t('tasks.bulkExport') +
      '">' +
      icon().iconSvg('download', { class: 'size-4' }) +
      '</button>' +
      '<button type="button" data-task-bulk-delete class="' +
      App.ui.buttonClass('destructive', 'icon', 'size-8 rounded-md!') +
      '" data-tip="' +
      t('tasks.bulkDelete') +
      '" aria-label="' +
      t('tasks.bulkDelete') +
      '">' +
      icon().iconSvg('trash-2', { class: 'size-4' }) +
      '</button>' +
      '</div>'
    );
  }

  /* ---------- 渲染:主区域 ---------- */
  function tableRegionHtml(t) {
    return (
      '<div data-task-region class="flex flex-1 flex-col gap-4">' +
      toolbarHtml(t) +
      tableHtml(t) +
      paginationHtml(t) +
      bulkActionsHtml(t) +
      '</div>'
    );
  }

  function render(route, ctx) {
    var t = ctx.t;
    return (
      '<div class="mx-auto flex max-w-6xl flex-1 flex-col gap-4 sm:gap-6">' +
      '<div class="flex flex-wrap items-end justify-between gap-2">' +
      '<div>' +
      '<h2 class="text-2xl font-bold tracking-tight">' +
      t('tasks.title') +
      '</h2>' +
      '<p class="text-muted-foreground">' +
      t('tasks.desc') +
      '</p>' +
      '</div>' +
      '<div class="flex gap-2">' +
      '<button type="button" data-task-open="import" class="' +
      App.ui.buttonClass('outline') +
      '">' +
      '<span>' +
      t('tasks.import') +
      '</span> ' +
      icon().iconSvg('download', { class: 'size-4' }) +
      '</button>' +
      '<button type="button" data-task-open="create" class="' +
      App.ui.buttonClass('default') +
      '">' +
      '<span>' +
      t('tasks.create') +
      '</span> ' +
      icon().iconSvg('plus', { class: 'size-4' }) +
      '</button>' +
      '</div></div>' +
      tableRegionHtml(t) +
      '<div data-tasks-dialog-root></div>' +
      '</div>'
    );
  }

  /* ---------- 弹层:抽屉(新建/编辑) ---------- */
  var draft = { title: '', status: '', label: '', priority: '' };
  var draftError = {};

  function drawerBody(t) {
    var isUpdate = !!state.currentRow;
    var statusDd = STATUSES.map(function (s) {
      return (
        '<button type="button" data-draft-field="status" data-value="' +
        s.value +
        '" class="' +
        App.ui.dropdownItemClass(
          draft.status === s.value ? ' bg-accent text-accent-foreground' : ''
        ) +
        '">' +
        (s.icon
          ? '<span class="text-muted-foreground">' +
            icon().iconSvg(s.icon, { class: 'size-4' }) +
            '</span>'
          : '') +
        s.label +
        (draft.status === s.value ? icon().iconSvg('check', { class: 'size-4' }) : '') +
        '</button>'
      );
    }).join('');
    var labelRadio = LABELS.map(function (l) {
      return (
        '<label class="tk-radio">' +
        '<input type="radio" name="tk-label" data-draft-radio="label" value="' +
        l.value +
        '"' +
        (draft.label === l.value ? ' checked' : '') +
        ' />' +
        '<span class="tk-radio-dot"></span>' +
        '<span class="text-sm">' +
        l.label +
        '</span>' +
        '</label>'
      );
    }).join('');
    var priRadio = PRIORITIES.map(function (p) {
      return (
        '<label class="tk-radio">' +
        '<input type="radio" name="tk-priority" data-draft-radio="priority" value="' +
        p.value +
        '"' +
        (draft.priority === p.value ? ' checked' : '') +
        ' />' +
        '<span class="tk-radio-dot"></span>' +
        '<span class="text-sm">' +
        p.label +
        '</span>' +
        '</label>'
      );
    }).join('');
    return (
      '<div class="flex flex-1 flex-col overflow-hidden">' +
      '<div class="px-6 pt-6">' +
      '<h3 class="text-lg font-semibold">' +
      (isUpdate ? t('tasks.drawer.updateTitle') : t('tasks.drawer.createTitle')) +
      '</h3>' +
      '<p class="mt-1 text-sm text-muted-foreground">' +
      (isUpdate ? t('tasks.drawer.updateDesc') : t('tasks.drawer.createDesc')) +
      '</p>' +
      '</div>' +
      '<div class="tk-drawer-body">' +
      '<div class="tk-field">' +
      '<label class="tk-label">' +
      t('tasks.drawer.title') +
      '</label>' +
      '<input type="text" data-draft-title value="' +
      esc(draft.title) +
      '" placeholder="' +
      t('tasks.drawer.titlePlaceholder') +
      '" class="tk-input" />' +
      (draftError.title ? '<p class="tk-error">' + draftError.title + '</p>' : '') +
      '</div>' +
      '<div class="tk-field">' +
      '<label class="tk-label">' +
      t('tasks.drawer.status') +
      '</label>' +
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="tk-input tk-select-trigger">' +
      '<span class="' +
      (draft.status ? '' : 'tk-placeholder') +
      '">' +
      (draft.status
        ? (byValue(STATUSES, draft.status) || {}).label
        : t('tasks.drawer.statusPlaceholder')) +
      '</span>' +
      icon().iconSvg('chevrons-up-down', { class: 'size-3.5 text-muted-foreground' }) +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-full min-w-40') +
      '">' +
      statusDd +
      '</div>' +
      '</div>' +
      (draftError.status ? '<p class="tk-error">' + draftError.status + '</p>' : '') +
      '</div>' +
      '<div class="tk-field">' +
      '<label class="tk-label">' +
      t('tasks.drawer.label') +
      '</label>' +
      '<div class="flex flex-col space-y-1">' +
      labelRadio +
      '</div>' +
      (draftError.label ? '<p class="tk-error">' + draftError.label + '</p>' : '') +
      '</div>' +
      '<div class="tk-field">' +
      '<label class="tk-label">' +
      t('tasks.drawer.priority') +
      '</label>' +
      '<div class="flex flex-col space-y-1">' +
      priRadio +
      '</div>' +
      (draftError.priority ? '<p class="tk-error">' + draftError.priority + '</p>' : '') +
      '</div>' +
      '</div>' +
      '<div class="tk-drawer-footer">' +
      '<button type="button" data-task-dialog-close class="' +
      App.ui.buttonClass('outline') +
      '">' +
      t('tasks.drawer.close') +
      '</button>' +
      '<button type="button" data-task-drawer-save class="' +
      App.ui.buttonClass('default') +
      '">' +
      t('tasks.drawer.save') +
      '</button>' +
      '</div>' +
      '</div>'
    );
  }

  function openDrawer(mode, row) {
    state.dialog = mode;
    state.currentRow = row || null;
    draft = {
      title: row ? row.title : '',
      status: row ? row.status : '',
      label: row ? row.label : '',
      priority: row ? row.priority : '',
    };
    draftError = {};
    renderDialog();
  }

  /* ---------- 弹层:确认(单删/多删)与导入 ---------- */
  var bulkDeleteInput = '';

  function confirmHtml(t) {
    if (state.dialog === 'delete') {
      var row = state.currentRow;
      return (
        '<div class="tk-dialog">' +
        '<div class="tk-dialog-head">' +
        '<span class="flex size-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">' +
        icon().iconSvg('triangle-alert', { class: 'size-4' }) +
        '</span>' +
        '<h3 class="text-base font-semibold text-destructive">' +
        t('tasks.deleteTitle', row.id) +
        '</h3>' +
        '</div>' +
        '<p class="text-sm text-muted-foreground">' +
        t('tasks.deleteDescBefore') +
        ' <strong>' +
        row.id +
        '</strong>. ' +
        t('tasks.deleteDescAfter') +
        '</p>' +
        '<div class="tk-dialog-foot">' +
        '<button type="button" data-task-dialog-close class="' +
        App.ui.buttonClass('outline') +
        '">' +
        t('tasks.deleteCancel') +
        '</button>' +
        '<button type="button" data-task-confirm-delete class="' +
        App.ui.buttonClass('destructive') +
        '">' +
        t('tasks.deleteConfirm') +
        '</button>' +
        '</div></div>'
      );
    }
    if (state.dialog === 'bulk-delete') {
      var n = selectedCount();
      return (
        '<div class="tk-dialog">' +
        '<div class="tk-dialog-head">' +
        '<span class="flex size-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">' +
        icon().iconSvg('triangle-alert', { class: 'size-4' }) +
        '</span>' +
        '<h3 class="text-base font-semibold text-destructive">' +
        t(n > 1 ? 'tasks.bulkDeleteTitlePlural' : 'tasks.bulkDeleteTitle', n) +
        '</h3>' +
        '</div>' +
        '<p class="mb-4 text-sm text-muted-foreground">' +
        t('tasks.bulkDeleteDesc') +
        '</p>' +
        '<label class="tk-field">' +
        '<span class="tk-label">' +
        t('tasks.bulkDeleteType', 'DELETE') +
        '</span>' +
        '<input type="text" data-task-bulk-delete-input value="' +
        esc(bulkDeleteInput) +
        '" placeholder="' +
        t('tasks.bulkDeletePlaceholder') +
        '" class="tk-input" />' +
        '</label>' +
        '<div class="tk-alert">' +
        '<strong>' +
        t('tasks.warningTitle') +
        '</strong>' +
        '<p class="text-sm">' +
        t('tasks.warningDesc') +
        '</p>' +
        '</div>' +
        '<div class="tk-dialog-foot">' +
        '<button type="button" data-task-dialog-close class="' +
        App.ui.buttonClass('outline') +
        '">' +
        t('tasks.deleteCancel') +
        '</button>' +
        '<button type="button" data-task-confirm-bulk-delete class="' +
        App.ui.buttonClass('destructive') +
        '"' +
        (bulkDeleteInput !== 'DELETE' ? ' disabled' : '') +
        '>' +
        t('tasks.deleteConfirm') +
        '</button>' +
        '</div></div>'
      );
    }
    if (state.dialog === 'import') {
      return (
        '<div class="tk-dialog">' +
        '<div class="tk-dialog-head">' +
        '<h3 class="text-base font-semibold">' +
        t('tasks.importTitle') +
        '</h3>' +
        '</div>' +
        '<p class="text-sm text-muted-foreground">' +
        t('tasks.importDesc') +
        '</p>' +
        '<div class="tk-field">' +
        '<label class="tk-label">' +
        t('tasks.importFile') +
        '</label>' +
        '<input type="file" data-task-import-file accept=".csv,text/csv" class="tk-input tk-file" />' +
        '<p class="tk-file-hint">' +
        t('tasks.importHint') +
        '</p>' +
        '</div>' +
        '<div class="tk-dialog-foot">' +
        '<button type="button" data-task-dialog-close class="' +
        App.ui.buttonClass('outline') +
        '">' +
        t('tasks.importClose') +
        '</button>' +
        '<button type="button" data-task-confirm-import class="' +
        App.ui.buttonClass('default') +
        '">' +
        t('tasks.importConfirm') +
        '</button>' +
        '</div></div>'
      );
    }
    return '';
  }

  function renderDialog() {
    var holder = document.querySelector('[data-tasks-dialog-root]');
    if (!holder) return;
    if (!state.dialog) {
      holder.innerHTML = '';
      return;
    }
    var locale = App.getShellContext().settings.locale;
    var t = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.tasks);
    if (state.dialog === 'create' || state.dialog === 'update') {
      holder.innerHTML =
        '<div class="tk-overlay tk-overlay-drawer" data-task-overlay>' +
        '<div class="tk-drawer" role="dialog" aria-modal="true">' +
        drawerBody(t) +
        '</div></div>';
      return;
    }
    holder.innerHTML = '<div class="tk-overlay" data-task-overlay>' + confirmHtml(t) + '</div>';
  }

  /* ---------- 状态更新与重绘 ---------- */
  function rerender() {
    var region = document.querySelector('[data-task-region]');
    if (region) {
      var locale = App.getShellContext().settings.locale;
      var t = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.tasks);
      region.outerHTML = tableRegionHtml(t);
    }
  }

  function setPage(p) {
    var total = pageCount();
    state.page = Math.max(1, Math.min(total, p));
    rerender();
  }

  function mutateRow(id, patch) {
    for (var i = 0; i < TASKS.length; i++) {
      if (TASKS[i].id === id) {
        TASKS[i] = Object.assign({}, TASKS[i], patch);
        break;
      }
    }
  }

  /* ---------- 事件委托 ---------- */
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var inRegion = !!target.closest('[data-task-region]');
    var inDialog = !!target.closest('[data-tasks-dialog-root]');

    // 打开弹层
    var openBtn = target.closest('[data-task-open]');
    if (openBtn) {
      if (openBtn.getAttribute('data-task-open') === 'create') openDrawer('create', null);
      else state.dialog = 'import';
      renderDialog();
      return;
    }
    // 行操作
    var rowEdit = target.closest('[data-task-row-edit]');
    if (rowEdit) {
      var editId = rowEdit.getAttribute('data-task-row-edit');
      var editRow = null;
      for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === editId) editRow = TASKS[i];
      if (editRow) openDrawer('update', editRow);
      return;
    }
    var rowDelete = target.closest('[data-task-row-delete]');
    if (rowDelete) {
      var delId = rowDelete.getAttribute('data-task-row-delete');
      var delRow = null;
      for (var j = 0; j < TASKS.length; j++) if (TASKS[j].id === delId) delRow = TASKS[j];
      if (delRow) {
        state.dialog = 'delete';
        state.currentRow = delRow;
        renderDialog();
      }
      return;
    }
    var rowLabel = target.closest('[data-task-row-label]');
    if (rowLabel) {
      mutateRow(rowLabel.getAttribute('data-task-row-label'), {
        label: rowLabel.getAttribute('data-value'),
      });
      rerender();
      return;
    }
    // 行选择
    var rowCheck = target.closest('[data-task-check]');
    if (rowCheck) {
      var cid = rowCheck.getAttribute('data-task-check');
      if (cid) {
        state.selection[cid] = !state.selection[cid];
        rerender();
        return;
      }
    }
    var checkAll = target.closest('[data-task-check-all]');
    if (checkAll) {
      var rows = pageTasks();
      var all =
        rows.length > 0 &&
        rows.every(function (r) {
          return state.selection[r.id];
        });
      rows.forEach(function (r) {
        if (all) delete state.selection[r.id];
        else state.selection[r.id] = true;
      });
      rerender();
      return;
    }
    // 排序
    var sortOpt = target.closest('[data-task-sort-opt]');
    if (sortOpt) {
      var key = sortOpt.getAttribute('data-key');
      state.sort = { key: key, dir: sortOpt.getAttribute('data-task-sort-opt') };
      state.page = 1;
      rerender();
      return;
    }
    var hideCol = target.closest('[data-task-hide-col]');
    if (hideCol) {
      var hk = hideCol.getAttribute('data-key');
      state.visibility[hk] = false;
      rerender();
      return;
    }
    // 字段显隐
    var viewCol = target.closest('[data-task-view-col]');
    if (viewCol) {
      var vk = viewCol.getAttribute('data-task-view-col');
      state.visibility[vk] = !state.visibility[vk];
      rerender();
      return;
    }
    // 分面过滤器
    var filterOpt = target.closest('[data-task-filter-opt]');
    if (filterOpt) {
      var fk = filterOpt.getAttribute('data-task-filter-opt');
      var fv = filterOpt.getAttribute('data-value');
      var arr = fk === 'status' ? state.filterStatus : state.filterPriority;
      var idx = arr.indexOf(fv);
      if (idx === -1) arr.push(fv);
      else arr.splice(idx, 1);
      state.page = 1;
      rerender();
      return;
    }
    var filterClear = target.closest('[data-task-filter-clear]');
    if (filterClear) {
      var ck = filterClear.getAttribute('data-task-filter-clear');
      if (ck === 'status') state.filterStatus = [];
      else state.filterPriority = [];
      state.page = 1;
      rerender();
      return;
    }
    // 重置
    var reset = target.closest('[data-task-reset]');
    if (reset) {
      state.search = '';
      state.filterStatus = [];
      state.filterPriority = [];
      state.filterSearch = { status: '', priority: '' };
      state.page = 1;
      rerender();
      return;
    }
    // 分页
    var pageBtn = target.closest('[data-task-page]');
    if (pageBtn) {
      var cmd = pageBtn.getAttribute('data-task-page');
      if (cmd === 'first') setPage(1);
      else if (cmd === 'prev') setPage(state.page - 1);
      else if (cmd === 'next') setPage(state.page + 1);
      else if (cmd === 'last') setPage(pageCount());
      else setPage(parseInt(cmd, 10));
      return;
    }
    var pageSize = target.closest('[data-task-page-size]');
    if (pageSize) {
      state.pageSize = parseInt(pageSize.getAttribute('data-task-page-size'), 10);
      state.page = 1;
      rerender();
      return;
    }
    // 批量操作
    var clearSel = target.closest('[data-task-clear-selection]');
    if (clearSel) {
      state.selection = {};
      rerender();
      return;
    }
    var bulk = target.closest('[data-task-bulk]');
    if (bulk) {
      var bk = bulk.getAttribute('data-task-bulk');
      var bv = bulk.getAttribute('data-value');
      var ids = Object.keys(state.selection).filter(function (id) {
        return state.selection[id];
      });
      ids.forEach(function (id) {
        mutateRow(id, bk === 'status' ? { status: bv } : { priority: bv });
      });
      state.selection = {};
      rerender();
      App.ui.toast(
        (bk === 'status'
          ? 'Status updated to "' + (byValue(STATUSES, bv) || {}).label + '" for '
          : 'Priority updated to "' + (byValue(PRIORITIES, bv) || {}).label + '" for ') +
          ids.length +
          (ids.length > 1 ? ' tasks.' : ' task.'),
        'default'
      );
      return;
    }
    var bulkExport = target.closest('[data-task-bulk-export]');
    if (bulkExport) {
      var ids2 = Object.keys(state.selection).filter(function (id) {
        return state.selection[id];
      });
      state.selection = {};
      rerender();
      App.ui.toast(
        'Exported ' + ids2.length + (ids2.length > 1 ? ' tasks' : ' task') + ' to CSV.',
        'default'
      );
      return;
    }
    var bulkDelete = target.closest('[data-task-bulk-delete]');
    if (bulkDelete) {
      state.dialog = 'bulk-delete';
      bulkDeleteInput = '';
      renderDialog();
      return;
    }
    // 抽屉保存
    var drawerSave = target.closest('[data-task-drawer-save]');
    if (drawerSave) {
      saveDraft();
      return;
    }
    var dialogField = target.closest('[data-draft-field]');
    if (dialogField) {
      draft[dialogField.getAttribute('data-draft-field')] = dialogField.getAttribute('data-value');
      renderDialog();
      return;
    }
    // 弹层关闭/确认
    var dialogClose = target.closest('[data-task-dialog-close]');
    if (dialogClose) {
      state.dialog = null;
      state.currentRow = null;
      renderDialog();
      return;
    }
    var confirmDelete = target.closest('[data-task-confirm-delete]');
    if (confirmDelete) {
      var delRow2 = state.currentRow;
      TASKS = TASKS.filter(function (x) {
        return x.id !== delRow2.id;
      });
      state.selection = {};
      state.dialog = null;
      state.currentRow = null;
      renderDialog();
      rerender();
      App.ui.toast('The task ' + delRow2.id + ' has been deleted.', 'default');
      return;
    }
    var confirmBulk = target.closest('[data-task-confirm-bulk-delete]');
    if (confirmBulk) {
      if (bulkDeleteInput !== 'DELETE') {
        App.ui.toast('Please type "DELETE" to confirm.', 'error');
        return;
      }
      var ids3 = Object.keys(state.selection).filter(function (id) {
        return state.selection[id];
      });
      TASKS = TASKS.filter(function (x) {
        return !state.selection[x.id];
      });
      state.selection = {};
      state.dialog = null;
      renderDialog();
      rerender();
      App.ui.toast('Deleted ' + ids3.length + (ids3.length > 1 ? ' tasks.' : ' task.'), 'default');
      return;
    }
    var confirmImport = target.closest('[data-task-confirm-import]');
    if (confirmImport) {
      var fileInput = document.querySelector('[data-task-import-file]');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        App.ui.toast('Please upload a file.', 'error');
        return;
      }
      if (!/csv/.test((file.type || file.name).toLowerCase())) {
        App.ui.toast('Please upload csv format.', 'error');
        return;
      }
      state.dialog = null;
      renderDialog();
      App.ui.toast('Imported "' + file.name + '" (' + file.size + ' bytes).', 'default');
      return;
    }
    var overlay = target.closest('[data-task-overlay]');
    if (overlay && inDialog && target === overlay) {
      state.dialog = null;
      state.currentRow = null;
      renderDialog();
      return;
    }
    // 行点击(非交互区)不处理
    if (!inRegion && !inDialog) return;
  });

  /* ---------- 输入事件委托(搜索/过滤搜索/草稿/确认词) ---------- */
  document.addEventListener('input', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-task-search]')) {
      state.search = target.value;
      state.page = 1;
      rerender();
      return;
    }
    if (target.closest('[data-task-filter-search]')) {
      var fk = target.getAttribute('data-task-filter-search');
      if (fk === 'status') state.filterSearch.status = target.value;
      else state.filterSearch.priority = target.value;
      // 就地重绘过滤器列表
      var menu = target.closest('[data-dropdown-menu]');
      var list = menu ? menu.querySelector('.tk-filter-list') : null;
      if (list) {
        var options = fk === 'status' ? STATUSES : PRIORITIES;
        var q = target.value.toLowerCase();
        var visible = options.filter(function (o) {
          return o.label.toLowerCase().indexOf(q) !== -1;
        });
        list.innerHTML =
          visible
            .map(function (o) {
              var arr = fk === 'status' ? state.filterStatus : state.filterPriority;
              var isSel = arr.indexOf(o.value) !== -1;
              return (
                '<button type="button" data-task-filter-opt="' +
                fk +
                '" data-value="' +
                o.value +
                '" class="' +
                App.ui.dropdownItemClass('') +
                '">' +
                '<span class="tk-check' +
                (isSel ? ' is-checked' : '') +
                '">' +
                icon().iconSvg('check', { class: 'size-3' }) +
                '</span>' +
                (o.icon
                  ? '<span class="text-muted-foreground">' +
                    icon().iconSvg(o.icon, { class: 'size-4' }) +
                    '</span>'
                  : '') +
                '<span>' +
                o.label +
                '</span>' +
                '<span class="ms-auto font-mono text-xs">' +
                filteredTasks().filter(function (x) {
                  return x[fk] === o.value;
                }).length +
                '</span>' +
                '</button>'
              );
            })
            .join('') ||
          '<div class="px-2 py-6 text-center text-sm text-muted-foreground">No results found.</div>';
      }
      return;
    }
    if (target.closest('[data-draft-title]')) {
      draft.title = target.value;
      return;
    }
    if (target.closest('[data-task-bulk-delete-input]')) {
      bulkDeleteInput = target.value;
      var root = target.closest('[data-tasks-dialog-root]');
      var btn = root ? root.querySelector('[data-task-confirm-bulk-delete]') : null;
      if (btn) btn.disabled = bulkDeleteInput !== 'DELETE';
      return;
    }
  });

  /* 草稿单选框(change 事件,label 包裹隐藏 input) */
  document.addEventListener('change', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-draft-radio]')) {
      draft[target.getAttribute('data-draft-radio')] = target.value;
      renderDialog();
    }
  });

  function saveDraft() {
    var t = App.i18n.makeT(
      App.getShellContext().settings.locale,
      window.__moduleI18n && window.__moduleI18n.tasks
    );
    draftError = {};
    if (!draft.title.trim()) draftError.title = t('tasks.drawer.errTitle');
    if (!draft.status) draftError.status = t('tasks.drawer.errStatus');
    if (!draft.label) draftError.label = t('tasks.drawer.errLabel');
    if (!draft.priority) draftError.priority = t('tasks.drawer.errPriority');
    if (Object.keys(draftError).length) {
      renderDialog();
      return;
    }
    if (state.currentRow) {
      mutateRow(state.currentRow.id, {
        title: draft.title.trim(),
        status: draft.status,
        label: draft.label,
        priority: draft.priority,
      });
      App.ui.toast('Task ' + state.currentRow.id + ' has been updated.', 'default');
    } else {
      var used = {};
      TASKS.forEach(function (x) {
        used[x.id] = true;
      });
      var nid;
      do {
        nid = 'TASK-' + (Math.floor(Math.random() * 9000) + 1000);
      } while (used[nid]);
      TASKS.unshift({
        id: nid,
        title: draft.title.trim(),
        status: draft.status,
        label: draft.label,
        priority: draft.priority,
      });
      state.page = 1;
      App.ui.toast('Task ' + nid + ' has been created.', 'default');
    }
    state.dialog = null;
    state.currentRow = null;
    renderDialog();
    rerender();
  }

  App.defineModule({ id: 'tasks', render: render });
})();
