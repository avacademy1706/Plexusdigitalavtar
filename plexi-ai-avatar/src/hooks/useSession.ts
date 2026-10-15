import { useState } from "react";

const KEY = "plexi.session.id";

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Anonymous per-tab session id. No personal data. */
export function useSession(): string {
  const [id] = useState(() => {
    try {
      const existing = sessionStorage.getItem(KEY);
      if (existing) return existing;
      const fresh = makeId();
      sessionStorage.setItem(KEY, fresh);
      return fresh;
    } catch {
      return makeId();
    }
  });
  return id;
}
