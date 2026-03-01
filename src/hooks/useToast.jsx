import { useState, useCallback, useEffect } from "react";

export function useToast() {
  const [ts, set] = useState([]);
  const add = useCallback((type, title, msg, dur = 5000) => {
    const id = Date.now() + Math.random();
    set(p => [...p, { id, type, title, msg, dur }]);
  }, []);
  const rm = useCallback(id => set(p => p.filter(t => t.id !== id)), []);
  return {
    toasts: ts, rm,
    toast: {
      error:   (t, m, d) => add("error",   t, m, d),
      success: (t, m, d) => add("success", t, m, d),
      warning: (t, m, d) => add("warning", t, m, d),
      info:    (t, m, d) => add("info",    t, m, d),
    }
  };
}

export function ToastItem({ t, onClose }) {
  const [w, setW] = useState(100);
  useEffect(() => {
    const s = 100 / (t.dur / 50);
    const iv = setInterval(() => setW(x => {
      if (x <= 0) { clearInterval(iv); onClose(); return 0; }
      return x - s;
    }), 50);
    return () => clearInterval(iv);
  }, []);
  const icons = { error:"🔴", success:"✅", warning:"⚠️", info:"💡" };
  const cls   = { error:"terror", success:"tsuccess", warning:"twarning", info:"tinfo" };
  return (
    <div className={`toast ${cls[t.type] || "tinfo"}`}>
      <span style={{ fontSize:13, marginTop:1, flexShrink:0 }}>{icons[t.type] || "💡"}</span>
      <div className="t-body">
        {t.title && <div className="t-title">{t.title}</div>}
        <div className="t-msg">{t.msg}</div>
        <div className="t-bar" style={{ width:`${w}%`, transition:"width 50ms linear" }}/>
      </div>
      <button className="t-x" onClick={onClose}>✕</button>
    </div>
  );
}
