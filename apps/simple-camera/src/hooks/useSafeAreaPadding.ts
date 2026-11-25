import { useMemo } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export function useSafeAreaPadding(horizontalPadding = 0) {
  const safeArea = useSafeAreaInsets()

  return useMemo<StyleProp<ViewStyle>>(() => {
    return {
      paddingTop: safeArea.top,
      paddingLeft: safeArea.left + horizontalPadding,
      paddingRight: safeArea.right + horizontalPadding,
      paddingBlock: safeArea.bottom,
    }
  }, [
    horizontalPadding,
    safeArea.bottom,
    safeArea.left,
    safeArea.right,
    safeArea.top,
  ])
}
