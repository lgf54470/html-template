/* ============================================================
 * dashboard 模块测试 — 侧边栏一级菜单「仪表盘」(路由 /)
 * ------------------------------------------------------------
 * 覆盖:模块清单、实现文件、三语言词典的可访问性,入口 HTML
 * 与静态资源的缓存策略、安全响应头、ETag 条件缓存(304)。
 * ============================================================ */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server');

let srv;

before(async () => {
  srv = await startServer();
});

after(async () => {
  await srv.stop();
});

const BASE = '/js/modules/dashboard';

test('模块清单可访问且声明路由 /', async () => {
  const r = await srv.request('GET', BASE + '/manifest.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/javascript/);
  assert.match(r.text, /App\.registerModule\(\{/);
  assert.match(r.text, /id:\s*'dashboard'/);
  assert.match(r.text, /route:\s*'\/'/);
});

test('模块实现文件可访问且定义 render', async () => {
  const r = await srv.request('GET', BASE + '/module.js');
  assert.equal(r.status, 200);
  assert.match(r.text, /App\.defineModule\(\{\s*id:\s*'dashboard'/);
  assert.match(r.text, /render:\s*render/);
});

test('模块词典含三语言文案', async () => {
  const r = await srv.request('GET', BASE + '/i18n.js');
  assert.equal(r.status, 200);
  assert.match(r.text, /__moduleI18n\['dashboard'\]/);
  assert.match(r.text, /zh-CN/);
  assert.match(r.text, /zh-TW/);
  assert.match(r.text, /en/);
});

test('入口 index.html 可访问且禁止缓存', async () => {
  const r = await srv.request('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('静态资源带统一安全响应头', async () => {
  const r = await srv.request('GET', BASE + '/module.js');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
});

test('模块脚本支持 ETag 条件缓存(304)', async () => {
  const first = await srv.request('GET', BASE + '/module.js');
  const etag = first.headers.get('etag');
  assert.ok(etag, '响应应带 ETag');

  const second = await srv.request('GET', BASE + '/module.js', {
    headers: { 'if-none-match': etag },
  });
  assert.equal(second.status, 304);
});
