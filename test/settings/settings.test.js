/* ============================================================
 * settings 模块测试 — 侧边栏一级菜单「设置」(含 5 个二级子模块)
 * ------------------------------------------------------------
 * 本文件覆盖模块级资源:清单(children 声明)、父模块按路由分发的
 * 实现、模块私有样式、词典,以及设置 API 的公共契约(保留键、
 * 非法请求体)。5 个子模块(profile/account/appearance/
 * notifications/display)各自在独立文件中测试,互不干扰。
 * ============================================================ */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let srv;
let token;

before(async () => {
  srv = await startServer();
  const login = await srv.login();
  assert.equal(login.status, 200);
  token = login.json.token;
});

after(async () => {
  await srv.stop();
});

const BASE = '/js/modules/settings';

const CHILDREN = [
  { id: 'profile', route: '/settings' },
  { id: 'account', route: '/settings/account' },
  { id: 'appearance', route: '/settings/appearance' },
  { id: 'notifications', route: '/settings/notifications' },
  { id: 'display', route: '/settings/display' },
];

test('模块清单声明 5 个二级子模块及各自路由', async () => {
  const r = await srv.request('GET', BASE + '/manifest.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/javascript/);
  assert.match(r.text, /App\.registerModule\(\{/);
  assert.match(r.text, /id:\s*'settings'/);

  for (const child of CHILDREN) {
    assert.match(r.text, new RegExp("id:\\s*'" + child.id + "'"), '应声明子模块 ' + child.id);
    assert.match(
      r.text,
      new RegExp("route:\\s*'" + child.route.replace(/\//g, '\\/') + "'"),
      '应声明路由 ' + child.route
    );
  }
});

test('父模块按路由分发 5 个子页面', async () => {
  const r = await srv.request('GET', BASE + '/module.js');
  assert.equal(r.status, 200);
  assert.match(r.text, /App\.defineModule\(\{\s*id:\s*'settings'/);
  for (const page of [
    'pageProfile',
    'pageAccount',
    'pageAppearance',
    'pageNotifications',
    'pageDisplay',
  ]) {
    assert.match(r.text, new RegExp('function\\s+' + page + '\\('), '应含 ' + page);
  }
  assert.match(r.text, /profile:\s*pageProfile/);
  assert.match(r.text, /display:\s*pageDisplay/);
});

test('模块私有样式可访问', async () => {
  const r = await srv.request('GET', BASE + '/module.css');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/css/);
});

test('模块词典含三语言与子模块文案键', async () => {
  const r = await srv.request('GET', BASE + '/i18n.js');
  assert.equal(r.status, 200);
  assert.match(r.text, /__moduleI18n\['settings'\]/);
  assert.match(r.text, /zh-CN/);
  assert.match(r.text, /zh-TW/);
  assert.match(r.text, /en/);
  for (const child of CHILDREN) {
    assert.match(r.text, new RegExp("'" + child.id + "\\.title'"), '应含 ' + child.id + ' 文案键');
  }
});

test('设置 API 拒绝写入保留键(403)', async () => {
  const r = await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { 'settings:auth:password': 'secret' } },
  });
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'reserved_key');
});

test('设置 API 拒绝删除保留键(403)', async () => {
  const r = await srv.request('DELETE', '/api/settings', {
    token,
    body: { keys: ['settings:auth:password'] },
  });
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'reserved_key');
});

test('设置 API 对非法请求体返回 400', async () => {
  const r = await srv.request('PUT', '/api/settings', { token, body: { nope: true } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'bad_body');
});
