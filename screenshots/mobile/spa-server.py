"""SPA 静态预览服务器：为 apps/mobile/dist 提供带 index.html 回退的静态服务。
用途：Expo Web 导出产物是单页应用（React Navigation 的 path 路由），
      刷新 /today/TodayFocus 这类非根路径时，普通静态服务器会 404。
用法：python spa-server.py <dist目录> <端口>
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SPAHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        # 非文件且非目录 → 回退到 index.html，交给前端路由处理
        if not os.path.exists(path) and not path.endswith('/'):
            self.path = '/index.html'
        return super().send_head()

    def log_message(self, fmt, *args):  # 静音访问日志
        pass


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'dist'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 4173
    os.chdir(root)
    server = ThreadingHTTPServer(('127.0.0.1', port), SPAHandler)
    print(f'SPA preview server on http://127.0.0.1:{port} (root={os.getcwd()})', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
