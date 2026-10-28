/** Aynı anda gelen yoklama tetiklerini tek isteğe indirir.
 *  Aralık dolmadan gelen yeni tetik, aralık bitince bir kez daha çalışır. */

export type CoalescedRefresh = {
  (): void;
  cancel: () => void;
};

export function createCoalescedRefresh(
  run: () => Promise<unknown> | unknown,
  minGapMs = 1500,
): CoalescedRefresh {
  let inflight = false;
  let dirty = false;
  let lastDone = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  const start = () => {
    if (disposed) return;
    clearTimer();
    inflight = true;
    Promise.resolve()
      .then(run)
      .catch(() => undefined)
      .finally(() => {
        inflight = false;
        lastDone = Date.now();
        if (disposed || !dirty) return;
        dirty = false;
        start();
      });
  };

  const schedule = (() => {
    if (disposed) return;
    if (inflight) {
      dirty = true;
      return;
    }
    const wait = Math.max(0, minGapMs - (Date.now() - lastDone));
    if (wait === 0) {
      start();
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!disposed) start();
    }, wait);
  }) as CoalescedRefresh;

  schedule.cancel = () => {
    disposed = true;
    dirty = false;
    clearTimer();
  };

  return schedule;
}
