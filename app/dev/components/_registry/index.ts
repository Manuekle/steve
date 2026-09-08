import { aiElements } from "./ai-elements";
import { appShell } from "./app-shell";
import { foundations } from "./foundations";
import { motionSection } from "./motion";
import { uiControls } from "./ui-controls";
import { uiOverlays } from "./ui-overlays";
import type { Section } from "../_lib/types";

/** Reading order: tokens first, then what is built out of them. */
export const CATALOG: readonly Section[] = [
  foundations,
  uiControls,
  uiOverlays,
  motionSection,
  aiElements,
  appShell,
];
