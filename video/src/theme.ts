import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";

export const SANS = loadGeist("normal", { weights: ["100", "200", "300", "400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const MONO = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;
export const SERIF = loadSerif("italic", { weights: ["400"], subsets: ["latin"] }).fontFamily;
loadSerif("normal", { weights: ["400"], subsets: ["latin"] });

/** The app's palette (web/src/app/globals.css), plus two in-betweens for the brake ladder. */
export const C = {
  bg: "#100c14",
  bg2: "#15101a",
  bg3: "#1c1622",
  fg: "#ede8e3",
  fg2: "#cfc8c2",
  muted: "#9a92a3",
  faint: "#5f5768",
  line: "rgba(237,232,227,0.10)",
  line2: "rgba(237,232,227,0.18)",
  saffron: "#ffb000",
  amber: "#ff8a1f",
  coral: "#ff4d3d",
  mint: "#6ee7a8",
};

export const W = 1920;
export const H = 1080;
