"use client";

import { useId, useState, type ReactNode } from "react";
import { TERMS, type TermKey } from "@/lib/plain";

/** A plain word with its meaning one hover, focus or tap away. */
export function Term({ k, children }: { k: TermKey; children?: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const t = TERMS[k];
  return (
    <span className="term" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        {children ?? t.word}
        <i aria-hidden="true">?</i>
      </button>
      {open && (
        <span role="tooltip" id={id} className="term-tip">
          {t.hint}
        </span>
      )}
    </span>
  );
}
