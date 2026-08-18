/* ============================================================
 * docs:introduction 子模块测试 — 二级菜单「简介」(/docs/introduction)
 * ------------------------------------------------------------
 * 独立文件自包含:验证自己的实现文件、注册声明与文案键,
 * 不依赖其它子模块。
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

const FILE = '/js/modules/docs/sub/introduction.js';

test('子模块实现文件可访问', async () => {
  const r = await srv.request('GET', FILE);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/javascript/);
});

test('子模块注册为 docs:introduction 并定义 render', async () => {
  const r = await srv.request('GET', FILE);
  assert.match(r.text, /App\.defineModule\(\{\s*id:\s*'docs'/);
  assert.match(r.text, /sub:\s*'introduction'/);
  assert.match(r.text, /render:\s*render/);
});

test('模块词典含简介文案键', async () => {
  const r = await srv.request('GET', '/js/modules/docs/i18n.js');
  assert.match(r.text, /'docs\.introduction\.title'/);
  assert.match(r.text, /'docs\.introduction\.desc'/);
  assert.match(r.text, /'docs\.introduction\.s1'/);
});
