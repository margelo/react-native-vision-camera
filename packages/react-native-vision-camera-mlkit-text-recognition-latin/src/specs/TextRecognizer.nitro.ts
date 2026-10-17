import type { Image } from "react-native-nitro-image";
import type { HybridObject } from "react-native-nitro-modules";
import type { Frame } from "react-native-vision-camera";
import type { RecognizedText } from "./RecognizedText.nitro";

/** A Latin-script ML Kit text recognizer. */
export interface TextRecognizer extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  /** Synchronously recognizes text in a camera Frame. */
  recognizeText(frame: Frame): RecognizedText;
  /** Asynchronously recognizes text in a camera Frame. */
  recognizeTextAsync(frame: Frame): Promise<RecognizedText>;
  /** Synchronously recognizes text in a Nitro Image. */
  recognizeTextInImage(image: Image): RecognizedText;
  /** Asynchronously recognizes text in a Nitro Image. */
  recognizeTextInImageAsync(image: Image): Promise<RecognizedText>;
}
