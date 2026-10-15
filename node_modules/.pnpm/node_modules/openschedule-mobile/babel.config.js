/**
 * 职责：Babel 配置 —— babel-preset-expo + `@/` 路径别名（module-resolver）。
 * 别名同时由 tsconfig.json 的 paths 声明（类型检查用），二者指向同一目录 src/。
 * 若 module-resolver 出现异常，可移除 plugins 并降级为相对路径（ARCH §10）。
 */
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
    ],
  }
}
