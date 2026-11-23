"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { Fragment, useRef, type ReactNode } from "react";
import { Odometer } from "./landing/Odometer";

/*
 * Shared pieces for the app pages, in the landing's language: an editorial page head with a vertical
 * rail, word-by-word titles, panels that rise in as they scroll into view, rolling numbers.
 */

export const EASE = [0.16, 1, 0.3, 1] as const;

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
  id,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  id?: string;
  as?: "div" | "section" | "li";
}) {
  const reduce = useReducedMotion();
  const M = as === "section" ? motion.section : as === "li" ? motion.li : motion.div;
  return (
    <M
      id={id}
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </M>
  );
}

/** A title whose words rise out of a mask, one after another. `*word*` is set in the serif italic. */
export function Title({ text, as = "h1", className, delay = 0 }: { text: string; as?: "h1" | "h2"; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.2 });
  const Tag = as;
  const words = text.split(" ");
  return (
    <Tag ref={ref} className={className}>
      {words.map((w, i) => {
        const em = /^\*.*\*[.,!?]?$/.test(w);
        const clean = em ? w.replace(/\*/g, "") : w;
        const inner = (
          <motion.span
            initial={reduce ? false : { y: "110%", rotate: 5 }}
            animate={seen || reduce ? { y: "0%", rotate: 0 } : undefined}
            transition={{ duration: 0.9, delay: delay + 0.05 + i * 0.055, ease: EASE }}
            style={{ transformOrigin: "0 100%" }}
          >
            {em ? <em>{clean}</em> : clean}
          </motion.span>
        );
        return (
          <Fragment key={i}>
            <span className="w">{inner}</span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        );
      })}
    </Tag>
  );
}

/** The page head: rail label, eyebrow, big title, lede and an optional aside (buttons, a stat). */
export function PageHead({
  n,
  rail,
  eyebrow,
  title,
  lede,
  aside,
  live,
}: {
  n: string;
  rail: string;
  eyebrow: ReactNode;
  title: string;
  lede?: ReactNode;
  aside?: ReactNode;
  live?: boolean;
}) {
  const reduce = useReducedMotion();
  const fade = (d: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: d, ease: EASE } };
  return (
    <header className="ph">
      <motion.div className="ph-rail" aria-hidden="true" {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.5, duration: 1 } })}>
        <b>{n}</b>
        <span>{rail}</span>
      </motion.div>
      <div className="ph-main">
        <motion.p className="ph-eyebrow" {...fade(0)}>
          <span className={`pulse ${live ? "live" : ""}`} aria-hidden="true" /> {eyebrow}
        </motion.p>
        <Title text={title} className="ph-title" delay={0.05} />
        {lede && (
          <motion.p className="ph-lede" {...fade(0.45)}>
            {lede}
          </motion.p>
        )}
      </div>
      {aside && (
        <motion.div className="ph-aside" {...fade(0.6)}>
          {aside}
        </motion.div>
      )}
    </header>
  );
}

/** "01 — Title ……… note" */
export function SecHead({ n, title, note }: { n: string; title: string; note?: ReactNode }) {
  return (
    <Reveal className="sec-head" y={14}>
      <span className="sec-n">{n}</span>
      <Title as="h2" text={title} className="sec-title" />
      {note && <p className="sec-note">{note}</p>}
    </Reveal>
  );
}

export function StatePill({ state }: { state?: string }) {
  return (
    <span className={`st ${state ?? ""}`}>
      <i aria-hidden="true" />
      {state ?? "…"}
    </span>
  );
}

/** A rolling number. Shows "…" while loading. */
export function Num({ value, className }: { value?: string; className?: string }) {
  if (!value || value === "…") return <span className={className}>…</span>;
  return <Odometer value={value} className={className} />;
}

export function Arrow() {
  return (
    <svg className="arrow" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Drifting colour and film grain behind every app page. */
export function Atmosphere() {
  return (
    <div className="atmo" aria-hidden="true">
      <span />
      <span />
      <span />
      <i />
    </div>
  );
}
