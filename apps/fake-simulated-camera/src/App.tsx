import { StyleSheet, Text, View } from 'react-native'
import { VisionCamera } from 'react-native-vision-camera'

function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FakeSimulatedCamera</Text>
      <Text style={styles.text}>
        Camera permission: {VisionCamera.cameraPermissionStatus}
      </Text>
      <Text style={styles.text}>
        This app only exists to run Harness tests against an injected camera.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'black',
    padding: 24,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  text: {
    color: 'white',
    textAlign: 'center',
  },
})

export default App
