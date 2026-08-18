/* ============================================================
 * scripts/vercel-build.js — Vercel 构建脚本(零依赖)
 * ------------------------------------------------------------
 * 把静态站点文件(index.html / js / assets)复制到 dist/,
 * 供 Vercel 的 Output Directory(dist)发布;api/ 函数独立编译,
 * 不受本脚本影响。本地与 Cloudflare 部署不需要此脚本。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
const entries = ['index.html', 'js', 'assets'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of entries) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) {
    console.warn('[vercel-build] 跳过(不存在): ' + entry);
    continue;
  }
  fs.cpSync(src, path.join(out, entry), { recursive: true });
}

console.log('[vercel-build] 已生成 dist/: ' + entries.join(' + '));
