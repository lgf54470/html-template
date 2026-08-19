/* ============================================================
 * search-input.js — 搜索输入框(公共组件)
 * ------------------------------------------------------------
 * 统一搜索框结构:前置搜索图标(水平居中)+ 输入框 + 输入内容后
 * 出现的清除按钮(×)。样式遵循 shadcn Base UI / Zinc 主题。
 * 用法:
 *   App.ui.searchInput.html({
 *     placeholder: '搜索…',
 *     value: '',
 *     attrs: 'data-hub-search',        // 透传给 input 的额外属性
 *     class: 'is-compact',             // 包装器附加类(可选)
 *   })
 * 行为:
 *   - 清除按钮点击 → 清空输入、聚焦、派发冒泡 input 事件,
 *     消费方既有 document 级 input 委托无需改动。
 *   - 清除按钮可见性由组件在 input 事件中自动维护。
 * 依赖:App.icon.iconSvg。
 * ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function ic(name, cls) {
    return App.icon.iconSvg(name, { class: cls || '' });
  }

  /** 搜索框 HTML(icon + input + 清除按钮) */
  function searchHtml(opts) {
    opts = opts || {};
    var hasVal = !!(opts.value && String(opts.value));
    return (
      '<span class="ui-search' +
      (opts.class ? ' ' + opts.class : '') +
      '" data-ui-search>' +
      '<span class="ui-search-ic">' +
      ic('search') +
      '</span>' +
      '<input type="text" class="ui-search-input" placeholder="' +
      esc(opts.placeholder || '') +
      '" value="' +
      esc(opts.value || '') +
      '" autocomplete="off"' +
      (opts.attrs ? ' ' + opts.attrs : '') +
      ' />' +
      '<button type="button" class="ui-search-clear' +
      (hasVal ? ' is-show' : '') +
      '" data-ui-search-clear tabindex="-1" aria-label="' +
      esc(opts.clearLabel || '') +
      '">' +
      ic('x') +
      '</button>' +
      '</span>'
    );
  }

  /* ---------- 全局委托 ---------- */
  // 输入时同步清除按钮显隐(不重渲染,直接切类)
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('ui-search-input')) return;
    var wrap = t.closest('[data-ui-search]');
    if (!wrap) return;
    var btn = wrap.querySelector('[data-ui-search-clear]');
    if (btn) btn.classList.toggle('is-show', !!t.value);
  });

  // 清除按钮:清空 + 聚焦 + 派发 input(消费方既有委托生效)
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-ui-search-clear]') : null;
    if (!btn) return;
    var wrap = btn.closest('[data-ui-search]');
    var inp = wrap && wrap.querySelector('input');
    if (!inp) return;
    inp.value = '';
    btn.classList.remove('is-show');
    inp.focus();
    try {
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (err) {
      /* 极老环境无 Event 构造时降级为手动触发 */
      if (document.createEvent) {
        var ev = document.createEvent('Event');
        ev.initEvent('input', true, false);
        inp.dispatchEvent(ev);
      }
    }
  });

  /* ---------- 样式注入 ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.querySelector('[data-search-input-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-search-input-style', '');
    style.textContent =
      '.ui-search{position:relative;display:flex;align-items:center;min-width:0;flex:1 1 auto}' +
      '.ui-search-ic{position:absolute;left:.5625rem;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;color:var(--muted-foreground,#71717a);pointer-events:none}' +
      '.ui-search-ic svg{width:.875rem;height:.875rem}' +
      '.ui-search-input{width:100%;height:2rem;box-sizing:border-box;border:1px solid var(--input,#e4e4e7);border-radius:.5rem;background:var(--background,#fff);color:var(--foreground,#18181b);padding:0 1.875rem 0 1.875rem;font-size:.8125rem;font-family:inherit;outline:none}' +
      '.ui-search-input:focus-visible{border-color:var(--ring,#18181b);box-shadow:0 0 0 2px color-mix(in oklab,var(--ring,#18181b) 40%,transparent)}' +
      '.ui-search-clear{position:absolute;right:.375rem;top:50%;transform:translateY(-50%);display:none;align-items:center;justify-content:center;width:1.125rem;height:1.125rem;padding:0;border:0;border-radius:9999px;background:var(--muted,#f4f4f5);color:var(--muted-foreground,#71717a);cursor:pointer}' +
      '.ui-search-clear.is-show{display:inline-flex}' +
      '.ui-search-clear:hover{background:var(--accent,#e4e4e7);color:var(--foreground,#18181b)}' +
      '.ui-search-clear svg{width:.6875rem;height:.6875rem}' +
      /* 紧凑变体(侧栏树内搜索) */
      '.ui-search.is-compact .ui-search-input{height:1.625rem;border-radius:.4375rem;font-size:.75rem;padding-left:1.5rem}' +
      '.ui-search.is-compact .ui-search-ic{left:.4375rem}' +
      '.ui-search.is-compact .ui-search-ic svg{width:.75rem;height:.75rem}';
    document.head.appendChild(style);
  }
  injectStyles();

  window.App = window.App || {};
  App.ui = App.ui || {};
  App.ui.searchInput = { html: searchHtml };
})();
