import {
  createStaticNavigation,
  type StaticParamList,
} from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { VisionCamera } from 'react-native-vision-camera'
import { BarcodeScannerScreen } from './screens/BarcodeScannerScreen'
import { CameraScreen } from './screens/CameraScreen'
import { PermissionsScreen } from './screens/PermissionsScreen'
import { PhotoScreen } from './screens/PhotoScreen'
import { TextRecognitionLatinScreen } from './screens/TextRecognitionLatinScreen'
import { VideoScreen } from './screens/VideoScreen'

const RootStack = createNativeStackNavigator({
  initialRouteName:
    VisionCamera.cameraPermissionStatus === 'authorized'
      ? 'Camera'
      : 'Permissions',
  screens: {
    Permissions: PermissionsScreen,
    Camera: {
      screen: CameraScreen,
      options: {
        orientation: 'portrait_up',
      },
    },
    TextRecognitionLatin: {
      screen: TextRecognitionLatinScreen,
      options: {
        orientation: 'all',
      },
    },
    BarcodeScanner: {
      screen: BarcodeScannerScreen,
      options: {
        orientation: 'all',
      },
    },
    Photo: {
      screen: PhotoScreen,
      options: {
        animation: 'none',
        presentation: 'transparentModal',
      },
    },
    Video: {
      screen: VideoScreen,
      options: {
        animation: 'none',
        presentation: 'transparentModal',
      },
    },
  },
  screenOptions: {
    navigationBarHidden: true,
    headerShown: false,
    contentStyle: {
      backgroundColor: 'black',
    },
  },
})

type RootStackParamList = StaticParamList<typeof RootStack>

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Navigation = createStaticNavigation(RootStack)

function App() {
  return (
    <GestureHandlerRootView>
      <Navigation />
    </GestureHandlerRootView>
  )
}

export default App
