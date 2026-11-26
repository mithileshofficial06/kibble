"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { Odometer } from "./Odometer";

/* The home page after the replay: how it works, the comparison, the stories, and how to connect an agent. */

const EASE = [0.16, 1, 0.3, 1] as const;

function Rise({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Head({ n, eyebrow, title, em, after, note }: { n: string; eyebrow: string; title: string; em: string; after?: string; note?: string }) {
  return (
    <Rise className="m-head">
      <span className="m-n">{n}</span>
      <div>
        <p className="m-eyebrow">
          <span className="k-dot" aria-hidden="true" /> {eyebrow}
        </p>
        <h2 className="m-title">
          {title} <em>{em}</em>
          {after}
        </h2>
      </div>
      {note && <p className="m-note">{note}</p>}
    </Rise>
  );
}

const PARTS = [
  {
    img: "/home/box.webp",
    n: "01",
    title: "A cash box holds the money.",
    text: "The agent's own key holds nothing. It can only ask the box to pay, and only suppliers the owner allowed.",
    tag: "the drawer contract",
  },
  {
    img: "/home/vault.webp",
    n: "02",
    title: "Sales refill it. Profit goes home.",
    text: "The agent spends from a small allowance that refills only from sales that really cleared. Everything above it is swept to the owner's vault.",
    tag: "earned limit + vault",
  },
  {
    img: "/home/brake.webp",
    n: "03",
    title: "Trouble stops it, by itself.",
    text: "Spend more than it earned, three times, and the box locks. A thief with the agent's key finds almost nothing to take.",
    tag: "the brake ladder",
  },
];

const VS = [
  { day: "A busy day", fixed: "0.050", fixedNote: "the same limit, every round", kibble: "0.291", kibbleNote: "limit grew from 0.279, and 0.080 went to the vault" },
  { day: "A losing day", fixed: "0.153", fixedNote: "lost, and still paying", kibble: "70 s", kibbleNote: "until it stopped itself, no human involved" },
  { day: "A stolen key", fixed: "0.150", fixedNote: "overbought by the thief, still Healthy", kibble: "0.000", kibbleNote: "taken by the thief; locked in 2 seconds" },
];

const STORIES = [
  { id: "sales-rush", title: "A busy day", text: "Customers keep coming. Whose limit grows?" },
  { id: "bad-strategy", title: "A losing day", text: "Every sale loses money. Who keeps paying?" },
  { id: "hijack", title: "A stolen key", text: "A thief has the key. How much does each wallet give away?" },
];

function VsRow({ r, i }: { r: (typeof VS)[number]; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-10% 0px" });
  const zero = (v: string) => v.replace(/\d/g, "0");
  return (
    <Rise delay={i * 0.08}>
      <div ref={ref} className="m-vs-row">
        <p className="m-vs-day">
          <span>0{i + 1}</span>
          {r.day}
        </p>
        <div className="m-vs-cell fixed">
          <Odometer value={seen ? r.fixed : zero(r.fixed)} className="m-vs-num" />
          <span className="m-vs-note">{r.fixedNote}</span>
        </div>
        <div className="m-vs-cell kibble">
          <Odometer value={seen ? r.kibble : zero(r.kibble)} className="m-vs-num" />
          <span className="m-vs-note">{r.kibbleNote}</span>
        </div>
      </div>
    </Rise>
  );
}

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function More() {
  return (
    <div className="m-wrap">
      {/* 1. how it works */}
      <section className="m-sec" aria-labelledby="m-how">
        <Head n="K—02" eyebrow="How it works" title="A wallet that makes the agent" em="earn" after=" its limit." note="Three parts, all smart contracts on QDay Aevum. No server to trust." />
        <div className="m-parts">
          {PARTS.map((p, i) => (
            <Rise key={p.n} delay={i * 0.1} className="m-part">
              <div className="m-part-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.img} alt="" width={1080} height={810} loading="lazy" decoding="async" />
                <span className="m-part-tag">{p.tag}</span>
              </div>
              <div className="m-part-body">
                <span className="m-part-n">{p.n}</span>
                <h3 id={i === 0 ? "m-how" : undefined}>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            </Rise>
          ))}
        </div>
      </section>

      {/* 2. fixed vs kibble */}
      <section className="m-sec" aria-labelledby="m-vs">
        <Head n="K—03" eyebrow="Measured on testnet" title="Same agent, same customers." em="Different" after=" wallet." note="Real runs on the QDay Aevum testnet, 26 Nov 2026. Amounts are test money (tUSD8)." />
        <div className="m-vs" id="m-vs">
          <div className="m-vs-row m-vs-headrow" aria-hidden="true">
            <span />
            <span className="fixed">Fixed limit</span>
            <span className="kibble">Kibble</span>
          </div>
          {VS.map((r, i) => (
            <VsRow key={r.day} r={r} i={i} />
          ))}
        </div>
      </section>

      {/* 3. the stories */}
      <section className="m-sec" aria-labelledby="m-stories">
        <Head n="K—04" eyebrow="No wallet needed" title="Watch it" em="happen." note="Recorded runs play in your browser. Or press “Run it for real” and watch it on testnet." />
        <div className="m-stories" id="m-stories">
          {STORIES.map((s, i) => (
            <Rise key={s.id} delay={i * 0.1}>
              <Link href="/playground" className="m-story">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/shots/${s.id}.webp`} alt="" width={1280} height={720} loading="lazy" decoding="async" />
                <span className="m-story-shade" aria-hidden="true" />
                <span className="m-story-text">
                  <span className="m-story-n">0{i + 1}</span>
                  <b>{s.title}</b>
                  <span>{s.text}</span>
                </span>
                <span className="m-story-go" aria-hidden="true">
                  <Arrow />
                </span>
              </Link>
            </Rise>
          ))}
        </div>
      </section>

      {/* 4. for builders */}
      <section className="m-sec m-build" aria-labelledby="m-build">
        <Rise className="m-build-left">
          <p className="m-eyebrow">
            <span className="k-dot" aria-hidden="true" /> For builders
          </p>
          <h2 className="m-title" id="m-build">
            Give your agent a cash box in <em>five minutes.</em>
          </h2>
          <p className="m-build-text">Set one number: the most you&apos;re willing to lose in a week. Kibble works out the rest, and your agent gets a key that can only ask.</p>
          <div className="m-build-ctas">
            <Link href="/connect" className="k-btn">
              Connect your agent <Arrow />
            </Link>
            <Link href="/docs" className="k-link">
              Read the docs
            </Link>
          </div>
          <dl className="m-facts">
            <div>
              <dt>181</dt>
              <dd>tests, all passing</dd>
            </div>
            <div>
              <dt>100%</dt>
              <dd>line coverage of the Kibble contracts</dd>
            </div>
            <div>
              <dt>MIT</dt>
              <dd>open source</dd>
            </div>
          </dl>
        </Rise>
        <Rise delay={0.12} className="m-term">
          <div className="m-term-top" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>terminal · Aevum testnet</span>
          </div>
          <pre tabIndex={0} aria-label="Example terminal session">
            <code>
              <span className="c"># test keys go to ~/.kibble, never into your repo</span>
              {"\n"}
              <span className="p">$</span> pnpm kibble new --name <span className="s">&quot;My agent&quot;</span> --loss 2{"\n"}
              <span className="o">  2/3 drawer created: 0x…</span>
              {"\n"}
              <span className="o">  3/3 first allowance funded: 0.2000 tUSD8</span>
              {"\n\n"}
              <span className="p">$</span> pnpm kibble try{"\n"}
              <span className="o">  2. your agent bought its input for 0.0040: </span>
              <span className="g">PAID</span>
              {"\n"}
              <span className="o">  4. your agent tried to send 0.4000 to a stranger: </span>
              <span className="r">Refused</span>
              {"\n\n"}
              <span className="p">$</span> pnpm kibble freeze
            </code>
          </pre>
        </Rise>
      </section>
    </div>
  );
}
