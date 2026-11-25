"use client";

import { useEffect, useState } from "react";

/** null while unknown; false without WebGL 2 or when the visitor asked for less motion. */
export function useCan3D(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOk(false);
      return;
    }
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2");
      setOk(Boolean(gl));
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}
