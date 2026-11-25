"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { repoUrl } from "@/lib/env";

/** Fixed landing nav. Hidden while the intro plays (html[data-intro="load"]). */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`k-navbar ${scrolled ? "scrolled" : ""}`}>
      <nav className="k-nav" aria-label="Main">
        <Link href="/" className="k-brand">
          kibble<span aria-hidden="true">.</span>
        </Link>
        <div className="k-nav-links">
          <a href="#replay">The replay</a>
          <Link href="/live">Live</Link>
          <Link href="/playground">Playground</Link>
          <Link href="/assistant">Assistant</Link>
          <Link href="/connect">Connect</Link>
          <Link href="/docs">How it works</Link>
          <a href={repoUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
        <Link href="/live" className="k-nav-cta">
          Open app
        </Link>
      </nav>
    </header>
  );
}
