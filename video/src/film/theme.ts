import { loadFont as loadDisplay } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadBody } from "@remotion/google-fonts/Manrope";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

/** The film's own look: night navy, mint for Kibble and safety, amber for money, red for danger. */
export const DISPLAY = loadDisplay("normal", { weights: ["500", "700", "800"], subsets: ["latin"] }).fontFamily;
export const BODY = loadBody("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;
export const MONO = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;

export const K = {
  night: "#060a17",
  night2: "#0b1228",
  deck: "#121a38",
  deck2: "#1b2550",
  ink: "#f2f5ff",
  ink2: "#c9d1f0",
  muted: "#8c97c4",
  mint: "#3df5b0",
  mintDeep: "#10b981",
  amber: "#ffb23e",
  gold: "#f7c64f",
  red: "#ff4d6d",
  yellow: "#ffd84a",
  orange: "#ff8a3d",
  violet: "#8b7bff",
  sky: "#5cc8ff",
  cream: "#eef0f8",
};
/** The four states of the brake ladder, in order. */
export const LADDER = [
  { name: "Healthy", color: K.mint },
  { name: "Watch", color: K.yellow },
  { name: "Braked", color: K.orange },
  { name: "Paused", color: K.red },
];
export const W = 1920;
export const H = 1080;
