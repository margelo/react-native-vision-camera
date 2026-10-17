import type { HybridObject } from "react-native-nitro-modules";

/** A language identified by ML Kit. */
export interface RecognizedLanguage extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  /** The language code reported by ML Kit, or `undefined` on iOS when unavailable. */
  readonly languageCode: string | undefined;
}
