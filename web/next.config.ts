import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace packages ship TypeScript source.
  transpilePackages: ["@aevum-kit/aevum", "@kibble/sdk", "@kibble/agents"],
};

export default config;
