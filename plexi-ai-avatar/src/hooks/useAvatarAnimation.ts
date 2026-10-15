import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { AvatarState, type AnimationSlot } from "../types/avatar";

/** Name patterns used to discover clips dynamically in any GLB. */
const SLOT_PATTERNS: Record<AnimationSlot, RegExp> = {
  idle: /idle|stand|breath|rest/i,
  talking: /talk|speak|speech|chat/i,
  listening: /listen|attent/i,
  thinking: /think|ponder|consider/i,
  greeting: /greet|wave|hello|welcome/i,
};

const SLOT_FOR_STATE: Record<AvatarState, AnimationSlot> = {
  IDLE: "idle",
  LISTENING: "listening",
  THINKING: "thinking",
  SPEAKING: "talking",
  ERROR: "idle",
  CONNECTING: "idle",
};

export function resolveClips(names: string[]): Partial<Record<AnimationSlot, string>> {
  const out: Partial<Record<AnimationSlot, string>> = {};
  for (const slot of Object.keys(SLOT_PATTERNS) as AnimationSlot[]) {
    const hit = names.find((n) => SLOT_PATTERNS[slot].test(n));
    if (hit) out[slot] = hit;
  }
  // A single unnamed clip is most likely the idle loop.
  if (!out.idle && names.length === 1 && names[0]) out.idle = names[0];
  return out;
}

type ActionMap = Record<string, THREE.AnimationAction | null>;

/**
 * Cross-fades between clips when the avatar state changes.
 * Only reacts to state *changes* (never restarts an action per frame); missing clips fall back to idle.
 */
export function useAvatarAnimation(actions: ActionMap, names: string[], state: AvatarState): { clips: Partial<Record<AnimationSlot, string>> } {
  const clips = useMemo(() => resolveClips(names), [names]);
  const currentRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    const wanted = clips[SLOT_FOR_STATE[state]] ?? clips.idle;
    const next = wanted ? (actions[wanted] ?? null) : null;
    const prev = currentRef.current;
    if (next === prev) return;
    if (next) {
      next.reset().setEffectiveWeight(1).fadeIn(0.35).play();
    }
    prev?.fadeOut(0.35);
    currentRef.current = next;
  }, [actions, clips, state]);

  useEffect(
    () => () => {
      currentRef.current?.stop();
      currentRef.current = null;
    },
    [],
  );

  return { clips };
}
