/**
 * rate-limit.gs
 * ─────────────────────────────────────────────
 * Chống spam / rate limiting dùng CacheService + LockService.
 *
 * Nguyên tắc:
 *   checkRateLimit_(items)  → tăng bộ đếm, trả false nếu đã quá giới hạn.
 *   peekRateLimit_(items)   → chỉ kiểm tra, không tăng.
 * ─────────────────────────────────────────────
 */

/**
 * Kiểm tra và tăng bộ đếm cho nhiều khoá cùng lúc (atomic với lock).
 * Trả về false nếu BẤT KỲ khoá nào đã vượt giới hạn → không tăng khoá nào.
 *
 * @param {Array<{key:string, max:number}>} items
 * @returns {boolean}
 */
function checkRateLimit_(items) {
  const cache  = CacheService.getScriptCache();
  const lock   = LockService.getScriptLock();
  const locked = lock.tryLock(3000);

  try {
    const hashed = items.map((it) => ({ k: 'rl_' + hash_(it.key), max: it.max }));
    const cur    = cache.getAll(hashed.map((h) => h.k));

    // Kiểm tra trước khi tăng
    for (const h of hashed) {
      if ((Number(cur[h.k]) || 0) >= h.max) return false;
    }

    // Tăng tất cả
    const upd = {};
    hashed.forEach((h) => { upd[h.k] = String((Number(cur[h.k]) || 0) + 1); });
    cache.putAll(upd, CONFIG.RATE_WINDOW_SECONDS);
    return true;

  } finally {
    if (locked) lock.releaseLock();
  }
}

/**
 * Chỉ kiểm tra (không tăng bộ đếm).
 * Trả false nếu bất kỳ khoá nào đã vượt giới hạn.
 *
 * @param {Array<{key:string, max:number}>} items
 * @returns {boolean}
 */
function peekRateLimit_(items) {
  const cache  = CacheService.getScriptCache();
  const hashed = items.map((it) => ({ k: 'rl_' + hash_(it.key), max: it.max }));
  const cur    = cache.getAll(hashed.map((h) => h.k));
  return hashed.every((h) => (Number(cur[h.k]) || 0) < h.max);
}
