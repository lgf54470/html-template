/* ============================================================
 * settings:workspaces 测试 — 工作空间列表与当前工作空间 id
 * ------------------------------------------------------------
 * 工作空间列表(JSON 数组)与当前 id 通过 app_settings 持久化,
 * 验证读写往返;业务数据表按 workspace_id 隔离的约定见文档。
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

const WORKSPACES_KEY = 'settings:workspaces';
const ACTIVE_KEY = 'settings:activeWorkspace';
const WORKSPACES = [
  { id: 'ws-default', name: '默认', icon: 'house', color: 'zinc' },
  { id: 'ws-work', name: '工作', icon: 'briefcase', color: 'blue' },
];

test('无 token 写工作空间设置被拒绝(401)', async () => {
  const r = await srv.request('PUT', '/api/settings', {
    body: { settings: { [WORKSPACES_KEY]: '[]' } },
  });
  assert.equal(r.status, 401);
});

test('工作空间列表与当前 id 写入后可按原值读回', async () => {
  const put = await srv.request('PUT', '/api/settings', {
    token,
    body: {
      settings: {
        [WORKSPACES_KEY]: JSON.stringify(WORKSPACES),
        [ACTIVE_KEY]: 'ws-work',
      },
    },
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.written, 2);

  const get = await srv.request('GET', '/api/settings', { token });
  assert.equal(get.status, 200);
  assert.deepEqual(JSON.parse(get.json[WORKSPACES_KEY]), WORKSPACES);
  assert.equal(get.json[ACTIVE_KEY], 'ws-work');
});

test('不同工作空间的设置按 workspace_id 隔离,互不影响', async () => {
  const profileA = { username: 'A', email: 'a@example.com' };
  const profileB = { username: 'B', email: 'b@example.com' };

  // 切到 ws-a 写资料
  await srv.request('PUT', '/api/settings', {
    token,
    body: {
      settings: {
        [ACTIVE_KEY]: 'ws-a',
        'settings:profile': JSON.stringify(profileA),
      },
    },
  });
  // 切到 ws-b 写不同资料
  await srv.request('PUT', '/api/settings', {
    token,
    body: {
      settings: {
        [ACTIVE_KEY]: 'ws-b',
        'settings:profile': JSON.stringify(profileB),
      },
    },
  });

  // 指定工作空间读回各自数据
  const a = await srv.request('GET', '/api/settings?workspace=ws-a', { token });
  assert.equal(a.status, 200);
  assert.deepEqual(JSON.parse(a.json['settings:profile']), profileA);

  const b = await srv.request('GET', '/api/settings?workspace=ws-b', { token });
  assert.equal(b.status, 200);
  assert.deepEqual(JSON.parse(b.json['settings:profile']), profileB);

  // 默认 GET 返回当前活跃(ws-b)的数据,不混入 ws-a
  const cur = await srv.request('GET', '/api/settings', { token });
  assert.equal(cur.status, 200);
  assert.deepEqual(JSON.parse(cur.json['settings:profile']), profileB);

  // 底层落库:两个工作空间各自一行、密文不同,且不含明文邮箱
  const rawA = srv.readDbValue('settings:profile', 'ws-a');
  const rawB = srv.readDbValue('settings:profile', 'ws-b');
  assert.ok(rawA.startsWith('enc:v1:'), 'ws-a 资料应以密文存储');
  assert.ok(rawB.startsWith('enc:v1:'), 'ws-b 资料应以密文存储');
  assert.notEqual(rawA, rawB, '两个工作空间的密文应互不相同');
  assert.ok(!rawA.includes(profileA.email), '密文中不应出现明文邮箱');
  assert.ok(!rawB.includes(profileB.email), '密文中不应出现明文邮箱');
});

test('app_settings 表含 workspace_id 复合主键列', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(srv.dbPath);
  try {
    const cols = db.prepare('PRAGMA table_info(app_settings)').all();
    assert.ok(
      cols.some((c) => c.name === 'workspace_id'),
      '应含 workspace_id 列'
    );
    const pks = db
      .prepare('PRAGMA table_info(app_settings)')
      .all()
      .filter((c) => c.pk);
    assert.equal(pks.length, 2, 'workspace_id + key 应为复合主键');
  } finally {
    db.close();
  }
});
