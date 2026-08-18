/* ============================================================
 * logger.js — 服务器终端日志(零第三方依赖)
 * ------------------------------------------------------------
 * - 分级:DEBUG / INFO / WARN / ERROR(LOG_LEVEL 环境变量过滤,默认 info)
 * - 终端彩色输出:不同等级不同颜色 + 时间戳 + 作用域 + 消息
 * - scope 约定:server(启动/配置)、db(数据库)、auth(鉴权)、api(接口)、crypto(加密)
 * - 传入 Error 时自动打印完整堆栈
 * ============================================================ */
'use strict';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // 256 色前景
  gray: '\x1b[38;5;245m',
  cyan: '\x1b[38;5;117m',
  green: '\x1b[38;5;114m',
  yellow: '\x1b[38;5;221m',
  red: '\x1b[38;5;203m',
  // 256 色背景(等级徽标)
  bgGray: '\x1b[48;5;240m',
  bgCyan: '\x1b[48;5;25m',
  bgGreen: '\x1b[48;5;29m',
  bgYellow: '\x1b[48;5;94m',
  bgRed: '\x1b[48;5;88m',
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const STYLE = {
  debug: { fg: COLORS.cyan, bg: COLORS.bgGray },
  info: { fg: COLORS.green, bg: COLORS.bgGreen },
  warn: { fg: COLORS.yellow, bg: COLORS.bgYellow },
  error: { fg: COLORS.red, bg: COLORS.bgRed },
};

function threshold() {
  const v = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[v] != null ? LEVELS[v] : LEVELS.info;
}

function ts() {
  const d = new Date();
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return (
    p(d.getMonth() + 1) +
    '-' +
    p(d.getDate()) +
    ' ' +
    p(d.getHours()) +
    ':' +
    p(d.getMinutes()) +
    ':' +
    p(d.getSeconds()) +
    '.' +
    p(d.getMilliseconds(), 3)
  );
}

/** 记录一条日志(自动带时间戳、彩色等级徽标、作用域) */
function write(level, scope, message, extra) {
  if (LEVELS[level] == null || LEVELS[level] < threshold()) return;
  const st = STYLE[level];
  // [时间] 等级徽标(背景+前景色+加粗) [scope] message
  const badge =
    st.bg + st.fg + COLORS.bold + ' ' + level.toUpperCase().padEnd(5) + ' ' + COLORS.reset;
  const line =
    COLORS.dim +
    ts() +
    COLORS.reset +
    ' ' +
    badge +
    ' ' +
    COLORS.dim +
    '[' +
    scope +
    ']' +
    COLORS.reset +
    ' ' +
    message;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(line);
  // 附加对象/错误堆栈(堆栈行用暗色缩进)
  if (extra instanceof Error) {
    if (extra.stack) {
      const stackLines = String(extra.stack).split('\n').slice(1).join('\n');
      fn(COLORS.dim + stackLines + COLORS.reset);
    }
  } else if (extra !== undefined) {
    fn(extra);
  }
}

/** 请求日志:api=true 的接口按状态记 info/warn/error;静态资源仅 debug */
function request(method, pathname, status, ms, opts) {
  const color = status >= 500 ? COLORS.red : status >= 400 ? COLORS.yellow : COLORS.green;
  const statusStr = COLORS.bold + color + String(status) + COLORS.reset;
  const isApi = !!(opts && opts.api);
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : isApi ? 'info' : 'debug';
  write(
    level,
    isApi ? 'api' : 'http',
    COLORS.cyan +
      String(method).padEnd(6) +
      COLORS.reset +
      ' ' +
      pathname +
      '  ' +
      statusStr +
      COLORS.dim +
      ' ' +
      ms +
      'ms' +
      COLORS.reset
  );
}

const logger = {
  debug: (scope, msg, extra) => write('debug', scope, msg, extra),
  info: (scope, msg, extra) => write('info', scope, msg, extra),
  warn: (scope, msg, extra) => write('warn', scope, msg, extra),
  error: (scope, msg, extra) => write('error', scope, msg, extra),
  request,
  /** 横向分隔线(启动横幅等) */
  divider: (color) => {
    console.log(COLORS.dim + (color || COLORS.gray) + '─'.repeat(64) + COLORS.reset);
  },
};

module.exports = logger;
