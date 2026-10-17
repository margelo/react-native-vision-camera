import { useIsFocused, useNavigation } from '@react-navigation/native'
import { StatusBar, StyleSheet, Text, View } from 'react-native'
import {
  CommonResolutions,
  useCameraDevice,
  useFrameOutput,
} from 'react-native-vision-camera'
import {
  type TargetBarcodeFormat,
  useBarcodeScanner,
} from 'react-native-vision-camera-barcode-scanner'
import { CameraView } from '../components/CameraView'
import { FullOverlay } from '../components/FullOverlay'
import { IconButton } from '../components/IconButton'
import { Row } from '../components/Row'
import { useIsActive } from '../hooks/useIsActive'
import { useSafeAreaPadding } from '../hooks/useSafeAreaPadding'

const PLUGIN_NAME = 'react-native-vision-camera-barcode-scanner'
const BARCODE_FORMATS: TargetBarcodeFormat[] = ['all-formats']

export function BarcodeScannerScreen() {
  const navigation = useNavigation()
  const isAppActive = useIsActive()
  const isScreenFocused = useIsFocused()
  const safePadding = useSafeAreaPadding()
  const device = useCameraDevice('back')
  const barcodeScanner = useBarcodeScanner({
    barcodeFormats: BARCODE_FORMATS,
  })

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: CommonResolutions.HD_4_3,
    onFrame(frame) {
      'worklet'
      try {
        const barcodes = barcodeScanner.scanCodes(frame)
        if (barcodes.length === 0) return

        for (const barcode of barcodes) {
          const box = barcode.boundingBox
          const width = 44
          const top = `top: ${box.top}`
          const bottom = `bottom: ${box.bottom}`
          const left = `left: ${box.left}`
          const right = `right: ${box.right}`
          const topPadding = Math.max(0, Math.floor((width - top.length) / 2))
          const bottomPadding = Math.max(
            0,
            Math.floor((width - bottom.length) / 2),
          )
          const middlePadding = Math.max(
            1,
            width - left.length - right.length - 2,
          )

          console.log(`
Barcode "${barcode.rawValue}" (${frame.orientation})
+${'-'.repeat(width)}+
|${' '.repeat(topPadding)}${top}${' '.repeat(Math.max(0, width - topPadding - top.length))}|
| ${left}${' '.repeat(middlePadding)}${right} |
|${' '.repeat(bottomPadding)}${bottom}${' '.repeat(Math.max(0, width - bottomPadding - bottom.length))}|
+${'-'.repeat(width)}+`)
        }
      } catch (error) {
        console.error(`${PLUGIN_NAME} failed:`, error)
      } finally {
        frame.dispose()
      }
    },
  })

  if (device == null) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.text}>No back camera device!</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, safePadding]}>
      <StatusBar barStyle="light-content" />
      <CameraView
        isActive={isAppActive && isScreenFocused}
        device={device}
        outputs={[frameOutput]}
        mirrorMode="off"
        resizeMode="contain"
        orientationSource="device"
      />

      <FullOverlay style={safePadding}>
        <Row>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{PLUGIN_NAME}</Text>
          </View>
          <IconButton iconName="close" onPress={() => navigation.goBack()} />
        </Row>
      </FullOverlay>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  title: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  text: {
    color: 'white',
  },
})
