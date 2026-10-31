/**
 * A Promise paired with externally-callable resolve/reject. Useful when an
 * event source (a callback pair, a listener) needs to feed into a Promise
 * the test can `await`. The error path becomes a Promise rejection, so a
 * native error fails the test with its own message instead of a timeout.
 */
export function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Race a Promise against a timeout. Rejects with a labeled error if the
 * Promise hasn't settled within `ms` milliseconds.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms: ${label}`)),
      ms,
    )
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}
