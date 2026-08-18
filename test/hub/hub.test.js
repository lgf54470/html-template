/* ============================================================
 * hub 测试 — API Hub 后端(路由发现 / 公开开关 / 鉴权方式 / 自定义路由)
 * ------------------------------------------------------------
 * 覆盖:
 *   - /api/hub/state 路由发现(内置 + 自定义)与配置读取(需会话)
 *   - /api/hub/config 保存后可按原值读回;密钥加密落库
 *   - 公开开关:打开后无 token 可访问;关闭后恢复需鉴权
 *   - 分组公开级联:父分组公开 → 子孙分组内路由自动公开
 *   - 鉴权方式:global-password(x-auth-password)与 api-key(x-api-key)
 *   - 自定义路由:echo 回显 / static 固定响应;与内置路由冲突被拒
 * ============================================================ */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, TEST_PASSWORD } = require('../helpers/server');

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

/** 保存 Hub 配置;不传 config 时使用空配置 */
async function saveConfig(config, secrets) {
  return srv.request('PUT', '/api/hub/config', {
    token,
    body: { config: config || {}, secrets: secrets || {} },
  });
}

/** 读取 Hub 状态 */
async function getState() {
  return srv.request('GET', '/api/hub/state', { token });
}

test('无 token 访问 API Hub 状态被拒绝(401)', async () => {
  const r = await srv.request('GET', '/api/hub/state');
  assert.equal(r.status, 401);
});

test('无 token 保存 Hub 配置被拒绝(401)', async () => {
  const r = await srv.request('PUT', '/api/hub/config', { body: { config: {} } });
  assert.equal(r.status, 401);
});

test('路由发现:包含内置路由与配置结构,不含管理接口自身', async () => {
  const r = await getState();
  assert.equal(r.status, 200);
  const keys = r.json.routes.map((x) => x.method + ' ' + x.path);
  assert.ok(keys.includes('POST /api/auth/login'), '应发现登录路由');
  assert.ok(keys.includes('GET /api/settings'), '应发现设置路由');
  assert.ok(keys.includes('GET /api/auth/verify'), '应发现校验路由');
  assert.ok(!keys.some((k) => k.includes('/api/hub/')), '管理接口不应出现在发现列表');
  const login = r.json.routes.find((x) => x.method === 'POST' && x.path === '/api/auth/login');
  assert.equal(login.builtIn, true);
  assert.equal(login.public, true, '登录路由默认公开');
  const settings = r.json.routes.find((x) => x.path === '/api/settings');
  assert.equal(settings.public, false, '设置路由默认私有');
  assert.ok(r.json.config && Array.isArray(r.json.config.groups), '应返回配置结构');
  assert.deepEqual(r.json.secrets, { apiKeys: {} }, '初始密钥为空');
});

test('配置保存后可按原值读回,分组/标签/路由覆盖均保留', async () => {
  const config = {
    version: 1,
    defaults: { auth: 'session' },
    groups: [{ id: 'g-1', name: '测试组', parentId: '', public: false, sort: 0 }],
    tags: [{ id: 't-1', name: '测试标签', parentId: '', sort: 0 }],
    routes: {
      'GET /api/settings': { name: '设置', public: false, favorite: true, groupIds: ['g-1'], tagIds: ['t-1'] },
    },
    customRoutes: [],
  };
  const put = await saveConfig(config);
  assert.equal(put.status, 200);
  assert.equal(put.json.ok, true);

  const r = await getState();
  assert.equal(r.status, 200);
  assert.equal(r.json.config.groups.length, 1);
  assert.equal(r.json.config.groups[0].name, '测试组');
  assert.equal(r.json.config.tags[0].name, '测试标签');
  assert.equal(r.json.config.routes['GET /api/settings'].favorite, true);
  assert.deepEqual(r.json.config.routes['GET /api/settings'].groupIds, ['g-1']);
});

