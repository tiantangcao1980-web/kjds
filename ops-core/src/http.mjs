/**
 * HTTP 客户端：统一重试（429 读 Retry-After，其余指数退避）、超时、审计回调。
 * 不含任何平台字段，Ozon/Amazon/其它 API 都复用这一层。
 */
export class HttpError extends Error {
  constructor(status, code, message, body) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export function createHttpClient({
  baseUrl,
  headers = {},
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxRetries = 3,
  retryDelaysMs = [1500, 3000, 4500],
  audit = null,
  timeoutMs = 30000,
} = {}) {
  async function request(path, { method = 'POST', body, query, headers: extraHeaders = {} } = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers, ...extraHeaders },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const text = await response.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        audit?.({ url: String(url), method, status: response.status });
        if (response.ok) return { status: response.status, json, text };
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers?.get?.('retry-after'));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : retryDelaysMs[attempt] ?? 4500;
          lastError = new HttpError(response.status, response.status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR', text.slice(0, 300), json);
          if (attempt < maxRetries) {
            await sleep(delay);
            continue;
          }
          throw lastError;
        }
        throw new HttpError(response.status, 'REQUEST_FAILED', text.slice(0, 300), json);
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof HttpError) throw error;
        lastError = error;
        if (attempt < maxRetries) {
          await sleep(retryDelaysMs[attempt] ?? 4500);
          continue;
        }
        throw new HttpError(0, 'NETWORK_ERROR', String(error?.message ?? error));
      }
    }
    throw lastError;
  }

  return { request };
}
