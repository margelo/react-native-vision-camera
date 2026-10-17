import { NitroModules } from "react-native-nitro-modules";
import type { TextRecognizer } from "./specs/TextRecognizer.nitro";
import type { TextRecognizerFactory } from "./specs/TextRecognizerFactory.nitro";

const factory = NitroModules.createHybridObject<TextRecognizerFactory>(
  "TextRecognizerFactory",
);

export function createTextRecognizer(): TextRecognizer {
  return factory.createTextRecognizer();
}
