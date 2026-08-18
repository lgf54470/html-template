/* ============================================================
 * settings:notifications 子模块测试 — 二级菜单「通知」(/settings/notifications)
 * ------------------------------------------------------------
 * 通知配置块包含通知类型与各类开关,验证读写往返。
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

const KEY = 'settings:notifications';
const NOTIFICATIONS = {
  type: 'mentions',
  communication: true,
  marketing: false,
  social: true,
  mobile: false,
};

test('无 token 写通知设置被拒绝(401)', async () => {
  const put = await srv.request('PUT', '/api/settings', { body: { settings: { [KEY]: '{}' } } });
  assert.equal(put.status, 401);
});

test('通知设置写入后可按原值读回', async () => {
  const put = await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { [KEY]: JSON.stringify(NOTIFICATIONS) } },
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.written, 1);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.status, 200);
  assert.deepEqual(JSON.parse(get.json[KEY]), NOTIFICATIONS);
});
