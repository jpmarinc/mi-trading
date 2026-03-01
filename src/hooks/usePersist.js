import { useState, useCallback } from "react";

function loadLS(k, d) {
  try { const v = localStorage.getItem(`tfv2_${k}`); return v ? JSON.parse(v) : d; } catch { return d; }
}
function saveLS(k, v) {
  try { localStorage.setItem(`tfv2_${k}`, JSON.stringify(v)); } catch {}
}

export function usePersist(key, def) {
  const [s, set] = useState(() => loadLS(key, def));
  const upd = useCallback(v => {
    set(p => { const n = typeof v === "function" ? v(p) : v; saveLS(key, n); return n; });
  }, [key]);
  return [s, upd];
}
