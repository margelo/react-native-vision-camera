package com.margelo.nitro.camera.extensions

import android.view.View
import android.view.ViewGroup

// React does not trigger onLayout events for dynamically added views (`addView`). This fixes that.
// https://github.com/facebook/react-native/issues/17968#issuecomment-633308615
fun ViewGroup.installHierarchyFitter() {
  setOnHierarchyChangeListener(
    object : ViewGroup.OnHierarchyChangeListener {
      override fun onChildViewRemoved(
        parent: View?,
        child: View?,
      ) = Unit

      override fun onChildViewAdded(
        parent: View?,
        child: View?,
      ) {
        parent?.measure(
          View.MeasureSpec.makeMeasureSpec(measuredWidth, View.MeasureSpec.EXACTLY),
          View.MeasureSpec.makeMeasureSpec(measuredHeight, View.MeasureSpec.EXACTLY),
        )
        parent?.layout(parent.left, parent.top, parent.left + parent.measuredWidth, parent.top + parent.measuredHeight)
      }
    },
  )
}
