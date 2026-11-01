import Ionicons, {
  type IoniconsIconName,
} from '@react-native-vector-icons/ionicons'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type React from 'react'
import { useState } from 'react'
import {
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
import {
  AspectRatioContentLayout,
  type ContentPlacement,
} from '../components/AspectRatioContentLayout'
import { useIsActive } from '../hooks/useIsActive'
import { useSafeAreaPadding } from '../hooks/useSafeAreaPadding'
import { previewLabColors as colors } from '../theme/previewLabTheme'

interface ControlButtonProps {
  icon: IoniconsIconName
  label: string
  onPress?: () => void
  selected?: boolean
}

function ControlButton({
  icon,
  label,
  onPress,
  selected = false,
}: ControlButtonProps): React.ReactElement {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.controlButton, selected && styles.controlButtonSelected]}
    >
      <Ionicons color={colors.text} name={icon} size={21} />
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  )
}

function formatRatio(value: number | undefined): string {
  return value == null ? 'Waiting…' : value.toFixed(3)
}

export function AdaptiveControlsScreen(): React.ReactElement {
  const navigation = useNavigation()
  const safePadding = useSafeAreaPadding(16)
  const isAppActive = useIsActive()
  const isFocused = useIsFocused()
  const window = useWindowDimensions()
  const [position, setPosition] = useState<TargetCameraPosition>('back')
  const device = useCameraDevice(position)
  const [uprightResolution, setUprightResolution] = useState<Size>()
  const [placement, setPlacement] = useState<ContentPlacement>('outside')
  const [useUprightFrame, setUseUprightFrame] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const isLandscape = window.width > window.height

  const uprightRatio =
    uprightResolution == null
      ? undefined
      : uprightResolution.width / uprightResolution.height
  const frameRatio = useUprightFrame ? (uprightRatio ?? 1) : 1
  const contentGuideStyle =
    uprightRatio == null || frameRatio === uprightRatio
      ? styles.contentGuideFill
      : frameRatio > uprightRatio
        ? {
            height: '100%' as const,
            width: `${(uprightRatio / frameRatio) * 100}%` as const,
          }
        : {
            height: `${(frameRatio / uprightRatio) * 100}%` as const,
            width: '100%' as const,
          }

  const topControls = (
    <View style={[styles.controlBar, styles.topControls]}>
      <ControlButton
        icon={showGrid ? 'grid' : 'grid-outline'}
        label="Grid"
        onPress={() => setShowGrid((current) => !current)}
        selected={showGrid}
      />
      <View style={styles.controlSpacer} />
      <View style={styles.placementBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.placementText}>{placement.toUpperCase()}</Text>
      </View>
      <View style={styles.controlSpacer} />
      <ControlButton icon="ellipsis-horizontal" label="More" />
    </View>
  )

  const bottomControls = (
    <View style={[styles.controlBar, styles.bottomControls]}>
      <ControlButton icon="images-outline" label="Library" />
      <Pressable
        accessibilityLabel="Capture"
        accessibilityRole="button"
        style={styles.captureButton}
      >
        <View style={styles.captureButtonInner} />
      </Pressable>
      <ControlButton
        icon="camera-reverse-outline"
        label="Flip"
        onPress={() =>
          setPosition((current) => (current === 'back' ? 'front' : 'back'))
        }
      />
    </View>
  )

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
          <Text style={styles.title}>Adaptive controls</Text>
        </View>
        <View style={styles.ratioReadout}>
          <Text style={styles.ratioReadoutLabel}>RESIZE MODE</Text>
          <Text style={styles.ratioReadoutValue}>CONTAIN · LOCKED</Text>
        </View>
      </View>

      <View style={[styles.content, isLandscape && styles.contentLandscape]}>
        <AspectRatioContentLayout
          aspectRatio={frameRatio}
          bottom={bottomControls}
          frameStyle={styles.previewFrame}
          onPlacementChanged={setPlacement}
          style={styles.adaptiveLayout}
          top={topControls}
        >
          <Camera
            device={device}
            isActive={isAppActive && isFocused}
            mirrorMode={position === 'front' ? 'on' : 'off'}
            onPreviewResolution={setUprightResolution}
            orientationSource="device"
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
          />

          <View pointerEvents="none" style={styles.contentBounds}>
            <View style={[styles.contentGuide, contentGuideStyle]} />
          </View>

          {showGrid ? (
            <View pointerEvents="none" style={styles.grid}>
              <View style={[styles.gridLine, styles.gridVerticalFirst]} />
              <View style={[styles.gridLine, styles.gridVerticalSecond]} />
              <View style={[styles.gridLine, styles.gridHorizontalFirst]} />
              <View style={[styles.gridLine, styles.gridHorizontalSecond]} />
            </View>
          ) : null}
        </AspectRatioContentLayout>

        <ScrollView
          style={[
            styles.configurationPanel,
            isLandscape && styles.configurationPanelLandscape,
          ]}
          contentContainerStyle={styles.configurationPanelContent}
        >
          <View
            style={[
              styles.configurationHeader,
              isLandscape && styles.configurationHeaderLandscape,
            ]}
          >
            <View>
              <Text style={styles.configurationTitle}>Frame alignment</Text>
              <Text style={styles.configurationDescription}>
                Keep Contain active and change the frame ratio.
              </Text>
            </View>
            <View
              style={[
                styles.nativeValues,
                isLandscape && styles.nativeValuesLandscape,
              ]}
            >
              <Text style={styles.nativeValueLabel}>UPRIGHT</Text>
              <Text style={styles.nativeValue}>
                {uprightResolution == null
                  ? 'Waiting…'
                  : `${uprightResolution.width} × ${uprightResolution.height}`}
              </Text>
            </View>
          </View>

          <View style={styles.comparisonRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setUseUprightFrame(false)}
              style={[
                styles.comparisonButton,
                !useUprightFrame && styles.comparisonButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.comparisonButtonEyebrow,
                  !useUprightFrame && styles.comparisonButtonEyebrowSelected,
                ]}
              >
                GUESSED
              </Text>
              <Text
                style={[
                  styles.comparisonButtonText,
                  !useUprightFrame && styles.comparisonButtonTextSelected,
                ]}
              >
                Square · 1.000
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={uprightRatio == null}
              onPress={() => setUseUprightFrame(true)}
              style={[
                styles.comparisonButton,
                useUprightFrame && styles.comparisonButtonSelected,
                uprightRatio == null && styles.comparisonButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.comparisonButtonEyebrow,
                  useUprightFrame && styles.comparisonButtonEyebrowSelected,
                ]}
              >
                FROM PREVIEW
              </Text>
              <Text
                style={[
                  styles.comparisonButtonText,
                  useUprightFrame && styles.comparisonButtonTextSelected,
                ]}
              >
                Upright · {formatRatio(uprightRatio)}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.comparisonExplanation}>
            {useUprightFrame
              ? 'The frame follows the upright Preview, so edge controls line up with the visible image.'
              : 'The square frame can push edge controls into the bars beside the visible Preview.'}
          </Text>
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
  adaptiveLayout: {
    flex: 1,
    minHeight: 180,
  },
  previewFrame: {
    backgroundColor: '#201316',
    borderColor: colors.primary,
    borderRadius: 24,
    borderWidth: 1,
  },
  controlBar: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  topControls: {
    borderRadius: 18,
    minHeight: 52,
  },
  bottomControls: {
    borderRadius: 22,
    justifyContent: 'space-between',
    minHeight: 78,
  },
  controlSpacer: {
    flex: 1,
  },
  controlButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 15, 14, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 48,
  },
  controlButtonSelected: {
    backgroundColor: colors.primaryWash,
    borderColor: colors.primary,
  },
  controlLabel: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  placementBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 15, 14, 0.82)',
    borderColor: colors.primaryBorder,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveDot: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    height: 6,
    marginRight: 6,
    width: 6,
  },
  placementText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  captureButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 15, 14, 0.82)',
    borderColor: 'white',
    borderRadius: 31,
    borderWidth: 3,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  captureButtonInner: {
    backgroundColor: 'white',
    borderRadius: 25,
    height: 50,
    width: 50,
  },
  contentBounds: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  contentGuide: {
    borderColor: colors.primary,
    borderWidth: 1,
  },
  contentGuideFill: {
    height: '100%',
    width: '100%',
  },
  grid: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  gridLine: {
    backgroundColor: 'rgba(255, 255, 255, 0.36)',
    position: 'absolute',
  },
  gridVerticalFirst: {
    bottom: 0,
    left: '33.333%',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridVerticalSecond: {
    bottom: 0,
    left: '66.666%',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridHorizontalFirst: {
    height: StyleSheet.hairlineWidth,
    left: 0,
    right: 0,
    top: '33.333%',
  },
  gridHorizontalSecond: {
    height: StyleSheet.hairlineWidth,
    left: 0,
    right: 0,
    top: '66.666%',
  },
  configurationPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 0,
    marginTop: 10,
  },
  configurationPanelLandscape: {
    height: '100%',
    marginTop: 0,
    maxWidth: 320,
    width: '38%',
  },
  configurationPanelContent: {
    padding: 16,
  },
  configurationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  configurationHeaderLandscape: {
    flexDirection: 'column',
    gap: 10,
  },
  configurationTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  configurationDescription: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 3,
    maxWidth: 215,
  },
  nativeValues: {
    alignItems: 'flex-end',
  },
  nativeValuesLandscape: {
    alignItems: 'flex-start',
  },
  nativeValueLabel: {
    color: colors.textSubtle,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  nativeValue: {
    color: colors.text,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    marginTop: 3,
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
  },
  comparisonButton: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  comparisonButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  comparisonButtonDisabled: {
    opacity: 0.45,
  },
  comparisonButtonEyebrow: {
    color: colors.textSubtle,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
  },
  comparisonButtonEyebrowSelected: {
    color: colors.primaryBorder,
  },
  comparisonButtonText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  comparisonButtonTextSelected: {
    color: colors.primaryInk,
  },
  comparisonExplanation: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
})
