import { useMemo } from "react";
import { createTextRecognizer } from "./factory";
import type { TextRecognizer } from "./specs/TextRecognizer.nitro";

/** Creates and retains a Latin-script ML Kit text recognizer. */
export function useTextRecognizer(): TextRecognizer {
  return useMemo(() => createTextRecognizer(), []);
}
