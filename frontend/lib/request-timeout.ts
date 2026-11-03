/** A finite budget and parent cancellation, without changing global API defaults. */
export async function withRequestTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>, milliseconds: number, parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, milliseconds);
  try { return await run(controller.signal); }
  finally { clearTimeout(timer); parent?.removeEventListener('abort', cancel); }
}
