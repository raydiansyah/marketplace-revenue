interface Pending {
  timer: ReturnType<typeof setTimeout>;
  controller: AbortController;
  url: string;
  init: RequestInit;
}

const pending = new Map<string, Pending>();

/**
 * Debounced fetch — membatalkan timer + request in-flight sebelumnya
 * setiap kali dipanggil dengan key yang sama.
 * Mencegah race condition last-write-wins saat user mengetik cepat.
 */
export function debouncedFetch(
  key: string,
  url: string,
  init: RequestInit,
  delayMs = 500
): void {
  const prev = pending.get(key);
  if (prev) {
    clearTimeout(prev.timer);
    prev.controller.abort();
  }

  const controller = new AbortController();
  const timer = setTimeout(async () => {
    pending.delete(key);
    try {
      await fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        console.error(`[debouncedFetch:${key}]`, e);
      }
    }
  }, delayMs);

  pending.set(key, { timer, controller, url, init });
}

/**
 * Flush semua pending debounced requests untuk key tertentu (atau semua jika key tidak diberikan).
 * Digunakan di beforeunload untuk memastikan request tidak hilang saat tab ditutup.
 * Menggunakan `navigator.sendBeacon` untuk fire-and-forget yang aman saat unload.
 */
export function flushPending(key?: string): void {
  const keys = key ? [key] : [...pending.keys()];
  for (const k of keys) {
    const entry = pending.get(k);
    if (!entry) continue;
    clearTimeout(entry.timer);
    entry.controller.abort();
    pending.delete(k);

    // sendBeacon hanya support POST + string/Blob/FormData body
    // Fallback ke fetch keepalive jika bukan POST atau body bukan string
    const method = (entry.init.method ?? "GET").toUpperCase();
    const body = entry.init.body;
    if (method === "POST" || method === "PUT") {
      const blob = typeof body === "string"
        ? new Blob([body], { type: "application/json" })
        : body instanceof Blob
          ? body
          : null;
      if (blob && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(entry.url, blob);
        continue;
      }
    }
    // Fallback: keepalive fetch (sinyal baru karena controller lama sudah di-abort)
    fetch(entry.url, { ...entry.init, keepalive: true }).catch(() => {
      // intentionally silent — tab sedang ditutup
    });
  }
}
