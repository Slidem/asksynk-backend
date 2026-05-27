export async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  {
    timeoutMs = 8000,
    intervalMs = 100,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (predicate(last)) return last;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  if (lastError) {
    throw new Error(
      `pollUntil timed out after ${timeoutMs}ms; last error: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  throw new Error(
    `pollUntil timed out after ${timeoutMs}ms; last value: ${JSON.stringify(last)}`,
  );
}
