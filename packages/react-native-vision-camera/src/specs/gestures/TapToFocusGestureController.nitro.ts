import type { CameraController } from '../CameraController.nitro'
import type { ListenerSubscription } from '../common-types/ListenerSubscription'
import type { MeteringPoint } from '../metering/MeteringPoint.nitro'
import type { GestureController } from './GestureController.nitro'

/**
 * A {@linkcode TapToFocusGestureController} is a {@linkcode GestureController}
 * that can trigger a {@linkcode CameraController}'s
 * {@linkcode CameraController.focusTo | focusTo(...)}
 * action via a native tap to focus gesture.
 */
export interface TapToFocusGestureController extends GestureController {
  /**
   * Adds a listener that is called when a native tap gesture creates a
   * {@linkcode MeteringPoint}, immediately before focusing begins.
   *
   * Call {@linkcode ListenerSubscription.remove | remove()} on the returned
   * subscription to stop receiving updates.
   */
  addOnTapListener(onTap: (point: MeteringPoint) => void): ListenerSubscription

  /**
   * Adds a listener that is called when the focus operation triggered by a
   * native tap completes.
   *
   * This is not called if the focus operation fails. Call
   * {@linkcode ListenerSubscription.remove | remove()} on the returned
   * subscription to stop receiving updates.
   */
  addOnFocusCompletedListener(
    onFocusCompleted: (point: MeteringPoint) => void,
  ): ListenerSubscription
}
