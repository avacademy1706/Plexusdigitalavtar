import { useEffect, useMemo, useState } from "react";
import type { QualityPreset, QualitySettings } from "../types/avatar";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export const useReducedMotion = (): boolean => useMediaQuery("(prefers-reduced-motion: reduce)");
export const useIsMobile = (): boolean => useMediaQuery("(max-width: 767px)");

export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

const SETTINGS: Record<QualityPreset, QualitySettings> = {
  HIGH: { dpr: [1, 2], shadows: true, reflections: true, antialias: true },
  MEDIUM: { dpr: [1, 1.5], shadows: true, reflections: false, antialias: true },
  LOW: { dpr: [1, 1], shadows: false, reflections: false, antialias: false },
};

function detectPreset(): QualityPreset {
  const forced = new URLSearchParams(window.location.search).get("quality")?.toUpperCase();
  if (forced === "HIGH" || forced === "MEDIUM" || forced === "LOW") return forced;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  if (coarse) return "LOW";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  return cores <= 4 || mem <= 4 ? "MEDIUM" : "HIGH";
}

/** Quality preset: ?quality=high|medium|low overrides auto-detection. */
export function useQuality(): { preset: QualityPreset; settings: QualitySettings } {
  return useMemo(() => {
    const preset = detectPreset();
    return { preset, settings: SETTINGS[preset] };
  }, []);
}
