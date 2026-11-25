package com.margelo.nitro.camera.example.fake.camerax

import androidx.camera.core.CameraIdentifier
import androidx.camera.core.concurrent.CameraCoordinator
import androidx.camera.core.impl.CameraFactory
import androidx.camera.core.impl.CameraInternal
import androidx.camera.core.impl.Observable
import androidx.camera.core.impl.utils.futures.Futures
import androidx.camera.testing.fakes.FakeCamera
import androidx.camera.testing.impl.fakes.FakeCameraCoordinator
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.Executor

// Serves the catalog's FakeCameras to CameraX in catalog order.
class CatalogCameraFactory(private val cameras: Map<String, FakeCamera>) : CameraFactory {
  private val coordinator = FakeCameraCoordinator()

  override fun getCamera(cameraId: String): CameraInternal =
    cameras[cameraId] ?: throw IllegalArgumentException("Unknown camera: $cameraId")

  override fun getAvailableCameraIds(): Set<String> = cameras.keys

  override fun getCameraCoordinator(): CameraCoordinator = coordinator

  override fun getCameraManager(): Any? = null

  override fun getCameraPresenceSource(): Observable<List<CameraIdentifier>> = PresenceSource(cameras.keys)

  override fun onCameraIdsUpdated(cameraIds: List<String>) {}

  private class PresenceSource(ids: Set<String>) : Observable<List<CameraIdentifier>> {
    private val identifiers = ids.map { CameraIdentifier.Factory.create(it) }

    override fun fetchData(): ListenableFuture<List<CameraIdentifier>> = Futures.immediateFuture(identifiers)

    override fun addObserver(executor: Executor, observer: Observable.Observer<in List<CameraIdentifier>>) {
      executor.execute { observer.onNewData(identifiers) }
    }

    override fun removeObserver(observer: Observable.Observer<in List<CameraIdentifier>>) {}
  }
}
