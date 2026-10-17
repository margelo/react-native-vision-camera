import type { HybridObject } from "react-native-nitro-modules";
import type { TextPoint } from "./Point";
import type { RecognizedLanguage } from "./RecognizedLanguage.nitro";
import type { TextRect } from "./Rect";
import type { TextElement } from "./TextElement.nitro";

/** A line of text recognized by ML Kit. */
export interface TextLine extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  readonly text: string;
  readonly elements: TextElement[];
  readonly boundingBox: TextRect | undefined;
  readonly cornerPoints: TextPoint[];
  readonly recognizedLanguages: RecognizedLanguage[];
  /** @platform Android only. */
  readonly confidence: number | undefined;
  /** @platform Android only. Degrees clockwise in the range `[-180, 180]`. */
  readonly angle: number | undefined;
}
