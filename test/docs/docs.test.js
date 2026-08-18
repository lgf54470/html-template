/* ============================================================
 * docs 模块测试 — 侧边栏一级菜单「文档」(含 4 个二级子模块)
 * ------------------------------------------------------------
 * 本文件只覆盖模块级资源:清单(children 声明)、模块私有样式、
 * 模块词典。四个子模块各自在独立文件中测试,互不干扰。
 * ============================================================ */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let srv;

before(async () => {
  srv = await startServer();
});

after(async () => {
  await srv.stop();
});

const BASE = '/js/modules/docs';

const CHILDREN = [
  { id: 'introduction', route: '/docs/introduction', titleKey: 'docs.introduction.title' },
  { id: 'get-started', route: '/docs/get-started', titleKey: 'docs.getStarted.title' },
  { id: 'tutorials', route: '/docs/tutorials', titleKey: 'docs.tutorials.title' },
  { id: 'changelog', route: '/docs/changelog', titleKey: 'docs.changelog.title' },
];

test('模块清单声明 4 个二级子模块及各自路由', async () => {
  const r = await srv.request('GET', BASE + '/manifest.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/javascript/);
  assert.match(r.text, /App\.registerModule\(\{/);
  assert.match(r.text, /id:\s*'docs'/);

  for (const child of CHILDREN) {
    assert.match(r.text, new RegExp("id:\\s*'" + child.id + "'"), '应声明子模块 ' + child.id);
    assert.match(
      r.text,
      new RegExp("route:\\s*'" + child.route.replace(/\//g, '\\/') + "'"),
      '应声明路由 ' + child.route
    );
  }
});

test('模块私有样式可访问', async () => {
  const r = await srv.request('GET', BASE + '/module.css');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/css/);
});

test('模块词典含三语言与子模块文案键', async () => {
  const r = await srv.request('GET', BASE + '/i18n.js');
  assert.equal(r.status, 200);
  assert.match(r.text, /__moduleI18n\['docs'\]/);
  for (const child of CHILDREN) {
    assert.match(
      r.text,
      new RegExp("'" + child.titleKey.replace(/\./g, '\\.') + "'"),
      '应含 ' + child.id + ' 的文案键'
    );
  }
});
