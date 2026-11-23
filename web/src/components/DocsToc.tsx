"use client";

import { useEffect, useState } from "react";

/** Sticky contents list; the section in view is marked. */
export function DocsToc({ sections }: { sections: { id: string; label: string }[] }) {
  const [on, setOn] = useState(sections[0]?.id);
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setOn(top.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);
  return (
    <nav className="docs-toc" aria-label="On this page">
      <p className="docs-toc-title">On this page</p>
      {sections.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} className={on === s.id ? "on" : ""} aria-current={on === s.id ? "location" : undefined}>
          <span>0{i + 1}</span>
          {s.label}
        </a>
      ))}
    </nav>
  );
}
