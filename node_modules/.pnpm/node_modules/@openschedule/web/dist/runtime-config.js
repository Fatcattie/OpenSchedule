// 本地开发/未注入时的默认运行时配置（全部为空 = 错误上报 no-op）。
// 生产镜像启动时由 deploy/web/40-runtime-config.sh 按环境变量覆盖本文件。
window.__OS_RUNTIME__ = {}
