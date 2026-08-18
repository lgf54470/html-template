/* ============================================================
 * settings:display 子模块测试 — 二级菜单「显示」(/settings/display)
 * ------------------------------------------------------------
 * 显示配置块控制侧边栏布局与菜单项可见性,验证读写往返。
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

const KEY = 'settings:display';
const DISPLAY = {
  sidebarOpen: false,
  sidebarVariant: 'floating',
  sidebarCollapsible: 'offcanvas',
  sidebarWidth: 272,
  // 含父级('channels'/'tokens')与子级('docs:introduction')隐藏 id
  hiddenNav: ['channels', 'tokens', 'docs:introduction'],
};

test('无 token 写显示设置被拒绝(401)', async () => {
  const put = await srv.request('PUT', '/api/settings', { body: { settings: { [KEY]: '{}' } } });
  assert.equal(put.status, 401);
});

test('显示设置写入后可按原值读回', async () => {
  const put = await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { [KEY]: JSON.stringify(DISPLAY) } },
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.written, 1);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.status, 200);
  assert.deepEqual(JSON.parse(get.json[KEY]), DISPLAY);
});
