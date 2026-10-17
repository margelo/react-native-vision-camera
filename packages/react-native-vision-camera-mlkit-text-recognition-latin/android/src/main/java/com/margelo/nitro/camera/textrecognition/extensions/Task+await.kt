package com.margelo.nitro.camera.textrecognition.extensions

import com.google.android.gms.tasks.Task
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

private val directExecutor = Executor { runnable -> runnable.run() }

internal suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
  addOnCompleteListener(directExecutor) { task ->
    if (!continuation.isActive) return@addOnCompleteListener
    when {
      task.isSuccessful -> continuation.resume(task.result)
      task.isCanceled -> continuation.cancel()
      else -> continuation.resumeWithException(task.exception ?: RuntimeException("Task failed without exception"))
    }
  }
}
