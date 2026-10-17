# react-native-vision-camera-mlkit-text-recognition-latin

Latin-script text recognition for VisionCamera using ML Kit and Nitro Modules.

```tsx
import { useTextRecognizer } from 'react-native-vision-camera-mlkit-text-recognition-latin'

const recognizer = useTextRecognizer()

// In a Frame Processor:
const result = recognizer.recognizeText(frame)
console.log(result.text)
```

The result follows ML Kit's hierarchy: recognized text, blocks, lines, elements,
and (on Android) symbols. `symbols`, `confidence`, and `angle` are Android-only
ML Kit results; iOS returns an empty symbol array and `undefined` for the latter
two properties.
