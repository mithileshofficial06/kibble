"use client";

import { useState } from "react";
import { useCan3D } from "@/components/three/useCan3D";
import { TourSteps } from "@/components/TourSteps";
import { Film } from "@/tour/Film";

/** The film, by itself, in 3D. Without WebGL (or with reduced motion on) the step-by-step version. */
export default function TourPage() {
  const can = useCan3D();
  const [steps, setSteps] = useState(false);
  if (can === null)
    return (
      <main className="film-page">
        <div className="film">
          <div className="film-load">Setting the stage…</div>
        </div>
      </main>
    );
  if (!can || steps) return <TourSteps onFilm={can ? () => setSteps(false) : undefined} />;
  return (
    <main className="film-page">
      <Film onSteps={() => setSteps(true)} />
    </main>
  );
}
