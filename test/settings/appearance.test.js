/* ============================================================
 * settings:appearance 子模块测试 — 二级菜单「外观」(/settings/appearance)
 * ------------------------------------------------------------
 * 外观配置块包含主题/风格/配色/字体/圆角等,验证读写往返。
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

const KEY = 'settings:appearance';
const APPEARANCE = {
  theme: 'dark',
  style: 'new-york',
  baseColor: '#0ea5e9',
  chartColor: '#22c55e',
  radius: '0.75',
  bodyFont: 'inter',
  headingFont: 'manrope',
  menuColor: 'inverted',
  menuAppearance: 'translucent',
};

test('无 token 写外观设置被拒绝(401)', async () => {
  const put = await srv.request('PUT', '/api/settings', { body: { settings: { [KEY]: '{}' } } });
  assert.equal(put.status, 401);
});

test('外观设置写入后可按原值读回', async () => {
  const put = await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { [KEY]: JSON.stringify(APPEARANCE) } },
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.written, 1);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.status, 200);
  assert.deepEqual(JSON.parse(get.json[KEY]), APPEARANCE);
});
