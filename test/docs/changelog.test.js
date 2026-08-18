/* ============================================================
 * docs:changelog 子模块测试 — 二级菜单「更新日志」(/docs/changelog)
 * ============================================================ */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let srv;

before(async () => {
  srv = await startServer();
});

after(async () => {
  await srv.stop();
});

const FILE = '/js/modules/docs/sub/changelog.js';

test('子模块实现文件可访问', async () => {
  const r = await srv.request('GET', FILE);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/javascript/);
});

test('子模块注册为 docs:changelog 并定义 render', async () => {
  const r = await srv.request('GET', FILE);
  assert.match(r.text, /App\.defineModule\(\{\s*id:\s*'docs'/);
  assert.match(r.text, /sub:\s*'changelog'/);
  assert.match(r.text, /render:\s*render/);
});

test('模块词典含更新日志文案键', async () => {
  const r = await srv.request('GET', '/js/modules/docs/i18n.js');
  assert.match(r.text, /'docs\.changelog\.title'/);
  assert.match(r.text, /'docs\.changelog\.desc'/);
  assert.match(r.text, /'docs\.changelog\.v1'/);
});
