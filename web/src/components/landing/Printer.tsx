"use client";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef } from "react";
import { Odometer } from "./Odometer";
import type { SideState } from "./script";

type Props = {
  side: SideState;
  loop: number;
  plate: string;
  kind: "fixed" | "kibble";
  drawer: string;
  address: string;
  enterDelay: number;
};

/** One receipt printer: a machine head with an LCD, and a thermal tape that prints the drawer's payments. */
export function Printer({ side, loop, plate, kind, drawer, address, enterDelay }: Props) {
  const [scope, animate] = useAnimate();
  const head = useRef<HTMLDivElement>(null);

  // Every print nudges the head; every stamp jolts the whole machine.
  const printed = side.lines.length ? side.lines[0].id : 0;
  useEffect(() => {
    if (printed && head.current) animate(head.current, { y: [0, 1.5, -0.5, 0] }, { duration: 0.18 });
  }, [printed, animate]);

  const jolts = side.lines.filter((l) => l.stamp).length + (side.paused ? 1 : 0);
  const lastJolts = useRef(0);
  useEffect(() => {
    if (jolts > lastJolts.current && scope.current) {
      animate(
        scope.current,
        { x: [0, -7, 6, -4, 2, 0], rotate: [0, -0.7, 0.5, -0.3, 0.1, 0] },
        { duration: 0.45, delay: side.paused ? 0.18 : 0.3 },
      );
    }
    lastJolts.current = jolts;
  }, [jolts, side.paused, animate, scope]);

  return (
    <motion.div
      className={`ld-printer ${kind}`}
      initial={{ y: -60, opacity: 0, rotate: kind === "fixed" ? -2 : 2 }}
      animate={{ y: 0, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 16, delay: enterDelay }}
    >
      <div ref={scope} className="ld-printer-body">
        <div ref={head} className="ld-head">
          <div className="ld-head-top">
            <span className="ld-plate">{plate}</span>
            <span className={`ld-led ${side.led}`} aria-hidden="true" />
          </div>
          <div className="ld-lcd">
            <div>
              <small>{kind === "fixed" ? "Limit / window" : "Earned limit"}</small>
              <Odometer value={side.limit} />
            </div>
            <div>
              <small>Exposure</small>
              <Odometer value={side.exposure} />
            </div>
            <div className="ld-lcd-state">
              <small>State</small>
              <span className={side.state === "PAUSED" ? "blink" : undefined}>{side.state}</span>
            </div>
          </div>
          <div className="ld-slot" aria-hidden="true" />
        </div>

        <div className="ld-tape-wrap">
          <div className="ld-tape">
            <div className="ld-tape-head">
              <strong>{drawer}</strong>
              <span>{address}</span>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.ul
                key={loop}
                className="ld-lines"
                exit={{ y: 140, opacity: 0, rotate: kind === "fixed" ? -3 : 3, transition: { duration: 0.55, ease: [0.5, 0, 0.75, 0] } }}
              >
                <AnimatePresence initial={false}>
                  {side.lines.map((l) => (
                    <motion.li
                      key={l.id}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      transition={{ height: { duration: 0.2, ease: "easeOut" }, opacity: { duration: 0.1 } }}
                    >
                      <motion.div
                        className={`ld-line ${l.tone}`}
                        initial={{ clipPath: "inset(0 100% 0 0)" }}
                        animate={{ clipPath: "inset(0 0% 0 0)" }}
                        transition={{ duration: 0.34, ease: "linear", delay: 0.06 }}
                      >
                        <span className="lbl">{l.label}</span>
                        {l.amount && (
                          <>
                            <span className="dots" aria-hidden="true" />
                            <span className="amt">{l.amount}</span>
                          </>
                        )}
                      </motion.div>
                      {l.stamp && (
                        <motion.span
                          className="ld-stamp small"
                          initial={{ scale: 2.8, opacity: 0, rotate: -26 }}
                          animate={{ scale: 1, opacity: 1, rotate: -9 }}
                          transition={{ type: "spring", stiffness: 560, damping: 20, delay: 0.3 }}
                        >
                          Refused
                        </motion.span>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            </AnimatePresence>
            <AnimatePresence>
              {side.paused && (
                <motion.div
                  key={`paused-${loop}`}
                  className="ld-stamp big"
                  initial={{ scale: 3.2, opacity: 0, rotate: -18 }}
                  animate={{ scale: 1, opacity: 1, rotate: 7 }}
                  exit={{ opacity: 0, y: 140, transition: { duration: 0.5 } }}
                  transition={{ type: "spring", stiffness: 480, damping: 18 }}
                >
                  Paused
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {side.tally && (
          <motion.div
            key={`tally-${loop}`}
            className={`ld-tally ${kind}`}
            initial={{ y: 24, opacity: 0, rotate: kind === "fixed" ? -4 : 4 }}
            animate={{ y: 0, opacity: 1, rotate: kind === "fixed" ? -1.5 : 1.5 }}
            exit={{ y: 24, opacity: 0, transition: { duration: 0.3 } }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <dl>
              {side.tally.rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p>{side.tally.verdict}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
