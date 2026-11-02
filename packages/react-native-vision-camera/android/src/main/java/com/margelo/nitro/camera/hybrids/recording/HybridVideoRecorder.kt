package com.margelo.nitro.camera.hybrids.recording

import androidx.camera.video.PendingRecording
import androidx.camera.video.Recording
import androidx.camera.video.VideoRecordEvent
import com.margelo.nitro.camera.HybridRecorderSpec
import com.margelo.nitro.camera.RecordingFinishedReason
import com.margelo.nitro.camera.extensions.VideoRecorderError
import com.margelo.nitro.camera.extensions.parallel
import com.margelo.nitro.camera.utils.IdentifiableExecutor
import com.margelo.nitro.core.Promise
import com.margelo.nitro.core.resolve
import java.io.File

class HybridVideoRecorder(
  private val pendingRecording: PendingRecording,
  private val file: File,
) : HybridRecorderSpec() {
  private val executor = IdentifiableExecutor("com.margelo.nitro.recorder")
  private var recording: Recording? = null
  private var isCancelled = false

  override val isRecording: Boolean
    get() = recording != null
  override var isPaused: Boolean = false
  override var recordedDuration: Double = 0.0
  override var recordedFileSize: Double = 0.0

  override val filePath: String
    get() = file.absolutePath

  override fun startRecording(
    onRecordingFinished: (String, RecordingFinishedReason) -> Unit,
    onRecordingError: (Throwable) -> Unit,
    onRecordingPaused: (() -> Unit)?,
    onRecordingResumed: (() -> Unit)?,
  ): Promise<Unit> {
    var didResolve = false
    val promise = Promise<Unit>()

    executor.execute {
      // On our serial executor, make sure we are not currently recording
      if (this.recording != null) {
        val error = Error("Active recording already in progress!")
        promise.reject(error)
        return@execute
      }

      // Reset State
      this.isPaused = false
      this.recordedDuration = 0.0
      this.recordedFileSize = 0.0

      // Start recording
      this.recording =
        try {
          pendingRecording.start(executor) { event ->
            when (event) {
              is VideoRecordEvent.Start -> {
                promise.resolve()
                didResolve = true
              }
              is VideoRecordEvent.Pause -> onRecordingPaused?.invoke()
              is VideoRecordEvent.Resume -> onRecordingResumed?.invoke()
              is VideoRecordEvent.Finalize -> {
                // Recording is over - drop the Recording reference so `isRecording`
                // flips to false even when the finalize was auto-triggered (e.g. by
                // reaching `maxDuration` / `maxFileSize`) instead of via `stopRecording()`.
                this.recording = null
                if (isCancelled) {
                  // Recording was cancelled - delete the file and don't notify
                  isCancelled = false
                  file.delete()
                  return@start
                }
                val finishReason =
                  when (event.error) {
                    VideoRecordEvent.Finalize.ERROR_NONE -> RecordingFinishedReason.STOPPED
                    VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED -> RecordingFinishedReason.MAX_DURATION_REACHED
                    VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED -> RecordingFinishedReason.MAX_FILE_SIZE_REACHED
                    // Source went inactive (e.g. Activity stopped mid-recording). Unlike
                    // ERROR_NO_VALID_DATA, CameraX still finalizes a valid file, so keep it.
                    VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE -> RecordingFinishedReason.STOPPED
                    else -> null
                  }
                if (finishReason != null) {
                  // Recording finished successfully - either no error, or file/duration limit reached:
                  onRecordingFinished(file.absolutePath, finishReason)
                } else {
                  // We have an error, either during capture or even while starting:
                  val error = VideoRecorderError(event.error, event.cause)
                  if (!didResolve) {
                    // We didn't even start the Recording yet! Reject promise
                    promise.reject(error)
                    didResolve = true
                  } else {
                    // Unknown error while recording
                    onRecordingError(error)
                  }
                }
              }
              is VideoRecordEvent.Status -> {
                this.recordedDuration = event.recordingStats.recordedDurationNanos / 1_000_000_000.0
                this.recordedFileSize = event.recordingStats.numBytesRecorded.toDouble()
              }
            }
          }
        } catch (error: IllegalStateException) {
          // CameraX throws synchronously if the shared Recorder already has an active
          // recording, e.g. one started by another Recorder of this output.
          promise.reject(error)
          return@execute
        }
    }

    return promise
  }

  override fun stopRecording(): Promise<Unit> {
    return Promise.parallel(executor) {
      val recording = recording ?: throw Error("Not currently recording!")
      recording.stop()
      this.isPaused = false
      this.recording = null
      this.recordedDuration = 0.0
      this.recordedFileSize = 0.0
    }
  }

  override fun pauseRecording(): Promise<Unit> {
    return Promise.parallel(executor) {
      val recording = recording ?: throw Error("Not currently recording!")
      recording.pause()
      this.isPaused = true
    }
  }

  override fun resumeRecording(): Promise<Unit> {
    return Promise.parallel(executor) {
      val recording = recording ?: throw Error("Not currently recording!")
      recording.resume()
      this.isPaused = false
    }
  }

  override fun cancelRecording(): Promise<Unit> {
    return Promise.parallel(executor) {
      val recording = recording ?: throw Error("Not currently recording!")
      // Mark as cancelled so the Finalize event deletes
      // the file instead of notifying the caller
      this.isCancelled = true
      recording.close()
      this.isPaused = false
      this.recording = null
      this.recordedDuration = 0.0
      this.recordedFileSize = 0.0
    }
  }

  override fun dispose() {
    super.dispose()
    recording?.close()
    recording = null
  }
}
