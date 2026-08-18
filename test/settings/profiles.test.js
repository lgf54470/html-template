/* ============================================================
 * settings:profiles 测试 — 配置文件列表与当前配置文件 id
 * ------------------------------------------------------------
 * 配置文件(VSCode 风格)列表(JSON 数组)与当前 id 通过 app_settings
 * 持久化(settings:profiles / settings:activeProfile,按工作空间隔离),
 * 验证读写往返与工作空间互不影响。
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

const PROFILES_KEY = 'settings:profiles';
const ACTIVE_KEY = 'settings:activeProfile';
const PROFILES = [
  { id: 'p-default', nameKey: 'profiles.defaultName', snapshot: { appearance: {} } },
  {
    id: 'p-work',
    name: '工作配置',
    snapshot: {
      appearance: { theme: 'dark' },
      notifications: { type: 'none' },
      display: { sidebarVariant: 'floating', hiddenNav: ['channels'] },
    },
  },
];

test('无 token 写配置文件设置被拒绝(401)', async () => {
  const r = await srv.request('PUT', '/api/settings', {
    body: { settings: { [PROFILES_KEY]: '[]' } },
  });
  assert.equal(r.status, 401);
});

test('配置文件列表与当前 id 写入后可按原值读回', async () => {
  const put = await srv.request('PUT', '/api/settings', {
    token,
    body: {
      settings: {
        [PROFILES_KEY]: JSON.stringify(PROFILES),
        [ACTIVE_KEY]: 'p-work',
      },
    },
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.written, 2);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.status, 200);
  assert.deepEqual(JSON.parse(get.json[PROFILES_KEY]), PROFILES);
  assert.equal(get.json[ACTIVE_KEY], 'p-work');
});

test('不同工作空间的配置文件互不影响', async () => {
  const wsA = [
    { id: 'p-default', nameKey: 'profiles.defaultName', snapshot: {} },
    { id: 'p-a', name: 'A 配置', snapshot: { appearance: { theme: 'light' } } },
  ];
  const wsB = [
    { id: 'p-default', nameKey: 'profiles.defaultName', snapshot: {} },
    { id: 'p-b', name: 'B 配置', snapshot: { appearance: { theme: 'dark' } } },
  ];

  await srv.request('PUT', '/api/settings', {
    token,
    body: {
      settings: {
        'settings:activeWorkspace': 'pf-ws-a',
        [PROFILES_KEY]: JSON.stringify(wsA),
        [ACTIVE_KEY]: 'p-a',
      },
    },
  });
  await srv.request('PUT', '/api/settings', {
    token,
    body: {
      settings: {
        'settings:activeWorkspace': 'pf-ws-b',
        [PROFILES_KEY]: JSON.stringify(wsB),
        [ACTIVE_KEY]: 'p-b',
      },
    },
  });

  const a = await srv.request('GET', '/api/settings?workspace=pf-ws-a', { token });
  assert.deepEqual(JSON.parse(a.json[PROFILES_KEY]), wsA);
  assert.equal(a.json[ACTIVE_KEY], 'p-a');

  const b = await srv.request('GET', '/api/settings?workspace=pf-ws-b', { token });
  assert.deepEqual(JSON.parse(b.json[PROFILES_KEY]), wsB);
  assert.equal(b.json[ACTIVE_KEY], 'p-b');
});
