package com.margelo.nitro.camera.extensions

import android.content.pm.PackageManager
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.PermissionAwareActivity
import com.margelo.nitro.camera.PermissionStatus

fun ReactApplicationContext.getPermissionStatus(permission: String): PermissionStatus {
  val status = ContextCompat.checkSelfPermission(this, permission)
  return when (status) {
    PackageManager.PERMISSION_DENIED -> {
      val hasRequestedPermissionBefore = PermissionStateStore.hasRequestedPermission(this, permission)
      if (!hasRequestedPermissionBefore) {
        return PermissionStatus.NOT_DETERMINED
      }
      if (PermissionStateStore.isPermissionPermanentlyDenied(this, permission)) {
        return PermissionStatus.DENIED
      }
      val activity = this.currentActivity
      if (activity != null) {
        val canRequestAgain = ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
        if (!canRequestAgain) {
          return PermissionStatus.DENIED
        }
      }
      return PermissionStatus.NOT_DETERMINED
    }
    PackageManager.PERMISSION_GRANTED -> {
      PermissionStateStore.setHasRequestedPermission(this, permission, false)
      PermissionStateStore.setPermissionPermanentlyDenied(this, permission, false)
      PermissionStatus.AUTHORIZED
    }
    else -> {
      Log.e("Permissions", "Unknown Permission Status! $status")
      return PermissionStatus.NOT_DETERMINED
    }
  }
}

suspend fun ReactApplicationContext.requestPermission(permission: String): Boolean {
  val activity = currentActivity ?: throw Error("No Activity!")
  if (activity !is PermissionAwareActivity) {
    throw Error("Activity is not a PermissionAwareActivity!")
  }

  PermissionStateStore.setHasRequestedPermission(this, permission, true)
  val grantResults = PermissionRequestDispatcher.request(activity, permission)
  val grantResult = grantResults.singleOrNull()
  if (grantResult == null) {
    // We asked for exactly one permission, so anything but exactly one result means the request never
    // reached the user - Android reports a cancellation as an empty array. Roll the "has requested"
    // marker back before bailing out: otherwise `getPermissionStatus(...)` sees a permission that has
    // been requested, is not permanently denied, and has no rationale to show (because it was never
    // presented), and reports it as `DENIED` instead of `NOT_DETERMINED`.
    PermissionStateStore.setHasRequestedPermission(this, permission, false)
    throw Error("Permission request for \"$permission\" was cancelled by Android! (got ${grantResults.size} results)")
  }

  val hasPermission = grantResult == PackageManager.PERMISSION_GRANTED
  if (hasPermission) {
    PermissionStateStore.setHasRequestedPermission(this, permission, false)
    PermissionStateStore.setPermissionPermanentlyDenied(this, permission, false)
  } else {
    val canRequestAgain = ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
    PermissionStateStore.setPermissionPermanentlyDenied(this, permission, !canRequestAgain)
  }
  return hasPermission
}
