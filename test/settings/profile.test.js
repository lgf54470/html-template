/* ============================================================
 * settings:profile 子模块测试 — 二级菜单「个人资料」(/settings)
 * ------------------------------------------------------------
 * 个人资料是敏感配置块(含邮箱),除验证读写往返外,还直接读取
 * 底层 SQLite 原始值,断言落库为 AES-256-GCM 密文而非明文。
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

const KEY = 'settings:profile';
const EMAIL = 'alice+test@example.com';
const PROFILE = {
  username: 'Alice',
  email: EMAIL,
  bio: 'hello <script>alert(1)</script>',
  links: ['https://example.com', ''],
};

test('无 token 读写个人资料被拒绝(401)', async () => {
  const put = await srv.request('PUT', '/api/settings', { body: { settings: { [KEY]: '{}' } } });
  assert.equal(put.status, 401);

  const get = await srv.request('GET', '/api/settings');
  assert.equal(get.status, 401);
});

test('个人资料写入后可按原值读回', async () => {
  const put = await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { [KEY]: JSON.stringify(PROFILE) } },
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.written, 1);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.status, 200);
  assert.ok(get.json[KEY], '应返回 settings:profile');
  assert.deepEqual(JSON.parse(get.json[KEY]), PROFILE);
});

test('邮箱等敏感值落库为密文而非明文', async () => {
  await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { [KEY]: JSON.stringify(PROFILE) } },
  });

  const raw = srv.readDbValue(KEY);
  assert.ok(raw, '数据库中应存在 settings:profile 行');
  assert.ok(raw.startsWith('enc:v1:'), '敏感配置块应以 enc:v1: 前缀加密存储');
  assert.ok(!raw.includes(EMAIL), '密文中不应出现明文邮箱');
  assert.ok(!raw.includes(PROFILE.bio), '密文中不应出现明文简介');
});

test('删除个人资料后不再返回该键', async () => {
  await srv.request('PUT', '/api/settings', {
    token,
    body: { settings: { [KEY]: JSON.stringify(PROFILE) } },
  });

  const del = await srv.request('DELETE', '/api/settings', { token, body: { keys: [KEY] } });
  assert.equal(del.status, 200);
  assert.equal(del.json.removed, 1);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.json[KEY], undefined);
});
