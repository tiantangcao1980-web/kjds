/**
 * 实时看板服务（从 OZON Monitor 泛化）：
 * - 调用方只提供 stateProvider() → 任意 JSON 快照
 * - GET /            默认 HTML（若传 renderHtml）
 * - GET /api/state   快照 JSON
 * - GET /events      SSE，每 sseIntervalMs 推一帧（浏览器断线自动重连）
 * - GET /healthz     存活探针
 */
import http from 'node:http';

export function createDashboardServer({ stateProvider, renderHtml = null, port = 8288, host = '127.0.0.1', sseIntervalMs = 5000 } = {}) {
  const clients = new Set();
  const timer = setInterval(() => {
    if (clients.size === 0) return;
    let payload;
    try {
      payload = JSON.stringify(stateProvider());
    } catch {
      return;
    }
    for (const client of clients) {
      try {
        client.write(`event: state\ndata: ${payload}\n\n`);
      } catch {
        clients.delete(client);
      }
    }
  }, sseIntervalMs);
  timer.unref?.();

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    try {
      if (url.pathname === '/events') {
        const initial = JSON.stringify(stateProvider());
        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        response.write(`event: state\ndata: ${initial}\n\n`);
        clients.add(response);
        request.on('close', () => clients.delete(response));
        return;
      }
      if (url.pathname === '/api/state') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(stateProvider()));
        return;
      }
      if (url.pathname === '/healthz') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('ok');
        return;
      }
      if (url.pathname === '/' && renderHtml) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(renderHtml(stateProvider()));
        return;
      }
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('not found');
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end(`dashboard error: ${String(error?.message ?? error)}`);
    }
  });

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => resolve(`http://${host}:${server.address().port}`));
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(timer);
        for (const client of clients) {
          try {
            client.end();
          } catch {
            // 忽略已断开连接
          }
        }
        clients.clear();
        server.close(() => resolve());
      }),
  };
}
