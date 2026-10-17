import type { HybridObject } from "react-native-nitro-modules";
import type { TextPoint } from "./Point";
import type { RecognizedLanguage } from "./RecognizedLanguage.nitro";
import type { TextRect } from "./Rect";
import type { TextSymbol } from "./TextSymbol.nitro";

/** A space-separated text segment, usually a word in Latin text. */
export interface TextElement extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  readonly text: string;
  readonly boundingBox: TextRect | undefined;
  readonly cornerPoints: TextPoint[];
  readonly recognizedLanguages: RecognizedLanguage[];
  /** @platform Android only. ML Kit iOS returns an empty array. */
  readonly symbols: TextSymbol[];
  /** @platform Android only. */
  readonly confidence: number | undefined;
  /** @platform Android only. Degrees clockwise in the range `[-180, 180]`. */
  readonly angle: number | undefined;
}
