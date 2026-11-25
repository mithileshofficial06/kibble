"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { StorySide } from "@kibble/sdk";
import type { Shot, Stage } from "./stage";

/*
 * Words over the 3D scene. The elements are ordinary DOM next to the canvas; PinDriver, inside it, only
 * moves them. Objects register where a pin belongs in stage.pins.
 */

const SIDES: StorySide[] = ["fixed", "kibble"];
const TAGGED = new Set<Shot>(["sale", "both", "fixed", "kibble"]);

export function PinDriver({ stage, layer }: { stage: Stage; layer: RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree();
  const v = useRef(new THREE.Vector3());
  useFrame(() => {
    const root = layer.current;
    if (!root) return;
    for (const el of Array.from(root.children) as HTMLElement[]) {
      const id = el.dataset.pin!;
      const at = stage.pins.get(id);
      if (!at) {
        el.style.opacity = "0";
        continue;
      }
      at(v.current);
      v.current.project(camera);
      const x = ((v.current.x + 1) / 2) * size.width;
      const y = ((1 - v.current.y) / 2) * size.height;
      const [side, what] = id.split(":") as [StorySide, string];
      let on = v.current.z < 1 && x > 20 && x < size.width - 20 && y > 10 && y < size.height - 10;
      const s = stage.sides[side];
      if (what === "name") on &&= stage.shot === "both";
      else if (what === "customers" || what === "supplier") on &&= TAGGED.has(stage.shot);
      else if (what === "thief") on &&= stage.thief > 0.5 && (TAGGED.has(stage.shot) || stage.shot === "thief");
      else if (what === "num") {
        on &&= stage.numbers && stage.shot !== "end";
        const stopped = s.state === "Paused";
        set(el.children[0], stopped ? "Locked" : s.can.toFixed(3));
        set(el.children[1], `${side === "kibble" ? "earned limit" : "limit"} ${s.limit.toFixed(3)}`);
        el.classList.toggle("shut", stopped);
      } else if (what === "vault") {
        on &&= stage.numbers && stage.shot !== "end";
        set(el.children[0], s.saved.toFixed(3));
      }
      el.style.opacity = on ? "1" : "0";
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  });
  return null;
}

function set(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

type Say = { k: number; pin: string; text: string; tone: string };

export function PinLayer({ stage, layer }: { stage: Stage; layer: RefObject<HTMLDivElement | null> }) {
  const [says, setSays] = useState<Say[]>([]);
  const n = useRef(0);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = stage.on((c) => {
      if (c.kind !== "say") return;
      const k = ++n.current;
      const pin = `${c.side}:say-${c.who}`;
      timers.add(
        setTimeout(
          () => {
            setSays((s) => [...s.filter((x) => x.pin !== pin), { k, pin, text: c.text, tone: `${c.who} ${c.tone ?? ""}` }]);
            timers.add(setTimeout(() => setSays((s) => s.filter((x) => x.k !== k)), c.ms ?? 1800));
          },
          c.who === "box" ? 420 : 0,
        ),
      );
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, [stage]);
  return (
    <div ref={layer} className="pins">
      {SIDES.flatMap((s) => [
        <span key={`${s}n`} data-pin={`${s}:name`} className={`t3-tag big ${s}`}>
          {s === "kibble" ? "Kibble" : "Fixed limit"}
        </span>,
        <span key={`${s}c`} data-pin={`${s}:customers`} className="t3-tag">
          Customers
        </span>,
        <span key={`${s}s`} data-pin={`${s}:supplier`} className="t3-tag">
          Supplier
        </span>,
        <span key={`${s}t`} data-pin={`${s}:thief`} className="t3-tag danger">
          Thief, with the key
        </span>,
        <div key={`${s}b`} data-pin={`${s}:num`} className={`t3-num ${s}`}>
          <b>0.000</b>
          <span>limit</span>
        </div>,
      ])}
      <div data-pin="kibble:vault" className="t3-num vault">
        <b>0.000</b>
        <span>owner&apos;s vault</span>
      </div>
      {says.map((x) => (
        <span key={x.pin} data-pin={x.pin}>
          <span key={x.k} className={`t3-say ${x.tone}`}>
            {x.text}
          </span>
        </span>
      ))}
    </div>
  );
}
