/* ============================================================
 * env.js — 零依赖 .env 加载器
 * ------------------------------------------------------------
 * - 启动时读取项目根目录 .env(若存在),把 KEY=VALUE 注入 process.env
 * - 已存在的进程环境变量优先(不覆盖),.env 只补充缺失项
 * - 支持 # 注释、空行、可选成对引号(单/双)
 * - 无需 npm dotenv:保持零外部依赖
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return; // .env 不存在则忽略
  }
  text.split(/\r?\n/).forEach(function (raw) {
    const line = raw.trim();
    if (!line || line.charAt(0) === '#') return;
    const eq = line.indexOf('=');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    if (!key) return;
    let value = line.slice(eq + 1).trim();
    // 去除可选的成对引号
    if (
      value.length >= 2 &&
      ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

loadEnvFile(path.join(process.cwd(), '.env'));
