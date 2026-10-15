/**
 * 职责：Vite 构建/开发配置 —— dev 代理 /api → 主后端 localhost:3000、路径别名 @ → src
 *
 * 说明：已移除 vite-plugin-pwa（PWA Service Worker）。
 * 演示/MVP 预览阶段 Service Worker 的 CacheFirst + navigateFallback 会缓存旧版 JS，
 * 导致已修复的页面（如资源池）一直加载旧逻辑/旧接口而“加载失败”。
 * 离线能力属于后续增强批次，移除后由 main.tsx 在入口强制注销历史残留 SW。
 */
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
    plugins: [
        react(),
    ],
    // WorkBuddy Windows 环境会拦截 Vite 的 dist 清理动作；保留输出目录并覆盖哈希产物，确保构建可重复执行。
    build: {
        // 使用独立交付目录，避免受旧 dist 文件权限和安全删除钩子影响。
        emptyOutDir: false,
    },
    resolve: {
        alias: {
            // 路径别名：import { xxx } from '@/api/xxx' 等价于 src/api/xxx
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        // 开发代理：前端请求 /api/v1/... 转发到主后端（NestJS 默认 3000，见规格 3.7 APP_PORT）
        proxy: {
            '/api': {
                target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});
