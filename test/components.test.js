/* ============================================================
 * 公共组件测试 — color-picker.js / group-tree.js
 * ------------------------------------------------------------
 * 在 VM 沙箱(最小 DOM 桩)中加载两个核心组件,验证:
 *   - 色彩数学:hex/rgb/hsl/hsv 解析、转换、多格式输出、调色板
 *   - 分组树:子孙计算、子节点排序、拖放解析(前/后/内部/根/非法)、
 *     不可变移动与 sort 重排、实例渲染与展开/折叠
 * ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

/** 加载两个核心组件,返回带 App 的沙箱 */
function loadCore() {
  const makeEl = () => ({
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  });
  const sandbox = {
    window: {},
    document: {
      addEventListener() {},
      removeEventListener() {},
      createElement: makeEl,
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      head: { appendChild() {} },
      body: { appendChild() {} },
    },
    navigator: { clipboard: null },
    getComputedStyle() {
      return { getPropertyValue: () => '' };
    },
    App: { icon: { iconSvg: () => '<svg></svg>' } },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of [
    'js/core/color-picker.js',
    'js/core/group-tree.js',
    'js/core/tag-picker.js',
    'js/core/search-input.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const sandbox = loadCore();
const { color, groupTree, tagPicker } = sandbox.App.ui;

/** 跨 realm 对象(VM 沙箱原型不同)先 JSON 归一化再断言 */
function eq(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

/* ---------- 色彩数学 ---------- */
test('color: parseHex 支持 #rgb / #rrggbb / #rrggbbaa', () => {
  eq(color.parseHex('#f00'), { r: 255, g: 0, b: 0 });
  eq(color.parseHex('#ff0000'), { r: 255, g: 0, b: 0 });
  eq(color.parseHex('#ff000080'), { r: 255, g: 0, b: 0 });
  assert.equal(color.parseHex('#zzz'), null);
  assert.equal(color.parseHex(''), null);
});

test('color: rgb↔hsl 转换', () => {
  eq(color.rgbToHsl(255, 0, 0), { h: 0, s: 100, l: 50 });
  eq(color.hslToRgb(0, 100, 50), { r: 255, g: 0, b: 0 });
  eq(color.rgbToHsl(0, 255, 0), { h: 120, s: 100, l: 50 });
  eq(color.rgbToHsl(0, 0, 255), { h: 240, s: 100, l: 50 });
});

test('color: rgb↔hsv 转换', () => {
  eq(color.rgbToHsv(255, 0, 0), { h: 0, s: 100, v: 100 });
  eq(color.hsvToRgb(0, 100, 100), { r: 255, g: 0, b: 0 });
  eq(color.rgbToHsv(0, 0, 0), { h: 0, s: 0, v: 0 });
});

test('color: 随机色 roundtrip(hex→rgb→hsl→rgb→hex,容差 ±3)', () => {
  // s/l 以整数存储,往返允许 ±3(拾色器显示精度足够)
  for (let i = 0; i < 50; i++) {
    const hex =
      '#' +
      [0, 1, 2]
        .map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
        .join('');
    const rgb = color.parseHex(hex);
    const hsl = color.rgbToHsl(rgb.r, rgb.g, rgb.b);
    const back = color.hslToRgb(hsl.h, hsl.s, hsl.l);
    for (const ch of ['r', 'g', 'b']) {
      assert.ok(Math.abs(back[ch] - rgb[ch]) <= 3, 'hsl roundtrip ' + hex + ' ' + ch);
    }
    const hsv = color.rgbToHsv(rgb.r, rgb.g, rgb.b);
    const back2 = color.hsvToRgb(hsv.h, hsv.s, hsv.v);
    for (const ch of ['r', 'g', 'b']) {
      assert.ok(Math.abs(back2[ch] - rgb[ch]) <= 3, 'hsv roundtrip ' + hex + ' ' + ch);
    }
  }
});

test('color: format 多格式输出(默认 hex)', () => {
  const rgb = { r: 255, g: 0, b: 0 };
  assert.equal(color.format(rgb, 'hex'), '#ff0000');
  assert.equal(color.format(rgb, 'rgb'), 'rgb(255, 0, 0)');
  assert.equal(color.format(rgb, 'hsl'), 'hsl(0, 100%, 50%)');
  assert.equal(color.format(rgb, 'hsv'), 'hsv(0, 100%, 100%)');
  assert.equal(color.format(rgb), '#ff0000');
  eq(color.FORMAT_MODES, ['hex', 'rgb', 'hsl', 'hsv']);
});

test('color: parseColor 支持 hex / rgb() / 调色板名', () => {
  eq(color.parseColor('#0f172a'), { r: 15, g: 23, b: 42 });
  eq(color.parseColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3 });
  eq(color.parseColor('blue'), { r: 59, g: 130, b: 246 });
  assert.equal(color.parseColor(''), null);
  assert.equal(color.parseColor('nope-nope'), null);
});

test('color: 内置调色板包含全部 19 色', () => {
  const expected = [
    'accent', 'zinc', 'amber', 'blue', 'cyan', 'emerald', 'fuchsia', 'green',
    'indigo', 'lime', 'orange', 'pink', 'purple', 'red', 'rose', 'sky',
    'teal', 'violet', 'yellow',
  ];
  eq(Object.keys(color.NAME_HEX).sort(), expected.slice().sort());
  assert.equal(color.NAME_HEX.red, '#ef4444');
  assert.equal(color.NAME_HEX.blue, '#3b82f6');
  assert.equal(color.resolveColor('blue'), '#3b82f6');
  assert.equal(color.resolveColor('#123abc'), '#123abc');
});

/* ---------- 分组树纯逻辑 ---------- */
const TREE = [
  { id: 'a', name: 'A', parentId: '', sort: 0 },
  { id: 'b', name: 'B', parentId: 'a', sort: 0 },
  { id: 'd', name: 'D', parentId: 'b', sort: 0 },
  { id: 'c', name: 'C', parentId: '', sort: 1 },
];

test('groupTree: descendants 返回自身+全部子孙', () => {
  eq(groupTree.descendants(TREE, 'a'), ['a', 'b', 'd']);
  eq(groupTree.descendants(TREE, 'b'), ['b', 'd']);
  eq(groupTree.descendants(TREE, 'd'), ['d']);
  assert.equal(groupTree.isDescendant(TREE, 'a', 'd'), true);
  assert.equal(groupTree.isDescendant(TREE, 'b', 'a'), false);
});

test('groupTree: treeChildren 按 sort 排序', () => {
  eq(
    groupTree.treeChildren(TREE, '').map((n) => n.id),
    ['a', 'c']
  );
  eq(
    groupTree.treeChildren(TREE, 'a').map((n) => n.id),
    ['b']
  );
});

test('groupTree: resolveDrop 前/后/内部/根 解析', () => {
  // c 移入 a 内部(追加到 a 的末尾)
  eq(groupTree.resolveDrop(TREE, 'c', 'a', 'inside'), { parentId: 'a', index: 1 });
  // b 放到 c 之前(同级,根下)
  eq(groupTree.resolveDrop(TREE, 'b', 'c', 'before'), { parentId: '', index: 1 });
  // b 放到 c 之后(同级,根下)
  eq(groupTree.resolveDrop(TREE, 'b', 'c', 'after'), { parentId: '', index: 2 });
  // b 拖到树底空区 → 追加到根
  eq(groupTree.resolveDrop(TREE, 'b', '', 'inside'), { parentId: '', index: 2 });
});

test('groupTree: resolveDrop 禁止移入自身/子孙', () => {
  assert.equal(groupTree.resolveDrop(TREE, 'a', 'a', 'inside'), null);
  assert.equal(groupTree.resolveDrop(TREE, 'a', 'b', 'inside'), null);
  assert.equal(groupTree.resolveDrop(TREE, 'a', 'd', 'before'), null);
});

test('groupTree: moveNode 不可变移动 + sort 重排', () => {
  const moved = groupTree.moveNode(TREE, 'c', 'a', 'inside');
  assert.notEqual(moved, TREE);
  const c = moved.find((n) => n.id === 'c');
  assert.equal(c.parentId, 'a');
  // a 的子节点按列表顺序重排 sort:b→0,c→1
  const aKids = groupTree.treeChildren(moved, 'a');
  eq(
    aKids.map((n) => n.id),
    ['b', 'c']
  );
  assert.equal(aKids[0].sort, 0);
  assert.equal(aKids[1].sort, 1);
  // 原数组未被修改
  assert.equal(TREE.find((n) => n.id === 'c').parentId, '');
});

test('groupTree: moveNode 同父重排(before a → 移到根首)', () => {
  const moved = groupTree.moveNode(TREE, 'b', 'a', 'before');
  const roots = groupTree.treeChildren(moved, '');
  eq(
    roots.map((n) => n.id),
    ['b', 'a', 'c']
  );
});

test('groupTree: moveNode 非法目标返回 null', () => {
  assert.equal(groupTree.moveNode(TREE, 'a', 'b', 'inside'), null);
  assert.equal(groupTree.moveNode(TREE, 'a', 'a', 'inside'), null);
});

/* ---------- 组件实例渲染 ---------- */
test('groupTree: create().render() 输出三要素(树根/行/图标色)', () => {
  const inst = groupTree.create({
    nodes: () => [
      { id: 'a', name: 'A', parentId: '', sort: 0, icon: 'folder', color: 'blue' },
      { id: 'b', name: 'B', parentId: 'a', sort: 0, icon: '📁' },
    ],
    rootLabel: '全部分组',
    activeId: 'root',
    count: () => 3,
    rowExtra: () => '<button data-x>on</button>',
    labels: {},
  });
  const html = inst.render();
  assert.match(html, /data-gt-tree="/);
  assert.match(html, /data-gt-id="a"/);
  assert.match(html, /data-gt-id="b"/);
  assert.match(html, /color:#3b82f6/);
  assert.match(html, /data-gt-clear/); // 根行
  assert.match(html, /data-gt-more="a"/); // ⋯ 菜单按钮(菜单项改为 body 级浮层按需渲染)
  assert.match(html, /data-gt-more="b"/);
  const menu = inst.menuHtml('a'); // 菜单项(⋯ 浮层 / 右键浮层共用)
  assert.match(menu, /data-gt-ctx="newchild"/);
  assert.match(menu, /data-gt-ctx="move"/);
  assert.match(menu, /data-gt-ctx="icon"/);
  assert.match(menu, /data-gt-ctx="color"/);
  assert.match(html, /data-x>on/); // 行内扩展(公开开关)
  // 展开/折叠全部
  assert.equal(typeof inst.expandAll, 'function');
  assert.equal(typeof inst.collapseAll, 'function');
  inst.collapseAll();
  assert.equal(inst.expanded.b, false);
  inst.expandAll();
  assert.equal(inst.expanded.b, true);
});

test('groupTree: 过滤后只渲染命中节点及其祖先/子孙', () => {
  const inst = groupTree.create({
    nodes: () => TREE,
    rootLabel: '全部',
    labels: {},
  });
  inst.setFilter('D');
  const html = inst.render();
  assert.match(html, /data-gt-id="d"/);
  assert.match(html, /data-gt-id="a"/); // 祖先可见
  assert.match(html, /data-gt-id="b"/); // 祖先可见
  assert.doesNotMatch(html, /data-gt-id="c"/); // 无关节点隐藏
});

/* ---------- 标签组件(tag-picker) ---------- */

test('tagPicker: 调色板为 19 色且首色为 accent', () => {
  assert.equal(tagPicker.PALETTE.length, 19);
  assert.equal(tagPicker.PALETTE[0], 'accent');
  assert.ok(tagPicker.PALETTE.includes('zinc'));
  assert.ok(tagPicker.PALETTE.includes('yellow'));
});

test('tagPicker: fuzzyMatch 按序不连续匹配、忽略大小写', () => {
  assert.equal(tagPicker.fuzzyMatch('Payments', 'pay'), true);
  assert.equal(tagPicker.fuzzyMatch('Payments', 'pmt'), true);
  assert.equal(tagPicker.fuzzyMatch('Payments', 'pym'), true); // p→y→m 按序存在
  assert.equal(tagPicker.fuzzyMatch('Payments', 'myp'), false); // 顺序颠倒
  assert.equal(tagPicker.fuzzyMatch('Payments', 'pmz'), false);
  assert.equal(tagPicker.fuzzyMatch('', 'x'), false);
  assert.equal(tagPicker.fuzzyMatch('anything', ''), true);
});

test('tagPicker: highlight 仅标记按序命中的字符并转义其余文本', () => {
  assert.equal(tagPicker.highlight('Payments', 'pmt', (s) => s), '<mark>P</mark>ay<mark>m</mark>en<mark>t</mark>s');
  assert.equal(tagPicker.highlight('Payments', 'pay', (s) => s), '<mark>P</mark><mark>a</mark><mark>y</mark>ments');
  assert.equal(tagPicker.highlight('<b>', 'b', (s) => s), '<<mark>b</mark>>');
  assert.equal(tagPicker.highlight('abc', '', (s) => s), 'abc');
});

test('tagPicker: nextColor 在 19 色内循环', () => {
  const seen = new Set();
  for (let i = 0; i < 19; i++) seen.add(tagPicker.nextColor());
  assert.equal(seen.size, 19);
  assert.ok(tagPicker.PALETTE.includes(tagPicker.nextColor()));
});

test('tagPicker: create().render() 输出管理列表(# 行/计数/颜色过滤/未标记)', () => {
  const inst = tagPicker.create({
    nodes: () => [
      { id: 't1', name: 'Payments', color: 'blue' },
      { id: 't2', name: 'Auth', color: 'red' },
    ],
    activeId: '',
    count: (id) => (id === null ? 2 : id === 't1' ? 5 : 3),
    labels: { allTags: '全部标签', untagged: '未标记' },
  });
  const html = inst.render();
  assert.match(html, /data-tp="/);
  assert.match(html, /data-tp-tag="t1"/);
  assert.match(html, /data-tp-tag="t2"/);
  assert.match(html, /data-tp-none/); // 未标记行
  assert.match(html, /data-tp-clear/); // 全部标签行
  assert.match(html, /data-tp-color="accent"/); // 19 色过滤条
  assert.match(html, /data-tp-color="red"/);
  assert.match(html, />5<\/span>/); // 计数
  assert.match(html, />2<\/span>/);
  // 搜索过滤
  inst.setManagerFilter('pay');
  const html2 = inst.render();
  assert.match(html2, /data-tp-tag="t1"/);
  assert.doesNotMatch(html2, /data-tp-tag="t2"/);
  // 颜色过滤
  inst.setManagerFilter('');
  inst.setManagerColor('red');
  const html3 = inst.render();
  assert.doesNotMatch(html3, /data-tp-tag="t1"/);
  assert.match(html3, /data-tp-tag="t2"/);
});

test('tagPicker: pickerHtml 输出多选下拉(搜索/勾选/创建/已选计数)', () => {
  const inst = tagPicker.create({
    nodes: () => [
      { id: 't1', name: 'Payments', color: 'blue' },
      { id: 't2', name: 'Auth', color: '' },
    ],
    labels: { searchTags: '搜索标签…', createTag: '创建标签' },
  });
  const html = inst.pickerHtml(['t1']);
  assert.match(html, /data-tp-pick="t1"/);
  assert.match(html, /data-tp-pick="t2"/);
  assert.match(html, /data-tp-pick-search/);
  assert.match(html, /data-tp-done/);
  assert.doesNotMatch(html, /data-tp-create/); // 无搜索时不出创建行
  assert.match(html, />1 \u5df2\u9009</); // 已选计数
  // 搜索无匹配 → 出现创建行
  inst.setPickerSearch('zzz');
  const html2 = inst.pickerHtml([]);
  assert.match(html2, /data-tp-create/);
  assert.doesNotMatch(html2, /data-tp-pick="t1"/);
});
