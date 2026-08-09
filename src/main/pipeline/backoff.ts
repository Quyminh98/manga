// spec.md 33 — "Nếu API trả rate limit: giảm tốc, retry theo backoff."
// Exponential backoff shared by every retry loop that calls VilaoService.
export const RATE_LIMIT_BASE_DELAY_MS = 1000
export const RATE_LIMIT_MAX_DELAY_MS = 30000

// `streak` = how many consecutive rate-limit hits have been seen so far in
// this retry loop (1 on the first hit) — resets whenever an attempt
// succeeds, so a one-off rate limit doesn't permanently slow every later
// request.
export function rateLimitDelayMs(streak: number): number {
  return Math.min(RATE_LIMIT_BASE_DELAY_MS * 2 ** Math.max(0, streak - 1), RATE_LIMIT_MAX_DELAY_MS)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
