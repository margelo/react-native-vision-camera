import type { HybridObject } from "react-native-nitro-modules";
import type { TextBlock } from "./TextBlock.nitro";

/** The complete hierarchical text-recognition result returned by ML Kit. */
export interface RecognizedText extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  /** All recognized text, or an empty string when none was found. */
  readonly text: string;
  /** Text blocks in ML Kit reading order. */
  readonly blocks: TextBlock[];
}
