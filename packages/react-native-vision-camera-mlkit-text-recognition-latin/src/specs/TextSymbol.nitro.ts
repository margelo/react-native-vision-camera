import type { HybridObject } from "react-native-nitro-modules";
import type { TextPoint } from "./Point";
import type { RecognizedLanguage } from "./RecognizedLanguage.nitro";
import type { TextRect } from "./Rect";

/**
 * A single symbol recognized by ML Kit.
 *
 * @platform Android only. ML Kit iOS does not expose symbols.
 */
export interface TextSymbol extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  readonly text: string;
  readonly boundingBox: TextRect | undefined;
  readonly cornerPoints: TextPoint[];
  readonly recognizedLanguages: RecognizedLanguage[];
  /** @platform Android only. */
  readonly confidence: number | undefined;
  /** @platform Android only. Degrees clockwise in the range `[-180, 180]`. */
  readonly angle: number | undefined;
}
