import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native'

type Size = {
  width: number
  height: number
}

export type ContentPlacement = 'inside' | 'outside'

export type AspectRatioContentLayoutProps = {
  /** Width divided by height for the content frame. */
  aspectRatio: number
  /** Content rendered above the frame when space permits, or inside it otherwise. */
  top?: ReactNode
  /** Content rendered below the frame when space permits, or inside it otherwise. */
  bottom?: ReactNode
  /** Main content rendered inside the aspect-ratio frame. */
  children?: ReactNode
  /** Optional style for the aspect-ratio frame. */
  frameStyle?: StyleProp<ViewStyle>
  /** Whether the frame should preserve `aspectRatio` or fill the container. */
  frameMode?: 'aspect-ratio' | 'fullscreen'
  /** Called whenever the slots move inside or outside the frame. */
  onPlacementChanged?: (placement: ContentPlacement) => void
  /** Optional style for the layout's outer container. */
  style?: StyleProp<ViewStyle>
}

function getContainedSize(container: Size, aspectRatio: number): Size {
  const containerAspectRatio = container.width / container.height

  if (containerAspectRatio > aspectRatio) {
    return {
      width: container.height * aspectRatio,
      height: container.height,
    }
  }

  return {
    width: container.width,
    height: container.width / aspectRatio,
  }
}

/**
 * Centers an aspect-ratio frame and uses the vertical space around it for the
 * top and bottom slots. If those slots do not fit, they move inside the frame.
 */
export function AspectRatioContentLayout({
  aspectRatio,
  bottom,
  children,
  frameStyle,
  frameMode = 'aspect-ratio',
  onPlacementChanged,
  style,
  top,
}: AspectRatioContentLayoutProps): React.ReactElement {
  const [containerSize, setContainerSize] = useState<Size>()
  const [topHeight, setTopHeight] = useState(0)
  const [bottomHeight, setBottomHeight] = useState(0)

  const frameSize = useMemo(
    () =>
      containerSize == null
        ? undefined
        : frameMode === 'fullscreen'
          ? containerSize
          : getContainedSize(containerSize, aspectRatio),
    [aspectRatio, containerSize, frameMode],
  )

  const handleContainerLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      const { height, width } = nativeEvent.layout

      setContainerSize((current) =>
        current?.height === height && current.width === width
          ? current
          : { height, width },
      )
    },
    [],
  )

  const handleTopLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    setTopHeight(nativeEvent.layout.height)
  }, [])

  const handleBottomLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      setBottomHeight(nativeEvent.layout.height)
    },
    [],
  )

  const availableOuterHeight =
    containerSize != null && frameSize != null
      ? containerSize.height - frameSize.height
      : 0
  const renderSlotsInside = topHeight + bottomHeight > availableOuterHeight
  const placement: ContentPlacement = renderSlotsInside ? 'inside' : 'outside'

  useEffect(() => {
    if (containerSize != null && frameSize != null) {
      onPlacementChanged?.(placement)
    }
  }, [containerSize, frameSize, onPlacementChanged, placement])

  return (
    <BoxNoneView
      onLayout={handleContainerLayout}
      style={[styles.container, style]}
    >
      {containerSize != null && frameSize != null ? (
        <BoxNoneView
          style={[
            styles.frameColumn,
            { height: containerSize.height, width: frameSize.width },
          ]}
        >
          {!renderSlotsInside ? (
            <BoxNoneView onLayout={handleTopLayout}>{top}</BoxNoneView>
          ) : null}

          <BoxNoneView style={[styles.frame, frameSize, frameStyle]}>
            {renderSlotsInside ? (
              <BoxNoneView
                onLayout={handleTopLayout}
                style={styles.slotInsideTop}
              >
                {top}
              </BoxNoneView>
            ) : null}

            <BoxNoneView style={styles.content}>{children}</BoxNoneView>

            {renderSlotsInside ? (
              <BoxNoneView
                onLayout={handleBottomLayout}
                style={styles.slotInsideBottom}
              >
                {bottom}
              </BoxNoneView>
            ) : null}
          </BoxNoneView>

          {!renderSlotsInside ? (
            <BoxNoneView onLayout={handleBottomLayout}>{bottom}</BoxNoneView>
          ) : null}
        </BoxNoneView>
      ) : null}
    </BoxNoneView>
  )
}

const BoxNoneView = (props: ViewProps) => (
  <View {...props} pointerEvents="box-none" />
)

export const TopWrapperView = BoxNoneView
export const BottomWrapperView = BoxNoneView

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
  },
  frameColumn: {
    justifyContent: 'space-between',
  },
  frame: {
    overflow: 'hidden',
    position: 'relative',
  },
  slotInsideBottom: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 1,
  },
  slotInsideTop: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  content: {
    flex: 1,
  },
})
