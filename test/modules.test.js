/* ============================================================
 * 新模块测试 — tasks / apps / chats(复刻参考项目 shadcn-admin)
 * ------------------------------------------------------------
 * 覆盖:模块清单(注册 + 路由)、实现文件(defineModule + render)、
 * 三语言词典可访问性,以及 boot.js 已从占位模块切换到新模块。
 * ============================================================ */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server');

let srv;

before(async () => {
  srv = await startServer();
});

after(async () => {
  await srv.stop();
});

const MODULES = [
  {
    id: 'tasks',
    route: '/tasks',
    icon: 'list-todo',
    title: '任务',
    feature: 'tasks-table',
  },
  {
    id: 'apps',
    route: '/apps',
    icon: 'package',
    title: '应用',
    feature: 'App Integrations',
  },
  {
    id: 'chats',
    route: '/chats',
    icon: 'messages-square',
    title: '聊天',
    feature: 'chat-text-container',
  },
];

for (const mod of MODULES) {
  const BASE = '/js/modules/' + mod.id;

  test(mod.id + ': 模块清单可访问且声明路由', async () => {
    const r = await srv.request('GET', BASE + '/manifest.js');
    assert.equal(r.status, 200);
    assert.match(r.text, /App\.registerModule\(\{/);
    assert.match(r.text, new RegExp("id:\\s*'" + mod.id + "'"));
    assert.match(r.text, new RegExp("route:\\s*'" + mod.route + "'"));
    assert.match(r.text, new RegExp("icon:\\s*'" + mod.icon + "'"));
    assert.match(r.text, /i18nFile:\s*'i18n\.js'/);
  });

  test(mod.id + ': 模块实现文件可访问且定义 render', async () => {
    const r = await srv.request('GET', BASE + '/module.js');
    assert.equal(r.status, 200);
    assert.match(r.text, new RegExp("App\\.defineModule\\(\\{\\s*id:\\s*'" + mod.id + "'"));
    assert.match(r.text, /function render/);
  });

  test(mod.id + ': 模块私有样式可访问', async () => {
    const r = await srv.request('GET', BASE + '/module.css');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/css/);
  });

  test(mod.id + ': 模块词典含三语言文案', async () => {
    const r = await srv.request('GET', BASE + '/i18n.js');
    assert.equal(r.status, 200);
    assert.match(r.text, new RegExp("__moduleI18n\\['" + mod.id + "'\\]"));
    assert.match(r.text, /zh-CN/);
    assert.match(r.text, /zh-TW/);
    assert.match(r.text, /en/);
    assert.match(r.text, new RegExp("'" + mod.id + "\\.(title|inbox|desc)'"));
  });
}

test('tasks: 包含表格/过滤/字段显隐等关键交互标记', async () => {
  const r = await srv.request('GET', '/js/modules/tasks/module.js');
  assert.match(r.text, /data-task-search/);
  assert.match(r.text, /data-task-view-col/);
  assert.match(r.text, /data-task-filter-opt/);
  assert.match(r.text, /data-task-check-all/);
  assert.match(r.text, /data-task-page/);
});

test('apps: 包含 15 个品牌应用与筛选/排序标记', async () => {
  const r = await srv.request('GET', '/js/modules/apps/module.js');
  assert.match(r.text, /Telegram/);
  assert.match(r.text, /GitHub/);
  assert.match(r.text, /WhatsApp/);
  assert.match(r.text, /data-app-filter/);
  assert.match(r.text, /data-app-sort/);
});

test('chats: 包含会话数据、搜索与发送交互标记', async () => {
  const r = await srv.request('GET', '/js/modules/chats/module.js');
  assert.match(r.text, /CONVERSATIONS/);
  assert.match(r.text, /Alex John/);
  assert.match(r.text, /data-ch-search/);
  assert.match(r.text, /data-ch-open/);
  assert.match(r.text, /data-ch-send-form/);
});

test('boot.js: MODULE_DIRS 已切换到新模块并移除占位模块', async () => {
  const r = await srv.request('GET', '/js/core/boot.js');
  assert.equal(r.status, 200);
  assert.match(
    r.text,
    /MODULE_DIRS = \['dashboard', 'tasks', 'apps', 'chats', 'docs', 'settings'\]/
  );
  assert.doesNotMatch(r.text, /'channels'|'tokens'|'logs'/);
});

test('占位模块文件已删除(渠道/令牌/日志返回 404)', async () => {
  for (const gone of ['channels', 'tokens', 'logs']) {
    const r = await srv.request('GET', '/js/modules/' + gone + '/manifest.js');
    assert.equal(r.status, 404, gone + ' 应已移除');
  }
});
