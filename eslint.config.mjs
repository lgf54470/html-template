// ESLint 9 扁平配置(flat config)
// - 前端 js/** 运行于浏览器,后端 server/** 运行于 Node
// - worker.js / deno/** 为 ES Module,单独指定 sourceType
// - 排除生成/第三方文件,避免对 Tailwind 产物与图标数据做无意义检查
import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'assets/**',
      'js/core/icons-data.js',
      'js/lib/**',
      'package-lock.json',
      // 平台管理目录(如 Freebuff 预览脚手架),gitignored,不参与 lint
      '.freebuff/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        // 前端自定义全局命名空间(window.App)
        App: 'readonly',
        Deno: 'readonly',
      },
    },
    rules: {
      // 历史代码以 var 为主,放宽对未使用变量/重复声明的阻塞等级
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-redeclare': 'off',
      'no-useless-escape': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': 'off',
    },
  },
  {
    files: ['**/*.mjs', 'worker.js', 'deno/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        Deno: 'readonly',
      },
    },
  },
  eslintConfigPrettier,
];
