/* ============================================================
 * ui.js — 共享 UI 组件(零依赖)
 * ------------------------------------------------------------
 * 供所有模块复用的组件 class 与通用页面渲染:
 * button / badge / card / toggle / dropdown / placeholder / 404
 * 模块之间互不引用,只依赖本核心层
 * ============================================================ */
(function () {
  'use strict';

  /** 拼接 HTML class 属性值:转义双引号,避免破坏 HTML 属性边界 */
  function cn() {
    var parts = Array.prototype.slice.call(arguments);
    return parts.filter(Boolean).join(' ').replace(/"/g, '&quot;');
  }

  // ---------- Button ----------
  var BUTTON_BASE =
    'group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4';
  var BUTTON_VARIANTS = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    outline:
      'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
    ghost: 'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
    destructive:
      'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
  };
  var BUTTON_SIZES = {
    default: 'h-8 gap-1.5 rounded-lg px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
    sm: 'h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*="size-"])]:size-3.5',
    lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
    icon: 'size-8',
    'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
  };
  function buttonClass(variant, size, extra) {
    return cn(BUTTON_BASE, BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.default, BUTTON_SIZES[size] || BUTTON_SIZES.default, extra);
  }
  function buttonIcon(variant, size, icon, extra) {
    return '<button type="button" data-slot="button" class="' + buttonClass(variant, size, extra) + '">' +
      App.icon.iconSvg(icon, { class: 'size-4' }) + '</button>';
  }

  // ---------- Badge ----------
  var BADGE_BASE =
    'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!';
  var BADGE_VARIANTS = {
    default: 'border-transparent bg-primary text-primary-foreground [a]:hover:bg-primary/80',
    secondary: 'border-transparent bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
    outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
  };
  function badgeClass(variant, extra) {
    return cn(BADGE_BASE, BADGE_VARIANTS[variant] || BADGE_VARIANTS.secondary, extra);
  }

  // ---------- Card ----------
  var CARD_BASE =
    'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl';
  function cardClass(extra) {
    return cn(CARD_BASE, extra);
  }
  function cardHeaderClass(extra) {
    return cn(
      'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
      extra,
    );
  }
  function cardTitleClass(extra) {
    return cn('font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm', extra);
  }
  function cardContentClass(extra) {
    return cn('px-(--card-spacing)', extra);
  }

  // ---------- Toggle / ToggleGroup ----------
  function toggleItemClass(pressed, extra) {
    return cn(
      'group/toggle inline-flex items-center justify-center gap-1 text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
      'border border-input bg-transparent hover:bg-muted',
      pressed ? 'bg-muted' : '',
      extra,
    );
  }

  // ---------- Dropdown ----------
  function dropdownTriggerClass(extra) {
    return cn(
      'group/dropdown-menu-trigger inline-flex items-center justify-center rounded-lg outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
      extra,
    );
  }
  function dropdownContentClass(width) {
    return cn(
      'hidden absolute z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
      width,
    );
  }
  function dropdownItemClass(extra) {
    return cn(
      'group/dropdown-menu-item flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus-visible:bg-accent focus-visible:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      extra,
    );
  }
  function dropdownLabelClass(extra) {
    return cn('px-2 py-1.5 text-sm font-semibold text-muted-foreground', extra);
  }
  function dropdownSeparator() {
    return '<div role="separator" data-slot="dropdown-menu-separator" class="-mx-1 my-1 h-px bg-border"></div>';
  }

  // ---------- 通用页面渲染 ----------
  /** 子页面占位卡(渠道/令牌/日志/系统等模块共用) */
  function placeholderCard(t, icon, title, desc) {
    return '<div class="mx-auto flex max-w-3xl flex-col gap-6">' +
      '<div data-slot="card" data-size="default" class="' + cardClass('') + '">' +
      '<div class="' + cardContentClass('flex flex-col items-center gap-4 py-16 text-center') + '">' +
      '<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">' + App.icon.iconSvg(icon, { class: 'size-8' }) + '</div>' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">' + title + '</h1>' +
      '<p class="max-w-md text-sm text-muted-foreground">' + desc + '</p>' +
      '<span data-slot="badge" data-variant="secondary" class="' + badgeClass('secondary') + '">' + t('placeholder.wip') + '</span>' +
      '<a href="#/" data-link="/" class="mt-2"><button type="button" class="' + buttonClass('outline') + '">' +
      App.icon.iconSvg('arrow-left', { class: 'size-4' }) + t('placeholder.back') + '</button></a>' +
      '</div></div></div>';
  }

  /** 未知路由 404 兜底 */
  function notFound(t) {
    return '<div class="mx-auto flex max-w-3xl flex-col gap-6">' +
      '<div data-slot="card" data-size="default" class="' + cardClass('') + '">' +
      '<div class="' + cardContentClass('flex flex-col items-center gap-4 py-16 text-center') + '">' +
      '<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">' + App.icon.iconSvg('file-question', { class: 'size-8' }) + '</div>' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">404</h1>' +
      '<p class="max-w-md text-sm text-muted-foreground">' + t('notFound.desc') + '</p>' +
      '<a href="#/" data-link="/" class="mt-2"><button type="button" class="' + buttonClass('outline') + '">' + t('placeholder.back') + '</button></a>' +
      '</div></div></div>';
  }

  window.App = window.App || {};
  App.ui = {
    cn: cn,
    buttonClass: buttonClass,
    buttonIcon: buttonIcon,
    badgeClass: badgeClass,
    cardClass: cardClass,
    cardHeaderClass: cardHeaderClass,
    cardTitleClass: cardTitleClass,
    cardContentClass: cardContentClass,
    toggleItemClass: toggleItemClass,
    dropdownTriggerClass: dropdownTriggerClass,
    dropdownContentClass: dropdownContentClass,
    dropdownItemClass: dropdownItemClass,
    dropdownLabelClass: dropdownLabelClass,
    dropdownSeparator: dropdownSeparator,
    placeholderCard: placeholderCard,
    notFound: notFound,
  };
})();
