import Ionicons from '@react-native-vector-icons/ionicons'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type React from 'react'
import { useMemo, useState } from 'react'
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  Camera,
  type Size,
  type TargetCameraPosition,
  useCameraDevice,
} from 'react-native-vision-camera'
import { useIsActive } from '../hooks/useIsActive'
import { useSafeAreaPadding } from '../hooks/useSafeAreaPadding'
import { previewLabColors as colors } from '../theme/previewLabTheme'

type PipSize = 'small' | 'medium' | 'large'
type PipDock = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const SIZE_FACTORS: Record<PipSize, number> = {
  small: 0.27,
  medium: 0.38,
  large: 0.52,
}

const DOCKS: PipDock[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

function formatRatio(value: number | undefined): string {
  return value == null ? 'Waiting…' : value.toFixed(3)
}

function DockButton({
  dock,
  onPress,
  selected,
}: {
  dock: PipDock
  onPress: () => void
  selected: boolean
}): React.ReactElement {
  const [vertical, horizontal] = dock.split('-') as [
    'top' | 'bottom',
    'left' | 'right',
  ]

  return (
    <Pressable
      accessibilityLabel={`Dock ${dock}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.dockButton, selected && styles.dockButtonSelected]}
    >
      <View style={styles.dockDiagram}>
        <View
          style={[
            styles.dockDot,
            vertical === 'top' ? styles.dockTop : styles.dockBottom,
            horizontal === 'left' ? styles.dockLeft : styles.dockRight,
          ]}
        />
      </View>
    </Pressable>
  )
}

export function PictureInPictureScreen(): React.ReactElement {
  const navigation = useNavigation()
  const safePadding = useSafeAreaPadding(16)
  const isFocused = useIsFocused()
  const isAppActive = useIsActive()
  const window = useWindowDimensions()
  const [position, setPosition] = useState<TargetCameraPosition>('front')
  const device = useCameraDevice(position)
  const [uprightResolution, setUprightResolution] = useState<Size>()
  const [stageSize, setStageSize] = useState<Size>()
  const [pipSize, setPipSize] = useState<PipSize>('medium')
  const [dock, setDock] = useState<PipDock>('top-right')
  const isLandscape = window.width > window.height

  const uprightRatio =
    uprightResolution == null
      ? undefined
      : uprightResolution.width / uprightResolution.height
  const aspectRatio = uprightRatio ?? (isLandscape ? 16 / 9 : 9 / 16)

  const pipDimensions = useMemo(() => {
    if (stageSize == null) return undefined

    const desiredWidth = stageSize.width * SIZE_FACTORS[pipSize]
    const maximumHeight = Math.max(60, stageSize.height - 110)
    const width = Math.min(
      stageSize.width - 28,
      maximumHeight * aspectRatio,
      Math.max(64, desiredWidth),
    )

    return {
      height: width / aspectRatio,
      width,
    }
  }, [aspectRatio, pipSize, stageSize])

  const pipPosition = {
    ...(dock.startsWith('top') ? { top: 14 } : { bottom: 76 }),
    ...(dock.endsWith('left') ? { left: 14 } : { right: 14 }),
  }

  const handleStageLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { height, width } = nativeEvent.layout
    setStageSize((current) =>
      current?.height === height && current.width === width
        ? current
        : { height, width },
    )
  }

  if (device == null) {
    return (
      <View style={[styles.loadingContainer, safePadding]}>
        <Text style={styles.loadingText}>Waiting for a camera device…</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, safePadding]}>
      <View style={styles.navigationRow}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons color={colors.text} name="chevron-back" size={24} />
        </Pressable>
        <View style={styles.navigationCopy}>
          <Text style={styles.eyebrow}>PREVIEW LAB</Text>
          <Text style={styles.title}>Picture-in-picture</Text>
        </View>
        <View style={styles.ratioReadout}>
          <Text style={styles.ratioReadoutLabel}>UPRIGHT</Text>
          <Text style={styles.ratioReadoutValue}>
            {formatRatio(uprightRatio)}
          </Text>
        </View>
      </View>

      <View style={[styles.content, isLandscape && styles.contentLandscape]}>
        <View
          onLayout={handleStageLayout}
          style={[styles.callStage, isLandscape && styles.callStageLandscape]}
        >
          <View style={styles.participantAvatar}>
            <Ionicons color={colors.textSubtle} name="person" size={58} />
          </View>
          <Text style={styles.participantName}>Marc</Text>
          <Text style={styles.callStatus}>Connected · 04:18</Text>

          <View style={styles.callActions}>
            <View style={styles.callAction}>
              <Ionicons color={colors.text} name="mic-outline" size={21} />
            </View>
            <View style={[styles.callAction, styles.endCallAction]}>
              <Ionicons color={colors.text} name="call" size={21} />
            </View>
            <View style={styles.callAction}>
              <Ionicons
                color={colors.text}
                name="volume-high-outline"
                size={21}
              />
            </View>
          </View>

          {pipDimensions == null ? null : (
            <View style={[styles.pipFrame, pipDimensions, pipPosition]}>
              <Camera
                device={device}
                isActive={isAppActive && isFocused}
                mirrorMode={position === 'front' ? 'on' : 'off'}
                onPreviewResolution={setUprightResolution}
                orientationSource="device"
                resizeMode="contain"
                style={StyleSheet.absoluteFill}
              />

              <View pointerEvents="none" style={styles.pipHeader}>
                <View style={styles.liveDot} />
                <Text style={styles.pipHeaderText}>YOU</Text>
              </View>
              <Pressable
                accessibilityLabel="Flip camera"
                accessibilityRole="button"
                onPress={() =>
                  setPosition((current) =>
                    current === 'front' ? 'back' : 'front',
                  )
                }
                style={styles.flipButton}
              >
                <Ionicons color={colors.text} name="camera-reverse" size={18} />
              </Pressable>
            </View>
          )}
        </View>

        <ScrollView
          style={[
            styles.controlPanel,
            isLandscape && styles.controlPanelLandscape,
          ]}
          contentContainerStyle={[styles.controlPanelContent]}
        >
          <View
            style={[
              styles.controlRow,
              isLandscape && styles.controlRowLandscape,
            ]}
          >
            <View style={styles.controlSection}>
              <Text style={styles.controlTitle}>Size</Text>
              <View style={styles.segmentedControl}>
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <Pressable
                    accessibilityRole="button"
                    key={size}
                    onPress={() => setPipSize(size)}
                    style={[
                      styles.segmentButton,
                      pipSize === size && styles.segmentButtonSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentButtonText,
                        pipSize === size && styles.segmentButtonTextSelected,
                      ]}
                    >
                      {size[0]?.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.controlSection}>
              <Text style={styles.controlTitle}>Dock</Text>
              <View style={styles.dockControl}>
                {DOCKS.map((item) => (
                  <DockButton
                    dock={item}
                    key={item}
                    onPress={() => setDock(item)}
                    selected={dock === item}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.nativeValues}>
            <Text style={styles.nativeValueLabel}>UPRIGHT PREVIEW</Text>
            <Text style={styles.nativeValue}>
              {uprightResolution == null
                ? 'Waiting…'
                : `${uprightResolution.width} × ${uprightResolution.height} · ${formatRatio(uprightRatio)}`}
            </Text>
            <Text style={styles.nativeValueHint}>
              PiP frame{' '}
              {pipDimensions == null
                ? '—'
                : `${Math.round(pipDimensions.width)}×${Math.round(pipDimensions.height)}`}
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  navigationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 10,
    marginTop: 8,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  navigationCopy: {
    flex: 1,
    marginLeft: 12,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  ratioReadout: {
    alignItems: 'flex-end',
  },
  ratioReadoutLabel: {
    color: colors.textSubtle,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  ratioReadoutValue: {
    color: colors.text,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentLandscape: {
    flexDirection: 'row',
    gap: 12,
  },
  callStage: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 26,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 260,
    overflow: 'hidden',
  },
  callStageLandscape: {
    minHeight: 0,
  },
  participantAvatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 52,
    height: 104,
    justifyContent: 'center',
    width: 104,
  },
  participantName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    marginTop: 15,
  },
  callStatus: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
  callActions: {
    bottom: 16,
    flexDirection: 'row',
    gap: 12,
    position: 'absolute',
  },
  callAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  endCallAction: {
    backgroundColor: colors.danger,
  },
  pipFrame: {
    backgroundColor: colors.preview,
    borderColor: colors.primary,
    borderRadius: 18,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: 'black',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  pipHeader: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 10, 13, 0.72)',
    borderRadius: 999,
    flexDirection: 'row',
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    top: 8,
  },
  liveDot: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    height: 6,
    marginRight: 5,
    width: 6,
  },
  pipHeaderText: {
    color: colors.text,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  flipButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 10, 13, 0.72)',
    borderRadius: 16,
    bottom: 8,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    width: 32,
  },
  controlPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 0,
    marginTop: 10,
  },
  controlPanelLandscape: {
    height: '100%',
    marginTop: 0,
    maxWidth: 260,
    width: '32%',
  },
  controlPanelContent: {
    alignItems: 'stretch',
    gap: 14,
    padding: 16,
  },
  controlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  controlRowLandscape: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  controlSection: {
    gap: 7,
  },
  controlTitle: {
    color: colors.textSubtle,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 4,
  },
  segmentButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  segmentButtonSelected: {
    backgroundColor: colors.primary,
  },
  segmentButtonText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  segmentButtonTextSelected: {
    color: colors.primaryInk,
  },
  dockControl: {
    flexDirection: 'row',
    gap: 4,
  },
  dockButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  dockButtonSelected: {
    backgroundColor: colors.primaryWash,
  },
  dockDiagram: {
    borderColor: colors.textSubtle,
    borderRadius: 2,
    borderWidth: 1,
    height: 15,
    position: 'relative',
    width: 18,
  },
  dockDot: {
    backgroundColor: colors.primary,
    borderRadius: 1,
    height: 5,
    position: 'absolute',
    width: 6,
  },
  dockTop: {
    top: 1,
  },
  dockBottom: {
    bottom: 1,
  },
  dockLeft: {
    left: 1,
  },
  dockRight: {
    right: 1,
  },
  nativeValues: {
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nativeValueLabel: {
    color: colors.textSubtle,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nativeValue: {
    color: colors.text,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  nativeValueHint: {
    color: colors.textSubtle,
    fontSize: 9,
    marginTop: 3,
  },
})
