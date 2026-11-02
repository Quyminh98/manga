// Bounded-concurrency task pool: `concurrency` workers each pull the next
// unstarted item (in order) and run `worker` on it, until every item has
// been processed. No third-party dependency. Items may finish out of order
// relative to each other, but each worker always starts its items in array
// order. Shared by Scene Generation batches and (Phase 28) Character Prompt
// batches.
// `shouldContinue` (optional) is polled before a worker picks up its next
// item — Pause/Cancel support (plan.md Phase 9): once it returns false, no
// new batch starts, but whatever a worker already started keeps running to
// completion ("request đang chạy được phép hoàn thành", spec.md 37).
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldContinue?: () => boolean
): Promise<void> {
  let cursor = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        if (shouldContinue && !shouldContinue()) return
        const index = cursor++
        await worker(items[index], index)
      }
    })
  )
}
