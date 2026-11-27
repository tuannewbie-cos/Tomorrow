// api/_lib/fetcher.js — Tomorrow v4.12 Edge Proxy Hub
// Hardened upstream fetch with AbortController timeout, byte-size guard, and safe retry

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; TomorrowHub/4.12; +https://tomorrow.app)';

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseWithLimit(response, maxBytes) {
  const contentLengthHeader = response.headers?.get?.('content-length');
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(`Upstream Content-Length (${declaredLength}) exceeds ${maxBytes} bytes`);
    }
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancel errors
          }
          throw new Error(`Upstream stream exceeded maxBytes limit (${maxBytes})`);
        }
        chunks.push(value);
      }
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(merged);
    return { text, byteLength: totalBytes };
  }

  const text = await response.text();
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > maxBytes) {
    throw new Error(`Upstream text (${byteLength}) exceeds ${maxBytes} bytes`);
  }
  return { text, byteLength };
}

/**
 * Performs a bounded upstream HTTP fetch with timeout, size protection, and optional 1x transient retry.
 * Never retries 4xx client errors.
 */
export async function safeUpstreamFetch(url, options = {}) {
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 4500;
  const maxBytes = typeof options.maxBytes === 'number' && options.maxBytes > 0 ? options.maxBytes : 1500000;
  const retries = typeof options.retries === 'number' && options.retries >= 0 ? Math.min(options.retries, 1) : 1;
  const method = options.method || 'GET';
  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    ...(options.headers || {}),
  };

  let lastError = null;
  const startedAt = Date.now();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body,
        signal: controller.signal,
      });

      const contentType = response.headers?.get?.('content-type') || 'application/octet-stream';

      if (!response.ok) {
        if (RETRYABLE_STATUSES.has(response.status) && attempt < retries) {
          clearTimeout(timer);
          await delay(250);
          continue;
        }
        const errSnippet = (await response.text().catch(() => '')).slice(0, 300);
        clearTimeout(timer);
        return {
          ok: false,
          status: response.status,
          contentType,
          text: errSnippet,
          byteLength: Buffer.byteLength(errSnippet, 'utf8'),
          latencyMs: Date.now() - startedAt,
          json() {
            return JSON.parse(errSnippet);
          },
        };
      }

      const { text, byteLength } = await readResponseWithLimit(response, maxBytes);
      clearTimeout(timer);
      return {
        ok: true,
        status: response.status,
        contentType,
        text,
        byteLength,
        latencyMs: Date.now() - startedAt,
        json() {
          return JSON.parse(text);
        },
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await delay(250);
        continue;
      }
    }
  }

  throw lastError || new Error('Upstream fetch failed');
}
