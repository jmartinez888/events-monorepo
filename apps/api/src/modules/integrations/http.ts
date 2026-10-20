/** Fallo transitorio (429, 5xx, red): la cola reintenta respetando retryAfterMs si el proveedor lo indica. */
export class RetryableError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

/** Fallo que no se corrige reintentando (credenciales, datos inválidos). */
export class PermanentError extends Error {}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
  /** Nombre del proveedor para mensajes de error legibles. */
  provider: string;
}

export async function requestJson<T>(url: string, options: RequestOptions): Promise<T> {
  const { body, timeoutMs = 20_000, provider, headers, ...init } = options;
  const finalHeaders = new Headers(headers);
  let payload: BodyInit | undefined;
  if (body instanceof URLSearchParams) payload = body;
  else if (body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }
  finalHeaders.set('Accept', 'application/json');
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: finalHeaders, body: payload, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error: any) {
    throw new RetryableError(`${provider}: sin respuesta (${error?.name === 'TimeoutError' ? 'tiempo de espera agotado' : error?.message ?? 'error de red'})`);
  }
  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (response.ok) return data as T;
  const detail = typeof data === 'object' && data ? (data as any).message || (data as any).error?.message || (data as any).error_description || JSON.stringify(data).slice(0, 300) : text.slice(0, 300);
  const message = `${provider} respondió ${response.status}: ${detail}`;
  if (response.status === 429) throw new RetryableError(message, retryAfter(response.headers.get('retry-after')));
  if (response.status >= 500 || response.status === 408) throw new RetryableError(message);
  throw new PermanentError(message);
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Retry-After admite segundos o una fecha HTTP. */
export function retryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
