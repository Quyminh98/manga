import { describe, expect, it, vi } from 'vitest'
import { QueueService, type QueueListItem } from '../../src/main/services/QueueService'
import type { PipelineTask } from '../../src/shared/entities'
import { TaskStatus, TaskType } from '../../src/shared/enums'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fakeTask(projectId: string): PipelineTask {
  return {
    id: `task-${projectId}`,
    projectId,
    taskType: TaskType.SPLIT_SRT,
    entityId: null,
    status: TaskStatus.SUCCESS,
    attempts: 1,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

describe('QueueService', () => {
  it('runs added projects strictly in FIFO order, one at a time', async () => {
    const deferreds = new Map<string, Deferred<void>>()
    const runProject = vi.fn(async (projectId: string) => {
      const deferred = createDeferred<void>()
      deferreds.set(projectId, deferred)
      await deferred.promise
    })
    const queue = new QueueService(runProject)

    queue.add('A')
    queue.add('B')
    queue.add('C')
    await Promise.resolve()

    expect(runProject).toHaveBeenCalledTimes(1)
    expect(runProject).toHaveBeenCalledWith('A', expect.any(Function))

    deferreds.get('A')!.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(runProject).toHaveBeenCalledTimes(2)
    expect(runProject).toHaveBeenCalledWith('B', expect.any(Function))

    deferreds.get('B')!.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(runProject).toHaveBeenCalledTimes(3)
    expect(runProject).toHaveBeenCalledWith('C', expect.any(Function))

    deferreds.get('C')!.resolve()
  })

  it('does not stop the queue when a run fails', async () => {
    const runProject = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)
    const queue = new QueueService(runProject)

    queue.add('A')
    queue.add('B')

    // Both microtask hops (A's rejection unwinding through drain()'s
    // try/catch/finally, then B starting) need to flush before asserting.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(runProject).toHaveBeenCalledTimes(2)
    expect(runProject).toHaveBeenNthCalledWith(1, 'A', expect.any(Function))
    expect(runProject).toHaveBeenNthCalledWith(2, 'B', expect.any(Function))
  })

  it('remove() drops a not-yet-started item before it ever reaches runProject', async () => {
    const runProject = vi.fn(async () => {
      await new Promise<void>(() => {})
    })
    const queue = new QueueService(runProject)

    queue.add('A')
    await Promise.resolve()
    expect(queue.remove('B')).toBe(false)
    queue.add('B')

    expect(queue.remove('B')).toBe(true)
    expect(queue.list()).toEqual<QueueListItem[]>([{ projectId: 'A', status: 'running' }])
    expect(runProject).not.toHaveBeenCalledWith('B', expect.any(Function))
  })

  it('remove() is a no-op for the currently-running item and unknown ids', async () => {
    const deferred = createDeferred<void>()
    const runProject = vi.fn(async () => deferred.promise)
    const queue = new QueueService(runProject)

    queue.add('A')
    await Promise.resolve()

    expect(queue.remove('A')).toBe(false)
    expect(queue.remove('does-not-exist')).toBe(false)
    expect(queue.list()).toEqual<QueueListItem[]>([{ projectId: 'A', status: 'running' }])

    deferred.resolve()
  })

  it('add() is idempotent for an already-queued or already-running project', async () => {
    const deferred = createDeferred<void>()
    const runProject = vi.fn(async () => deferred.promise)
    const queue = new QueueService(runProject)

    queue.add('A')
    await Promise.resolve()
    queue.add('A') // already running — no-op
    queue.add('B')
    queue.add('B') // already queued — no-op

    expect(queue.list()).toEqual<QueueListItem[]>([
      { projectId: 'A', status: 'running' },
      { projectId: 'B', status: 'queued' }
    ])
    expect(runProject).toHaveBeenCalledTimes(1)

    deferred.resolve()
  })

  it('list() puts the running item first, then queued items in insertion order', async () => {
    const deferred = createDeferred<void>()
    const runProject = vi.fn(async () => deferred.promise)
    const queue = new QueueService(runProject)

    queue.add('A')
    await Promise.resolve()
    queue.add('B')
    queue.add('C')

    expect(queue.list()).toEqual<QueueListItem[]>([
      { projectId: 'A', status: 'running' },
      { projectId: 'B', status: 'queued' },
      { projectId: 'C', status: 'queued' }
    ])

    deferred.resolve()
  })

  it('add() called mid-drain does not invoke runProject more than once concurrently', async () => {
    const deferred = createDeferred<void>()
    const runProject = vi.fn(async () => deferred.promise)
    const queue = new QueueService(runProject)

    queue.add('A')
    await Promise.resolve()
    queue.add('B')
    queue.add('C')
    await Promise.resolve()
    await Promise.resolve()

    expect(runProject).toHaveBeenCalledTimes(1)

    deferred.resolve()
  })

  it('fires onQueueChange on add/remove/start/finish and forwards onTaskUpdate unmodified', async () => {
    const changeSnapshots: QueueListItem[][] = []
    const receivedTasks: PipelineTask[] = []
    const deferreds = new Map<string, Deferred<void>>()
    let capturedOnTaskUpdate: ((task: PipelineTask) => void) | undefined

    const runProject = vi.fn(async (projectId: string, onTaskUpdate: (task: PipelineTask) => void) => {
      capturedOnTaskUpdate = onTaskUpdate
      const deferred = createDeferred<void>()
      deferreds.set(projectId, deferred)
      await deferred.promise
    })
    const queue = new QueueService(runProject, {
      onQueueChange: (items) => changeSnapshots.push(items),
      onTaskUpdate: (task) => receivedTasks.push(task)
    })

    queue.add('A')
    await Promise.resolve()

    // add() itself emits twice, synchronously: once for the push (queued),
    // once when drain() immediately picks it up (running).
    expect(changeSnapshots).toEqual<QueueListItem[][]>([
      [{ projectId: 'A', status: 'queued' }],
      [{ projectId: 'A', status: 'running' }]
    ])

    const task = fakeTask('A')
    capturedOnTaskUpdate?.(task)
    expect(receivedTasks).toEqual([task])

    // 'B' stays queued (runProject is still blocked on A's deferred), so it
    // can be removed before it ever starts.
    const beforeRemoveCount = changeSnapshots.length
    queue.add('B')
    expect(queue.remove('B')).toBe(true)
    expect(changeSnapshots.length).toBe(beforeRemoveCount + 2)

    deferreds.get('A')!.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // finally → empty again, and 'B' (removed) never ran.
    expect(changeSnapshots.at(-1)).toEqual<QueueListItem[]>([])
    expect(runProject).toHaveBeenCalledTimes(1)
  })
})
