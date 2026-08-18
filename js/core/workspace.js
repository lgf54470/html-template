/* ============================================================
 * workspace.js — 工作空间交互(零依赖)
 * ------------------------------------------------------------
 * 工作空间状态(列表 + 当前 id)由 settings.js 统一管理、持久化到
 * localStorage 并随其它设置同步到数据库;本模块只负责交互:
 *   - 侧边栏切换工作空间
 *   - 新增工作空间弹窗(名称 + 预设图标 + 强调色)
 * 弹窗样式在 assets/css/app.css(.ws-*)。
 * ============================================================ */
(function () {
  'use strict';

  /** 新增弹窗的草稿状态 */
  var draft = { icon: 'house', color: 'zinc' };
  var dialogOpen = false;

  // 弹窗样式内联注入(避免改动体积庞大的 vendored app.css)
  var WS_STYLE =
    '.ws-dialog-mask{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:1rem}' +
    '.ws-dialog-overlay{position:absolute;inset:0;background:rgb(0 0 0 / .5)}' +
    '.ws-dialog-panel{position:relative;width:100%;max-width:28rem;border:1px solid var(--border);border-radius:.75rem;background:var(--popover);color:var(--popover-foreground);padding:1.25rem;box-shadow:0 20px 50px -12px rgb(0 0 0 / .35)}' +
    '.ws-field-label{display:block;margin-bottom:.5rem;font-size:.875rem;font-weight:500}' +
    '.ws-name-input{width:100%;height:2.5rem;box-sizing:border-box;border:1px solid var(--input);border-radius:var(--radius-md);background:var(--background);color:var(--foreground);padding:0 .75rem;font-size:.875rem;outline:none}' +
    '.ws-name-input:focus-visible{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent)}' +
    '.ws-name-input.ws-name-invalid{border-color:var(--destructive)}' +
    '.ws-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.5rem}' +
    '.ws-pick{display:flex;align-items:center;justify-content:center;height:2.5rem;border:1px solid var(--border);border-radius:.5rem;background:var(--background);color:var(--foreground);cursor:pointer;outline:none}' +
    '.ws-pick:hover{background:var(--muted)}' +
    '.ws-pick.is-active{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary);background:color-mix(in oklab, var(--primary) 8%, var(--background))}' +
    '.ws-dot{display:block;width:1.25rem;height:1.25rem;border-radius:9999px;box-shadow:0 0 0 1px var(--border)}';

  function t() {
    var locale = document.documentElement.lang || App.i18n.DEFAULT_LOCALE;
    return App.i18n.makeT(locale);
  }

  function closeDropdowns() {
    document.querySelectorAll('[data-dropdown-menu]').forEach(function (m) {
      m.classList.remove('open');
    });
    document.querySelectorAll('[data-dropdown-trigger]').forEach(function (tr) {
      tr.removeAttribute('aria-expanded');
    });
  }

  function iconButtons() {
    return App.settings.WORKSPACE_ICONS.map(function (name) {
      var active = draft.icon === name;
      return (
        '<button type="button" data-ws-icon="' +
        name +
        '" aria-pressed="' +
        active +
        '" class="ws-pick' +
        (active ? ' is-active' : '') +
        '" title="' +
        name +
        '">' +
        App.icon.iconSvg(name, { class: 'size-4' }) +
        '</button>'
      );
    }).join('');
  }

  function colorButtons() {
    return App.settings.WORKSPACE_COLORS.map(function (c) {
      var active = draft.color === c;
      return (
        '<button type="button" data-ws-color="' +
        c +
        '" aria-pressed="' +
        active +
        '" class="ws-pick' +
        (active ? ' is-active' : '') +
        '" title="' +
        c +
        '">' +
        '<span class="ws-dot swatch-' +
        c +
        '"></span>' +
        '</button>'
      );
    }).join('');
  }

  function renderDialog() {
    var tt = t();
    return (
      '<style>' +
      WS_STYLE +
      '</style>' +
      '<div data-workspace-dialog class="ws-dialog-mask">' +
      '<div data-workspace-overlay class="ws-dialog-overlay"></div>' +
      '<div class="ws-dialog-panel">' +
      '<h2 class="font-heading text-lg font-semibold">' +
      tt('workspace.title') +
      '</h2>' +
      '<div class="mt-4 space-y-4">' +
      '<div>' +
      '<label class="ws-field-label" for="ws-name">' +
      tt('workspace.nameLabel') +
      '</label>' +
      '<input id="ws-name" data-ws-name type="text" class="ws-name-input" placeholder="' +
      tt('workspace.namePlaceholder') +
      '" />' +
      '</div>' +
      '<div>' +
      '<span class="ws-field-label">' +
      tt('workspace.iconLabel') +
      '</span>' +
      '<div class="ws-grid">' +
      iconButtons() +
      '</div>' +
      '</div>' +
      '<div>' +
      '<span class="ws-field-label">' +
      tt('workspace.colorLabel') +
      '</span>' +
      '<div class="ws-grid">' +
      colorButtons() +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="mt-6 flex justify-end gap-2">' +
      '<button type="button" data-ws-cancel class="' +
      App.ui.buttonClass('outline') +
      '">' +
      tt('workspace.cancel') +
      '</button>' +
      '<button type="button" data-ws-create class="' +
      App.ui.buttonClass('default') +
      '">' +
      tt('workspace.create') +
      '</button>' +
      '</div></div></div>'
    );
  }

  function openDialog() {
    if (dialogOpen) return;
    draft = { icon: 'house', color: 'zinc' };
    var holder = document.createElement('div');
    holder.innerHTML = renderDialog();
    document.body.appendChild(holder.firstElementChild);
    dialogOpen = true;
    var input = document.querySelector('[data-ws-name]');
    if (input) input.focus();
  }

  function closeDialog() {
    if (!dialogOpen) return;
    var el = document.querySelector('[data-workspace-dialog]');
    if (el) el.remove();
    dialogOpen = false;
  }

  function selectIcon(name) {
    draft.icon = name;
    var dialog = document.querySelector('[data-workspace-dialog]');
    if (!dialog) return;
    dialog.querySelectorAll('[data-ws-icon]').forEach(function (b) {
      var on = b.getAttribute('data-ws-icon') === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function selectColor(color) {
    draft.color = color;
    var dialog = document.querySelector('[data-workspace-dialog]');
    if (!dialog) return;
    dialog.querySelectorAll('[data-ws-color]').forEach(function (b) {
      var on = b.getAttribute('data-ws-color') === color;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function submit() {
    var input = document.querySelector('[data-ws-name]');
    var name = input ? input.value.trim() : '';
    if (!name) {
      if (input) {
        input.classList.add('ws-name-invalid');
        input.focus();
      }
      return;
    }
    var ws = {
      id: 'ws-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name,
      icon: draft.icon,
      color: draft.color,
    };
    App.addWorkspace(ws);
    closeDialog();
  }

  /** 切换当前工作空间(旧数据落库 → 写全局指针 → 加载新工作空间数据) */
  function switchTo(id) {
    App.switchWorkspace(id);
    closeDropdowns();
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (target.closest && target.closest('[data-add-workspace]')) {
      closeDropdowns();
      openDialog();
      return;
    }
    var item = target.closest ? target.closest('[data-workspace]') : null;
    if (item) {
      switchTo(item.getAttribute('data-workspace'));
      return;
    }
    var iconBtn = target.closest ? target.closest('[data-ws-icon]') : null;
    if (iconBtn) {
      selectIcon(iconBtn.getAttribute('data-ws-icon'));
      return;
    }
    var colorBtn = target.closest ? target.closest('[data-ws-color]') : null;
    if (colorBtn) {
      selectColor(colorBtn.getAttribute('data-ws-color'));
      return;
    }
    if (target.closest && target.closest('[data-ws-create]')) {
      submit();
      return;
    }
    if (
      target.closest &&
      (target.closest('[data-ws-cancel]') || target.closest('[data-workspace-overlay]'))
    ) {
      closeDialog();
      return;
    }
  });

  // 名称输入后清除非法态;Esc 关闭弹窗
  document.addEventListener('input', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-ws-name')) {
      e.target.classList.remove('ws-name-invalid');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialogOpen) closeDialog();
  });

  window.App = window.App || {};
  App.workspace = { openDialog: openDialog, closeDialog: closeDialog, switchTo: switchTo };
})();
