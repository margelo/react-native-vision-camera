import type { HybridObject } from "react-native-nitro-modules";
import type { TextRecognizer } from "./TextRecognizer.nitro";

export interface TextRecognizerFactory extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  createTextRecognizer(): TextRecognizer;
}