test('公开开关:打开后无 token 可访问,关闭后恢复需鉴权', async () => {
  // 先把 GET /api/settings 设为公开
  const config = {
    defaults: { auth: 'session' },
    routes: { 'GET /api/settings': { public: true } },
  };
  let put = await saveConfig(config);
  assert.equal(put.status, 200);

  const pub = await srv.request('GET', '/api/settings');
  assert.equal(pub.status, 200, '公开后无 token 应可访问');

  // 关闭公开 → 恢复会话鉴权
  put = await saveConfig({ defaults: { auth: 'session' }, routes: {} });
  assert.equal(put.status, 200);
  const priv = await srv.request('GET', '/api/settings');
  assert.equal(priv.status, 401, '关闭公开后应恢复鉴权');
  const withToken = await srv.request('GET', '/api/settings', { token });
  assert.equal(withToken.status, 200);
});

test('分组公开级联:父分组公开 → 子孙分组自动公开,路由随之公开', async () => {
  const config = {
    defaults: { auth: 'session' },
    groups: [
      { id: 'g-parent', name: '父组', parentId: '', public: true, sort: 0 },
      { id: 'g-child', name: '子组', parentId: 'g-parent', public: false, sort: 0 },
      { id: 'g-grand', name: '孙组', parentId: 'g-child', public: false, sort: 0 },
    ],
    routes: {
      'GET /api/settings': { public: false, groupIds: ['g-grand'] },
    },
  };
  const put = await saveConfig(config);
  assert.equal(put.status, 200);
  // 存储层已级联:父公开 → 子/孙均公开
  const byId = {};
  put.json.config.groups.forEach((g) => (byId[g.id] = g));
  assert.equal(byId['g-child'].public, true, '子组应被级联为公开');
  assert.equal(byId['g-grand'].public, true, '孙组应被级联为公开');

  const pub = await srv.request('GET', '/api/settings');
  assert.equal(pub.status, 200, '孙组内的路由应随分组级联公开');
});

test('全局密码鉴权:需要 x-auth-password,正确密码放行', async () => {
  const config = {
    defaults: { auth: 'global-password' },
    routes: {},
  };
  const put = await saveConfig(config);
  assert.equal(put.status, 200);

  const noHeader = await srv.request('GET', '/api/settings');
  assert.equal(noHeader.status, 401, '缺少 x-auth-password 应拒绝');

  const wrong = await srv.request('GET', '/api/settings', {
    headers: { 'x-auth-password': 'wrong-password' },
  });
  assert.equal(wrong.status, 401, '密码错误应拒绝');

  const right = await srv.request('GET', '/api/settings', {
    headers: { 'x-auth-password': TEST_PASSWORD },
  });
  assert.equal(right.status, 200, '正确全局密码应放行');
});

test('API Key 鉴权:未配置/错误密钥拒绝,正确密钥放行,密钥加密落库', async () => {
  const config = {
    defaults: { auth: 'api-key' },
    routes: {},
  };
  const secrets = { apiKeys: { 'GET /api/settings': 'hub-secret-key-123' } };
  const put = await saveConfig(config, secrets);
  assert.equal(put.status, 200);

  const noKey = await srv.request('GET', '/api/settings');
  assert.equal(noKey.status, 401, '缺少 x-api-key 应拒绝');

  const wrong = await srv.request('GET', '/api/settings', {
    headers: { 'x-api-key': 'wrong-key' },
  });
  assert.equal(wrong.status, 401, '错误密钥应拒绝');

  const right = await srv.request('GET', '/api/settings', {
    headers: { 'x-api-key': 'hub-secret-key-123' },
  });
  assert.equal(right.status, 200, '正确密钥应放行');

  // 密钥必须以密文落库
  const raw = srv.readDbValue('settings:hub:secrets');
  assert.ok(raw.startsWith('enc:v1:'), 'Hub 密钥应加密落库');
  assert.ok(!raw.includes('hub-secret-key-123'), '落库内容不应含明文密钥');

  // 恢复默认会话鉴权,避免影响后续用例
  await saveConfig({ defaults: { auth: 'session' }, routes: {} });
});

