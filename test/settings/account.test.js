/* ============================================================
 * settings:account 子模块测试 — 二级菜单「账户」(/settings/account)
 * ------------------------------------------------------------
 * 账户为非敏感配置块,验证读写往返即可。
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

const KEY = 'settings:account';
const ACCOUNT = { name: 'Alice', dob: '1990-01-01', language: 'en' };

test('无 token 读写账户设置被拒绝(401)', async () => {
  const put = await srv.request('PUT', '/api/settings', { body: { settings: { [KEY]: '{}' } } });
  assert.equal(put.status, 401);
});

test('账户设置写入后可按原值读回', async () => {
  const put = await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { [KEY]: JSON.stringify(ACCOUNT) } },
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.written, 1);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.status, 200);
  assert.deepEqual(JSON.parse(get.json[KEY]), ACCOUNT);
});

test('账户设置可删除', async () => {
  await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { [KEY]: JSON.stringify(ACCOUNT) } },
  });

  const del = await srv.request('DELETE', '/api/settings', { token, body: { keys: [KEY] } });
  assert.equal(del.status, 200);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.json[KEY], undefined);
});
