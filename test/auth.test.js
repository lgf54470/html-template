/* ============================================================
 * auth 模块测试 — 登录门禁与会话生命周期
 * ------------------------------------------------------------
 * 鉴权不是侧边栏菜单,但它是所有模块共同依赖的基础设施,
 * 因此单独成组,与各业务模块测试互相隔离。
 * 覆盖:登录成败、失效选项、非法请求体、无 token 401、
 * 会话校验、登出失效、伪造 token、暴力破解限流。
 * ============================================================ */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, TEST_PASSWORD } = require('./helpers/server');

let srv;

before(async () => {
  srv = await startServer();
});

after(async () => {
  await srv.stop();
});

test('正确密码登录返回 token 与会话失效时间', async () => {
  const r = await srv.login(TEST_PASSWORD);
  assert.equal(r.status, 200);
  assert.ok(r.json.token, '应返回会话 token');
  assert.ok(r.json.expiresAt, '应返回 expiresAt');
  assert.equal(r.json.expiry, '24h');
});

test('错误密码返回 401', async () => {
  const r = await srv.login('wrong-password');
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'bad_password');
});

test('不支持的失效选项返回 400', async () => {
  const r = await srv.request('POST', '/api/auth/login', {
    body: { password: TEST_PASSWORD, expiry: 'forever' },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'bad_expiry');
});

test('非法 JSON 请求体返回 400', async () => {
  const res = await fetch(srv.baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, 'bad_json');
});

test('无 token 访问受保护接口返回 401', async () => {
  const r = await srv.request('GET', '/api/settings');
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'unauthorized');
});

test('有效会话可校验,登出后失效', async () => {
  const login = await srv.login();
  const token = login.json.token;

  const ok = await srv.request('GET', '/api/auth/verify', { token });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.expiry, '24h');

  const out = await srv.request('POST', '/api/auth/logout', { token });
  assert.equal(out.status, 200);
  assert.equal(out.json.ok, true);

  const again = await srv.request('GET', '/api/auth/verify', { token });
  assert.equal(again.status, 401);
});

test('伪造 token 返回 401', async () => {
  const r = await srv.request('GET', '/api/auth/verify', { token: 'forged-token' });
  assert.equal(r.status, 401);
});

test('连续密码错误触发 429 限流', async () => {
  // 使用独立服务器,避免污染其它用例的限流计数
  const isolated = await startServer();
  try {
    for (let i = 0; i < 8; i++) {
      const r = await isolated.login('wrong-password');
      assert.equal(r.status, 401, `第 ${i + 1} 次错误密码应为 401`);
    }
    const blocked = await isolated.login(TEST_PASSWORD);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.error, 'too_many_attempts');
  } finally {
    await isolated.stop();
  }
});