test('自定义路由:echo 回显请求,static 返回固定响应', async () => {
  const config = {
    defaults: { auth: 'session' },
    customRoutes: [
      { id: 'c-echo', method: 'POST', path: '/api/hub-demo/echo', responseType: 'echo', public: true },
      { id: 'c-static', method: 'GET', path: '/api/hub-demo/ping', responseType: 'static', staticStatus: 201, staticBody: { pong: true }, public: true },
    ],
  };
  const put = await saveConfig(config);
  assert.equal(put.status, 200);

  // echo:回显查询参数与请求体
  const echo = await srv.request('POST', '/api/hub-demo/echo?foo=bar', {
    body: { hello: 'world' },
  });
  assert.equal(echo.status, 200);
  assert.equal(echo.json.path, '/api/hub-demo/echo');
  assert.equal(echo.json.query.foo, 'bar');
  assert.deepEqual(echo.json.body, { hello: 'world' });
  assert.equal(echo.json.headers['x-auth-token'], undefined, '不应回显敏感请求头');

  // static:固定状态码与响应体
  const ping = await srv.request('GET', '/api/hub-demo/ping');
  assert.equal(ping.status, 201);
  assert.deepEqual(ping.json, { pong: true });

  // 自定义路由出现在发现列表
  const state = await getState();
  assert.ok(
    state.json.routes.some((x) => x.id === 'c-echo' && x.builtIn === false),
    '自定义路由应出现在发现列表'
  );
});

test('自定义路由鉴权:默认会话;设为公开后免鉴权', async () => {
  const config = {
    defaults: { auth: 'session' },
    customRoutes: [
      { id: 'c-sec', method: 'GET', path: '/api/hub-demo/secure', responseType: 'static', staticBody: { ok: true }, public: false },
    ],
  };
  await saveConfig(config);
  const priv = await srv.request('GET', '/api/hub-demo/secure');
  assert.equal(priv.status, 401, '未公开的自定义路由需鉴权');
  const withToken = await srv.request('GET', '/api/hub-demo/secure', { token });
  assert.equal(withToken.status, 200);

  // 改为公开
  config.customRoutes[0].public = true;
  await saveConfig(config);
  const pub = await srv.request('GET', '/api/hub-demo/secure');
  assert.equal(pub.status, 200, '公开后的自定义路由免鉴权');
});

test('自定义路由与内置路由冲突被拒绝(400)', async () => {
  const config = {
    customRoutes: [
      { id: 'c-bad', method: 'GET', path: '/api/settings', responseType: 'echo', public: true },
    ],
  };
  const r = await saveConfig(config);
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'bad_config');
});

test('非法路径 / 非法鉴权方式被清洗', async () => {
  const config = {
    defaults: { auth: 'not-a-mode' },
    groups: [{ id: 'g!!', name: '', parentId: '', public: false }],
    customRoutes: [{ id: 'c-bad-path', method: 'GET', path: '../etc/passwd', responseType: 'echo', public: true }],
  };
  const put = await saveConfig(config);
  assert.equal(put.status, 200);
  // 非法值回退默认
  assert.equal(put.json.config.defaults.auth, 'session');
  assert.equal(put.json.config.groups.length, 0, '非法分组应被过滤');
  assert.equal(put.json.config.customRoutes.length, 0, '非法路径应被过滤');
});

test('恢复默认配置,保证测试之间互不影响', async () => {
  const put = await saveConfig({ defaults: { auth: 'session' }, routes: {}, customRoutes: [] });
  assert.equal(put.status, 200);
  const priv = await srv.request('GET', '/api/settings');
  assert.equal(priv.status, 401, '默认配置下设置路由应需鉴权');
});
