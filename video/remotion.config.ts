import { Config } from "@remotion/cli/config";
// WebGL (the grain fields and the atmosphere) renders on the GPU through ANGLE.
Config.setChromiumOpenGlRenderer("angle");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setConcurrency(6);
