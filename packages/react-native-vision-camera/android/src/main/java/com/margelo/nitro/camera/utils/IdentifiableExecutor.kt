package com.margelo.nitro.camera.utils

import java.util.concurrent.Executor
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadFactory
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class IdentifiableExecutor(
  name: String,
) : Executor {
  private val threadRef = AtomicReference<Thread?>()
  private val pool =
    ThreadPoolExecutor(1, 1, IDLE_THREAD_TIMEOUT_MS, TimeUnit.MILLISECONDS, LinkedBlockingQueue(), NamedThreadFactory(name, threadRef))

  override fun execute(command: Runnable?) {
    pool.execute(command)
  }

  /**
   * If `true`, the Thread exits after [IDLE_THREAD_TIMEOUT_MS] without work. The next job starts a new one.
   */
  fun setExitsWhenIdle(exitsWhenIdle: Boolean) {
    pool.allowCoreThreadTimeOut(exitsWhenIdle)
  }

  /**
   * Stops accepting new work and lets the Thread exit once queued work has finished.
   */
  fun shutdown() {
    pool.shutdown()
  }

  val isRunningOnExecutor: Boolean
    get() = Thread.currentThread() == threadRef.get()

  // The Thread references only the pool, so this object becomes unreachable with its owner.
  protected fun finalize() {
    pool.shutdown()
  }

  companion object {
    const val IDLE_THREAD_TIMEOUT_MS = 5_000L
  }
}

// Must not reference IdentifiableExecutor: a live Thread keeps its pool and this factory reachable.
private class NamedThreadFactory(
  private val name: String,
  private val threadRef: AtomicReference<Thread?>,
) : ThreadFactory {
  override fun newThread(runnable: Runnable): Thread = Thread(runnable, name).also { threadRef.set(it) }
}
