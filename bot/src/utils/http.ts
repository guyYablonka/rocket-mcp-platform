export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
}

export async function remoteResponseError(response: Response): Promise<Error> {
  const text = await response.text();
  let detail: unknown = text;
  try {
    const json = JSON.parse(text) as {
      error?: string | { message?: string };
      message?: string;
    };
    detail = typeof json.error === "object"
      ? json.error.message
      : json.message || json.error || text;
  } catch {}
  return new Error(
    `Remote service returned HTTP ${response.status}: ${String(detail).slice(0, 500)}`,
  );
}
