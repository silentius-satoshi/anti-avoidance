import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────
//  7-Day Anti-Avoidance Challenge — a SUDS log for NPTE study
//  Before = dread before you start. After = where it landed.
//  The app plots the gap. Knowledge of Results, not Performance.
// ─────────────────────────────────────────────────────────────

const STORE_KEY = "antiavoidance:v1";
const ROUND_LEN = 7;
const INITIAL = { entries: [], inProgress: null, round: 1, restTimer: null };

// Storage adapter — same file works in three places:
//   • inside a Claude artifact -> Claude's window.storage
//   • your own site / Vercel / local dev -> browser localStorage
//   • neither available -> in-memory only (data clears on reload)
const store = {
  async get(key) {
    try {
      if (typeof window !== "undefined" && window.storage && window.storage.get) {
        return await window.storage.get(key);
      }
      if (typeof localStorage !== "undefined") {
        const v = localStorage.getItem(key);
        return v == null ? null : { value: v };
      }
    } catch (e) { /* fall through to in-memory */ }
    return null;
  },
  async set(key, value) {
    try {
      if (typeof window !== "undefined" && window.storage && window.storage.set) {
        return await window.storage.set(key, value);
      }
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    } catch (e) { /* in-memory only */ }
  },
};

const ACTIONS = [
  { id: "q10",         label: "10 practice questions",          hint: "Bank-sourced. Weak domains first." },
  { id: "topic20",     label: "20 minutes of one topic",        hint: "Pick a system below.", hasTopic: true },
  { id: "rationales5", label: "Review 5 missed rationales",      hint: "From your why-I-got-it-wrong log." },
  { id: "teach5",      label: "Teach one concept out loud",      hint: "5 minutes, no notes." },
  { id: "log",         label: "Update “why I got it wrong” log", hint: "One honest entry." },
];

const TOPICS = [
  { id: "neuro",        label: "Neuromuscular",   priority: true },
  { id: "interventions",label: "Interventions",   priority: true },
  { id: "research",     label: "Research & EBP",  priority: true },
  { id: "cardiopulm",   label: "Cardiopulmonary", priority: true },
  { id: "msk",          label: "Musculoskeletal", priority: false },
  { id: "integ",        label: "Integumentary",   priority: false },
  { id: "other",        label: "Other",           priority: false },
];

const C = {
  bg: "#080d18",
  surface: "rgba(255,255,255,0.035)",
  surfaceHi: "rgba(255,255,255,0.065)",
  border: "rgba(255,255,255,0.09)",
  ink: "#f0e8d8",
  ink2: "#d8d0c0",
  mut: "#8a9aaa",
  mut2: "#5a7488",
  mut3: "#3a5a7a",
  teal: "#3fae87",
  tealSoft: "#5e9e8a",
  green: "#2ba866",
  coral: "#e0653b",
  coralDeep: "#c44a2a",
  amber: "#e8a030",
};

// helpers
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const actionLabel = (id) => (ACTIONS.find((a) => a.id === id) || {}).label || id;
const topicLabel = (id) => (TOPICS.find((t) => t.id === id) || {}).label || "";
const sudsColor = (v) => (v <= 3 ? C.teal : v <= 6 ? C.amber : C.coral);
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const shortDate = (iso) => { const d = new Date(iso); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
const defaultTimerSec = (action) => (action === "teach5" ? 5 * 60 : action === "topic20" ? 20 * 60 : 25 * 60);
const clockMMSS = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const TIMER_PRESETS = [5, 15, 20, 25];

function playBeep(ac) {
  const t0 = ac.currentTime;
  [[660, 0], [880, 0.18]].forEach(([f, dt]) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.value = f;
    o.connect(g); g.connect(ac.destination);
    const s = t0 + dt;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.18, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.32);
    o.start(s); o.stop(s + 0.34);
  });
}

function playBreakBeep(ac) {
  const t0 = ac.currentTime;
  [[523, 0], [392, 0.22]].forEach(([f, dt]) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.value = f;
    o.connect(g); g.connect(ac.destination);
    const s = t0 + dt;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.13, s + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.36);
    o.start(s); o.stop(s + 0.38);
  });
}

function computeStreak(entries) {
  if (!entries.length) return 0;
  const days = new Set(entries.map((e) => dayKey(e.finishedAt)));
  const has = (d) => days.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  let d = new Date();
  if (!has(d)) { d.setDate(d.getDate() - 1); if (!has(d)) return 0; }
  let s = 0;
  while (has(d)) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

// ── SUDS slider ───────────────────────────────────────────────
function Suds({ value, onChange, caption }) {
  const col = sudsColor(value);
  return (
    <div style={{ marginTop: "0.4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
        <span style={{ fontSize: "0.82rem", color: C.mut }}>{caption}</span>
        <span style={{ fontSize: "2rem", fontWeight: 400, color: col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <input
        className="aa-range"
        type="range" min={0} max={10} step={1} value={value}
        aria-label={caption}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: "linear-gradient(90deg,#3fae87 0%,#e8a030 52%,#e0653b 100%)" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.35rem", fontSize: "0.62rem", color: C.mut3, letterSpacing: "0.04em" }}>
        <span>0 · calm</span><span>5 · moderate</span><span>10 · max</span>
      </div>
    </div>
  );
}

// ── The signature: the drop chart ─────────────────────────────
function DropChart({ roundEntries, inProgress, round }) {
  const STEP = 80, MARGIN = 40, H = 240, top = 24, bot = 204, plotH = bot - top;
  const W = MARGIN * 2 + (ROUND_LEN - 1) * STEP;
  const colX = (i) => MARGIN + i * STEP;
  const yOf = (v) => bot - (v / 10) * plotH;
  const live = inProgress && inProgress.round === round ? inProgress : null;
  const liveIdx = roundEntries.length;

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        <defs>
          <linearGradient id="aaDrop" x1="0" y1={top} x2="0" y2={bot} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={C.coral} />
            <stop offset="0.5" stopColor={C.amber} />
            <stop offset="1" stopColor={C.teal} />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {[0, 5, 10].map((g) => (
          <g key={g}>
            <line x1={28} y1={yOf(g)} x2={W - 16} y2={yOf(g)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={18} y={yOf(g) + 4} fontSize="11" fill={C.mut3} textAnchor="middle" fontFamily="Georgia, serif">{g}</text>
          </g>
        ))}

        {/* completed drops */}
        {roundEntries.map((e, i) => {
          const x = colX(i), yB = yOf(e.before), yA = yOf(e.after);
          const dropped = e.before - e.after;
          return (
            <g key={e.id} className="aa-fade">
              <line x1={x} y1={top - 2} x2={x} y2={bot + 2} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
              <line x1={x} y1={yB} x2={x} y2={yA} stroke="url(#aaDrop)" strokeWidth={4} strokeLinecap="round" />
              <circle cx={x} cy={yB} r={6} fill={C.coral} />
              <circle cx={x} cy={yA} r={6} fill={C.teal} stroke={C.bg} strokeWidth={2} />
              {dropped > 0 && (
                <text x={x} y={yA + 20} fontSize="11" fill={C.tealSoft} textAnchor="middle" fontFamily="Georgia, serif">{"−" + dropped}</text>
              )}
              <text x={x} y={H - 6} fontSize="11" fill={C.mut2} textAnchor="middle" fontFamily="Georgia, serif">{i + 1}</text>
            </g>
          );
        })}

        {/* live (in-progress) column */}
        {live && liveIdx < ROUND_LEN && (
          <g>
            <line x1={colX(liveIdx)} y1={top - 2} x2={colX(liveIdx)} y2={bot + 2} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            <line x1={colX(liveIdx)} y1={yOf(live.before)} x2={colX(liveIdx)} y2={bot} stroke={C.coral} strokeWidth={2} strokeDasharray="3 5" opacity={0.55} />
            <circle className="aa-pulse" cx={colX(liveIdx)} cy={yOf(live.before)} r={7} fill="none" stroke={C.coral} strokeWidth={2} />
            <circle cx={colX(liveIdx)} cy={yOf(live.before)} r={5} fill={C.coral} />
            <text x={colX(liveIdx)} y={H - 6} fontSize="11" fill={C.coral} textAnchor="middle" fontFamily="Georgia, serif">{liveIdx + 1}</text>
          </g>
        )}

        {/* empty future slots */}
        {Array.from({ length: ROUND_LEN }).map((_, i) => {
          const used = i < roundEntries.length || (live && i === liveIdx);
          if (used) return null;
          return (
            <g key={"e" + i}>
              <circle cx={colX(i)} cy={bot} r={3} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={1} />
              <text x={colX(i)} y={H - 6} fontSize="11" fill={C.mut3} textAnchor="middle" fontFamily="Georgia, serif">{i + 1}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: "1.2rem", marginTop: "0.4rem", fontSize: "0.66rem", color: C.mut2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.coral, display: "inline-block" }} />before</span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.teal, display: "inline-block" }} />after</span>
      </div>
    </div>
  );
}

// ── Pomodoro focus timer (presentational; parent owns state + persistence) ──
function Pomodoro({
  duration, remaining, running, done,
  onPreset, onStart, onPause, onReset,
  accent = C.teal, accentSoft = C.tealSoft,
  accentRGBA = "rgba(63,174,135,0.14)", accentRGBA2 = "rgba(63,174,135,0.1)",
  presets = TIMER_PRESETS, title = "Focus timer",
  micro = { ready: "ready", running: "focusing", paused: "paused", done: "time's up" },
  doneMsg = "Block done. Land the dread below, or run another.",
  readyLabel = "Start focus", doneLabel = "Reset", onDoneClick = null,
  onExit = null, exitLabel = "Skip",
}) {
  const fresh = remaining === duration;
  const frac = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
  const R = 56, STROKE = 7, CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - frac);
  const lowOn = remaining <= 60 && remaining > 0;
  const ring = done ? accent : lowOn ? C.amber : running ? accent : accentSoft;
  const numCol = done ? accent : lowOn ? C.amber : C.ink;
  const primaryLabel = running ? "Pause" : fresh ? readyLabel : "Resume";

  return (
    <div style={{ background: "rgba(0,0,0,0.22)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.1rem 1rem 1.2rem", marginBottom: "1.3rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem" }}>
        <span style={{ fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.mut2 }}>{title}</span>
        <div style={{ display: "flex", gap: "0.3rem" }}>
          {presets.map((m) => {
            const on = duration === m * 60;
            return (
              <button key={m} className="aa-tap" onClick={() => onPreset(m * 60)} disabled={running}
                style={{ border: `1px solid ${on ? accent : C.border}`, background: on ? accentRGBA : "transparent", color: running ? C.mut3 : on ? accent : C.mut, borderRadius: 14, padding: "0.18rem 0.5rem", fontSize: "0.66rem", fontFamily: "inherit", cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1 }}>
                {m}m
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1.1rem" }}>
        <div style={{ position: "relative", width: 132, height: 132, flexShrink: 0 }}>
          <svg viewBox="0 0 132 132" width="132" height="132">
            <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} />
            <circle cx="66" cy="66" r={R} fill="none" stroke={ring} strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset} transform="rotate(-90 66 66)"
              style={{ transition: "stroke-dashoffset 0.35s linear, stroke 0.3s" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: "1.85rem", color: numCol, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>{clockMMSS(remaining)}</div>
            <div style={{ fontSize: "0.6rem", color: C.mut2, marginTop: "0.25rem" }}>{done ? micro.done : running ? micro.running : fresh ? micro.ready : micro.paused}</div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
          {done ? (
            <>
              <div style={{ fontSize: "0.8rem", color: accentSoft, lineHeight: 1.5 }}>{doneMsg}</div>
              <button className="aa-tap" onClick={onDoneClick || onReset}
                style={{ border: `1px solid ${accent}`, background: accentRGBA2, color: accent, borderRadius: 9, padding: "0.6rem", fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer" }}>
                {doneLabel}
              </button>
            </>
          ) : (
            <>
              <button className="aa-tap" onClick={running ? onPause : onStart}
                style={{ border: "none", background: running ? "rgba(255,255,255,0.08)" : accent, color: running ? C.ink : "#06210f", borderRadius: 9, padding: "0.7rem", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer" }}>
                {primaryLabel}
              </button>
              {!fresh && (
                <button className="aa-tap" onClick={onReset}
                  style={{ background: "none", border: `1px solid ${C.border}`, color: C.mut, borderRadius: 9, padding: "0.5rem", fontFamily: "inherit", fontSize: "0.76rem", cursor: "pointer" }}>
                  Reset
                </button>
              )}
              {onExit && (
                <button className="aa-tap" onClick={onExit}
                  style={{ background: "none", border: "none", color: C.mut3, borderRadius: 9, padding: "0.3rem", fontFamily: "inherit", fontSize: "0.74rem", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
                  {exitLabel}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────
export default function AntiAvoidance() {
  const [data, setData] = useState(INITIAL);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("today");

  // start-flow transient state
  const [pickAction, setPickAction] = useState(null);
  const [pickTopic, setPickTopic] = useState(null);
  const [beforeVal, setBeforeVal] = useState(5);
  const [startNote, setStartNote] = useState("");
  const [dreadLocked, setDreadLocked] = useState(false);

  // finish-flow transient state
  const [afterVal, setAfterVal] = useState(3);
  const [finishNote, setFinishNote] = useState("");
  const [justFinished, setJustFinished] = useState(null);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const fileInputRef = useRef(null);

  // timer state
  const [nowTs, setNowTs] = useState(Date.now());
  const audioRef = useRef(null);

  // load
  useEffect(() => {
    (async () => {
      try {
        const r = await store.get(STORE_KEY);
        if (r && r.value) setData(JSON.parse(r.value));
      } catch (e) { /* fresh start */ }
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { await store.set(STORE_KEY, JSON.stringify(next)); } catch (e) { /* in-memory still works */ }
  }, []);

  // fire once when a running timer reaches zero
  const completeTimer = useCallback(() => {
    let snapshot = null;
    setData((d) => {
      if (!d.inProgress || !d.inProgress.timerEndsAt) return d;
      snapshot = { ...d, inProgress: { ...d.inProgress, timerEndsAt: null, timerLeft: 0 } };
      return snapshot;
    });
    if (snapshot) { try { store.set(STORE_KEY, JSON.stringify(snapshot)); } catch (e) { /* in-memory only */ } }
    try { if (audioRef.current) playBeep(audioRef.current); } catch (e) { /* noop */ }
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { /* noop */ }
  }, []);

  // wall-clock tick: only runs while a timer is active; survives screen-lock
  const runningEndsAt = data.inProgress ? data.inProgress.timerEndsAt : null;
  useEffect(() => {
    if (!runningEndsAt) return;
    setNowTs(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      setNowTs(t);
      if (t >= runningEndsAt) { clearInterval(id); completeTimer(); }
    }, 250);
    return () => clearInterval(id);
  }, [runningEndsAt, completeTimer]);

  // break timer completion + tick (same engine, separate field)
  const completeBreak = useCallback(() => {
    let snapshot = null;
    setData((d) => {
      if (!d.restTimer || !d.restTimer.endsAt) return d;
      snapshot = { ...d, restTimer: { ...d.restTimer, endsAt: null, left: 0 } };
      return snapshot;
    });
    if (snapshot) { try { store.set(STORE_KEY, JSON.stringify(snapshot)); } catch (e) { /* in-memory only */ } }
    try { if (audioRef.current) playBreakBeep(audioRef.current); } catch (e) { /* noop */ }
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { /* noop */ }
  }, []);

  const breakEndsAt = data.restTimer ? data.restTimer.endsAt : null;
  useEffect(() => {
    if (!breakEndsAt) return;
    setNowTs(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      setNowTs(t);
      if (t >= breakEndsAt) { clearInterval(id); completeBreak(); }
    }, 250);
    return () => clearInterval(id);
  }, [breakEndsAt, completeBreak]);

  // recompute immediately when returning to the tab
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") setNowTs(Date.now()); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const ensureAudio = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current) audioRef.current = new Ctx();
      if (audioRef.current.state === "suspended") audioRef.current.resume();
    } catch (e) { /* noop */ }
  };

  // derived
  const roundEntries = data.entries.filter((e) => e.round === data.round);
  const roundDone = roundEntries.length;
  const roundComplete = roundDone >= ROUND_LEN && !data.inProgress;
  const all = data.entries;
  const avgB = mean(all.map((e) => e.before));
  const avgA = mean(all.map((e) => e.after));
  const avgGap = avgB - avgA;
  const streak = computeStreak(all);

  // cross-round trend: avg gap (before - after) per round, oldest -> newest
  const roundStats = (() => {
    const m = new Map();
    for (const e of all) {
      if (!m.has(e.round)) m.set(e.round, { b: [], a: [] });
      const r = m.get(e.round); r.b.push(e.before); r.a.push(e.after);
    }
    return [...m.entries()].sort((x, y) => x[0] - y[0]).map(([round, r]) => ({ round, n: r.b.length, gap: mean(r.b) - mean(r.a) }));
  })();
  const maxRoundGap = Math.max(1, ...roundStats.map((r) => r.gap));

  // hit-rate: how often the dread overshot the reality (all time)
  const overN = all.filter((e) => e.before > e.after).length;

  // derived timer
  const ip = data.inProgress;
  const tDur = ip ? (ip.timerDuration != null ? ip.timerDuration : defaultTimerSec(ip.action)) : 0;
  const tStoredLeft = ip ? (ip.timerLeft != null ? ip.timerLeft : tDur) : 0;
  const tEndsAt = ip ? ip.timerEndsAt : null;
  const tRemaining = tEndsAt ? Math.max(0, Math.round((tEndsAt - nowTs) / 1000)) : tStoredLeft;
  const tRunning = !!tEndsAt && tRemaining > 0;
  const tDone = !!ip && tDur > 0 && tRemaining === 0;

  // derived break timer
  const rt = data.restTimer;
  const bDur = rt ? (rt.duration != null ? rt.duration : 300) : 0;
  const bStoredLeft = rt ? (rt.left != null ? rt.left : bDur) : 0;
  const bEndsAt = rt ? rt.endsAt : null;
  const bRemaining = bEndsAt ? Math.max(0, Math.round((bEndsAt - nowTs) / 1000)) : bStoredLeft;
  const bRunning = !!bEndsAt && bRemaining > 0;
  const bDone = !!rt && bDur > 0 && bRemaining === 0;

  // handlers
  const startSession = () => {
    if (!pickAction) return;
    const dur = defaultTimerSec(pickAction);
    const entry = {
      id: Date.now(),
      action: pickAction,
      topic: pickAction === "topic20" ? pickTopic : null,
      before: beforeVal,
      startNote: startNote.trim(),
      startedAt: new Date().toISOString(),
      round: data.round,
      timerDuration: dur,
      timerLeft: dur,
      timerEndsAt: null,
    };
    persist({ ...data, inProgress: entry, restTimer: null });
    setPickAction(null); setPickTopic(null); setBeforeVal(5); setStartNote(""); setDreadLocked(false);
    setAfterVal(3); setFinishNote("");
  };

  // timer controls (all wall-clock; persisted on each action, never per-tick)
  const timerPreset = (sec) => {
    if (!data.inProgress) return;
    persist({ ...data, inProgress: { ...data.inProgress, timerDuration: sec, timerLeft: sec, timerEndsAt: null } });
  };
  const timerStart = () => {
    if (!data.inProgress) return;
    ensureAudio();
    const dur = data.inProgress.timerDuration != null ? data.inProgress.timerDuration : defaultTimerSec(data.inProgress.action);
    const stored = data.inProgress.timerLeft != null ? data.inProgress.timerLeft : dur;
    const left = stored > 0 ? stored : dur;
    persist({ ...data, inProgress: { ...data.inProgress, timerDuration: dur, timerLeft: left, timerEndsAt: Date.now() + left * 1000 } });
  };
  const timerPause = () => {
    const p = data.inProgress;
    if (!p || !p.timerEndsAt) return;
    const rem = Math.max(0, Math.round((p.timerEndsAt - Date.now()) / 1000));
    persist({ ...data, inProgress: { ...p, timerEndsAt: null, timerLeft: rem } });
  };
  const timerReset = () => {
    const p = data.inProgress;
    if (!p) return;
    const dur = p.timerDuration != null ? p.timerDuration : defaultTimerSec(p.action);
    persist({ ...data, inProgress: { ...p, timerLeft: dur, timerEndsAt: null } });
  };
  const timerFinish = () => {
    if (!data.inProgress) return;
    persist({ ...data, inProgress: { ...data.inProgress, timerEndsAt: null, timerLeft: 0 } });
  };

  // break controls (rate-first: only offered after the session is logged)
  const offerBreak = () => {
    setJustFinished(null);
    persist({ ...data, restTimer: { duration: 300, left: 300, endsAt: null } });
  };
  const breakPreset = (sec) => {
    if (!data.restTimer) return;
    persist({ ...data, restTimer: { duration: sec, left: sec, endsAt: null } });
  };
  const breakStart = () => {
    if (!data.restTimer) return;
    ensureAudio();
    const dur = data.restTimer.duration != null ? data.restTimer.duration : 300;
    const stored = data.restTimer.left != null ? data.restTimer.left : dur;
    const left = stored > 0 ? stored : dur;
    persist({ ...data, restTimer: { duration: dur, left, endsAt: Date.now() + left * 1000 } });
  };
  const breakPause = () => {
    const r = data.restTimer;
    if (!r || !r.endsAt) return;
    const rem = Math.max(0, Math.round((r.endsAt - Date.now()) / 1000));
    persist({ ...data, restTimer: { ...r, endsAt: null, left: rem } });
  };
  const breakReset = () => {
    const r = data.restTimer;
    if (!r) return;
    const dur = r.duration != null ? r.duration : 300;
    persist({ ...data, restTimer: { duration: dur, left: dur, endsAt: null } });
  };
  const breakDismiss = () => persist({ ...data, restTimer: null });

  const backToPicker = () => {
    const ip = data.inProgress;
    if (!ip) return;
    setBeforeVal(ip.before);
    setPickAction(ip.action);
    setPickTopic(ip.topic || null);
    setDreadLocked(true);
    persist({ ...data, inProgress: null });
  };

  const finishSession = () => {
    const e = { ...data.inProgress, after: afterVal, finishNote: finishNote.trim(), finishedAt: new Date().toISOString() };
    persist({ ...data, entries: [...data.entries, e], inProgress: null });
    setJustFinished(e);
    setAfterVal(3); setFinishNote("");
  };

  const newRound = () => { persist({ ...data, round: data.round + 1, restTimer: null }); setJustFinished(null); setTab("today"); };
  const deleteEntry = (id) => { persist({ ...data, entries: data.entries.filter((e) => e.id !== id) }); setPendingDelete(null); };
  const resetAll = () => { persist(INITIAL); setConfirmReset(false); setJustFinished(null); setTab("today"); };

  // backup: export downloads the full dataset; import restores it (replace, with confirm)
  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anti-avoidance-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setImportMsg(null);
    } catch (e) { setImportMsg("Export didn't work here — try it in the deployed app."); }
  };
  const importPick = () => { setImportMsg(null); setPendingImport(null); if (fileInputRef.current) fileInputRef.current.click(); };
  const onImportFile = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.entries)) throw new Error("shape");
      setPendingImport({
        entries: parsed.entries,
        inProgress: parsed.inProgress != null ? parsed.inProgress : null,
        round: typeof parsed.round === "number" ? parsed.round : 1,
        restTimer: parsed.restTimer != null ? parsed.restTimer : null,
      });
      setImportMsg(null);
    } catch (e) { setPendingImport(null); setImportMsg("That file isn't a valid backup."); }
  };
  const confirmImport = () => { if (pendingImport) { persist(pendingImport); setPendingImport(null); setImportMsg("Backup restored."); } };

  // shared styles
  const shell = { minHeight: "100vh", background: C.bg, fontFamily: "Georgia, 'Times New Roman', serif", color: C.ink, display: "flex", justifyContent: "center", padding: "calc(1.1rem + env(safe-area-inset-top)) calc(0.9rem + env(safe-area-inset-right)) calc(3rem + env(safe-area-inset-bottom)) calc(0.9rem + env(safe-area-inset-left))" };
  const wrap = { width: "100%", maxWidth: 540 };
  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "1.25rem" };
  const primaryBtn = { width: "100%", border: "none", borderRadius: 10, padding: "0.95rem", color: "#06210f", fontFamily: "inherit", fontSize: "0.98rem", fontWeight: 700, cursor: "pointer", background: C.teal, letterSpacing: "0.01em" };
  const ghostBtn = { width: "100%", background: "none", border: `1px solid ${C.mut3}`, borderRadius: 10, padding: "0.8rem", color: C.mut, fontFamily: "inherit", fontSize: "0.86rem", cursor: "pointer" };

  if (!loaded) {
    return <div style={{ ...shell, alignItems: "center" }}><div style={{ color: C.mut2, fontSize: "0.9rem" }}>Loading…</div></div>;
  }

  return (
    <div style={shell}>
      <style>{`
        .aa-range{-webkit-appearance:none;appearance:none;width:100%;height:12px;border-radius:7px;outline:none;cursor:pointer;}
        .aa-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:30px;height:30px;border-radius:50%;background:#f0e8d8;border:4px solid #080d18;box-shadow:0 0 0 1px rgba(255,255,255,0.25),0 2px 6px rgba(0,0,0,0.55);cursor:pointer;margin-top:-9px;}
        .aa-range::-moz-range-thumb{width:30px;height:30px;border-radius:50%;background:#f0e8d8;border:4px solid #080d18;box-shadow:0 0 0 1px rgba(255,255,255,0.25);cursor:pointer;}
        .aa-tap:focus-visible{outline:2px solid #3fae87;outline-offset:2px;}
        /* iOS PWA fit: tap flash, callout, input zoom, overscroll bounce */
        html{-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;}
        html,body{overscroll-behavior:none;}
        .aa-tap{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation;}
        input,textarea,select{font-size:16px !important;}
        @keyframes aaFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .aa-fade{animation:aaFade .3s ease;}
        @keyframes aaPulse{0%{r:7;opacity:.9}70%{r:13;opacity:0}100%{opacity:0}}
        .aa-pulse{animation:aaPulse 1.8s ease-out infinite;}
        @media (prefers-reduced-motion: reduce){.aa-fade{animation:none}.aa-pulse{animation:none}}
      `}</style>

      <div style={wrap}>
        {/* header */}
        <div style={{ marginBottom: "1.1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: "1.5rem", letterSpacing: "0.01em", color: C.ink }}>Anti-Avoidance</div>
              <div style={{ fontSize: "0.78rem", color: C.mut2, marginTop: "0.15rem" }}>One small action a day. Watch the dread shrink.</div>
            </div>
            <div style={{ textAlign: "right", fontSize: "0.72rem", color: C.mut2 }}>
              <div style={{ color: C.amber, fontSize: "0.95rem" }}>Round {data.round}</div>
              <div>{roundDone}/{ROUND_LEN} days</div>
            </div>
          </div>
          {/* dots */}
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.9rem" }}>
            {Array.from({ length: ROUND_LEN }).map((_, i) => {
              const filled = i < roundDone;
              const live = data.inProgress && i === roundDone;
              return (
                <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: filled ? C.teal : live ? "transparent" : "rgba(255,255,255,0.08)", border: live ? `1px solid ${C.coral}` : "none", boxShadow: live ? `0 0 6px ${C.coral}66` : "none" }} />
              );
            })}
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.1rem" }}>
          {[["today", "Today"], ["progress", "Progress"]].map(([id, label]) => (
            <button key={id} className="aa-tap" onClick={() => setTab(id)}
              style={{ flex: 1, padding: "0.6rem", borderRadius: 9, fontFamily: "inherit", fontSize: "0.85rem", cursor: "pointer", border: `1px solid ${tab === id ? C.teal : C.border}`, background: tab === id ? "rgba(63,174,135,0.12)" : "transparent", color: tab === id ? C.teal : C.mut }}>
              {label}
            </button>
          ))}
        </div>

        {/* ───── TODAY ───── */}
        {tab === "today" && (
          <>
            {/* break timer (rate-first: shown after a session is logged) */}
            {data.restTimer && (
              <div className="aa-fade">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.9rem" }}>
                  <span style={{ fontSize: "1.05rem", color: C.ink }}>Break</span>
                  <span style={{ fontSize: "0.72rem", color: C.mut2 }}>Step away. The data's already in.</span>
                </div>
                <Pomodoro
                  duration={bDur} remaining={bRemaining} running={bRunning} done={bDone}
                  onPreset={breakPreset} onStart={breakStart} onPause={breakPause} onReset={breakReset}
                  accent="#6f8fc0" accentSoft="#9fb2d6"
                  accentRGBA="rgba(111,143,192,0.16)" accentRGBA2="rgba(111,143,192,0.12)"
                  presets={[5, 10, 15]} title="Break"
                  micro={{ ready: "ready", running: "resting", paused: "paused", done: "break's over" }}
                  doneMsg="Break's over. Pick up the next block when you're ready."
                  readyLabel="Start break" doneLabel="Back to study" onDoneClick={breakDismiss}
                  onExit={breakDismiss} exitLabel="Skip break"
                />
              </div>
            )}

            {/* reveal after finishing */}
            {!data.restTimer && justFinished && (() => {
              const e = justFinished;
              const drop = e.before - e.after;
              const finRoundCount = data.entries.filter((x) => x.round === e.round).length;
              const completed = finRoundCount >= ROUND_LEN;
              return (
                <div style={{ ...card, textAlign: "center" }} className="aa-fade">
                  <div style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.mut2, marginBottom: "1.2rem" }}>Logged</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.1rem", marginBottom: "0.6rem" }}>
                    <div><div style={{ fontSize: "2.6rem", color: C.coral, lineHeight: 1 }}>{e.before}</div><div style={{ fontSize: "0.66rem", color: C.mut2, marginTop: "0.25rem" }}>before</div></div>
                    <div style={{ fontSize: "1.6rem", color: C.mut3 }}>{"→"}</div>
                    <div><div style={{ fontSize: "2.6rem", color: C.teal, lineHeight: 1 }}>{e.after}</div><div style={{ fontSize: "0.66rem", color: C.mut2, marginTop: "0.25rem" }}>after</div></div>
                  </div>
                  <div style={{ fontSize: "0.9rem", color: drop > 0 ? C.tealSoft : C.mut, marginBottom: "1.3rem" }}>
                    {drop > 0 ? `The dread overshot by ${drop}.` : drop === 0 ? "Held steady." : `It rose by ${Math.abs(drop)} — noted, no judgment.`}
                  </div>
                  {completed ? (
                    <div className="aa-fade">
                      <div style={{ background: "rgba(232,160,48,0.1)", border: `1px solid ${C.amber}40`, borderRadius: 10, padding: "0.9rem", marginBottom: "1rem" }}>
                        <div style={{ color: C.amber, fontSize: "1.05rem", marginBottom: "0.2rem" }}>Round {e.round} complete</div>
                        <div style={{ fontSize: "0.78rem", color: C.mut }}>7 actions, 7 data points. That's the whole streak.</div>
                      </div>
                      <button className="aa-tap" style={primaryBtn} onClick={newRound}>Start round {e.round + 1}</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      <button className="aa-tap" style={{ ...ghostBtn, border: `1px solid #6f8fc0`, color: "#9fb2d6" }} onClick={offerBreak}>Take a break</button>
                      <button className="aa-tap" style={ghostBtn} onClick={() => setJustFinished(null)}>Done for today</button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* finish in-progress */}
            {!data.restTimer && !justFinished && data.inProgress && (
              <div style={card} className="aa-fade">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
                  <div style={{ fontSize: "0.68rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.coral }}>In progress</div>
                  {!tDone && (
                    <button className="aa-tap" onClick={backToPicker}
                      style={{ background: "none", border: "none", color: C.mut3, fontFamily: "inherit", fontSize: "0.72rem", cursor: "pointer", padding: 0 }}>
                      &larr; change action
                    </button>
                  )}
                </div>
                <div style={{ fontSize: "1.12rem", color: C.ink, marginBottom: "0.2rem" }}>{actionLabel(data.inProgress.action)}</div>
                {data.inProgress.topic && <div style={{ fontSize: "0.82rem", color: C.tealSoft, marginBottom: "0.3rem" }}>{topicLabel(data.inProgress.topic)}</div>}
                <div style={{ fontSize: "0.78rem", color: C.mut2, marginBottom: "1.3rem" }}>You logged the dread at <span style={{ color: C.coral }}>{data.inProgress.before}</span>. Do the thing, then land it.</div>
                <Pomodoro
                  duration={tDur} remaining={tRemaining} running={tRunning} done={tDone}
                  onPreset={timerPreset} onStart={timerStart} onPause={timerPause} onReset={timerReset}
                  onExit={timerFinish} exitLabel="I'm done — rate now"
                />
                {tDone && (
                  <>
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "1.2rem" }}>
                      <Suds value={afterVal} onChange={setAfterVal} caption="Done. Where did it actually land?" />
                    </div>
                    <input value={finishNote} onChange={(e) => setFinishNote(e.target.value)} placeholder="What you did (optional)"
                      style={{ width: "100%", boxSizing: "border-box", marginTop: "1.1rem", background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}`, borderRadius: 9, padding: "0.7rem 0.85rem", color: C.ink, fontFamily: "inherit", fontSize: "0.85rem" }} />
                    <button className="aa-tap" style={{ ...primaryBtn, marginTop: "1.1rem" }} onClick={finishSession}>Log the drop</button>
                  </>
                )}
              </div>
            )}

            {/* round complete (no pending reveal) */}
            {!data.restTimer && !justFinished && !data.inProgress && roundComplete && (
              <div style={{ ...card, textAlign: "center" }}>
                <div style={{ fontSize: "2.4rem", color: C.amber, lineHeight: 1, marginBottom: "0.5rem" }}>7 / 7</div>
                <div style={{ fontSize: "1.05rem", color: C.ink, marginBottom: "0.3rem" }}>Round {data.round} complete</div>
                <div style={{ fontSize: "0.82rem", color: C.mut, marginBottom: "1.4rem" }}>You showed up every day. The Progress tab has the receipts.</div>
                <button className="aa-tap" style={primaryBtn} onClick={newRound}>Start round {data.round + 1}</button>
              </div>
            )}

            {/* start a session */}
            {!data.restTimer && !justFinished && !data.inProgress && !roundComplete && (
              <div style={card} className="aa-fade">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.9rem" }}>
                  <span style={{ fontSize: "0.95rem", color: C.ink }}>Day {roundDone + 1} of {ROUND_LEN}</span>
                  <span style={{ fontSize: "0.72rem", color: C.mut2 }}>{new Date().toLocaleDateString(undefined, { weekday: "long" })}</span>
                </div>

                {!dreadLocked ? (
                  <div className="aa-fade">
                    {/* the record — confront the belief before committing */}
                    <div style={{ textAlign: "center", padding: "0.3rem 0 1.4rem" }}>
                      {all.length >= 4 ? (
                        <div style={{ fontSize: "0.92rem", color: C.mut, lineHeight: 1.65 }}>
                          You've sat down to this <span style={{ color: C.ink }}>{all.length}</span> times. It was worse in your head than in reality <span style={{ color: C.teal }}>{overN}</span> of them.
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.85rem", color: C.mut2, lineHeight: 1.65 }}>
                          The dread before you start is almost always louder than where it lands. Log it now, then test it.
                        </div>
                      )}
                    </div>

                    <Suds value={beforeVal} onChange={setBeforeVal} caption="Before anything else — how much were you dreading this today?" />

                    <button className="aa-tap" style={{ ...primaryBtn, marginTop: "1.3rem" }} onClick={() => setDreadLocked(true)}>
                      Logged &mdash; what's the move?
                    </button>
                  </div>
                ) : (
                  <div className="aa-fade">
                    <div style={{ fontSize: "0.72rem", color: C.mut2, marginBottom: "1.1rem" }}>Dread logged at <span style={{ color: C.coral }}>{beforeVal}</span>. Now the smallest next step.</div>

                    <div style={{ fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.mut2, marginBottom: "0.6rem" }}>Pick today's move</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {ACTIONS.map((a) => {
                        const on = pickAction === a.id;
                        return (
                          <button key={a.id} className="aa-tap" onClick={() => { setPickAction(a.id); if (a.id !== "topic20") setPickTopic(null); }}
                            style={{ textAlign: "left", border: `1px solid ${on ? C.teal : C.border}`, background: on ? "rgba(63,174,135,0.1)" : "rgba(255,255,255,0.02)", borderRadius: 10, padding: "0.75rem 0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
                            <div style={{ fontSize: "0.9rem", color: on ? C.ink : C.ink2 }}>{a.label}</div>
                            <div style={{ fontSize: "0.72rem", color: on ? C.tealSoft : C.mut2, marginTop: "0.15rem" }}>{a.hint}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* topic chips */}
                    {pickAction === "topic20" && (
                      <div className="aa-fade" style={{ marginTop: "0.9rem" }}>
                        <div style={{ fontSize: "0.68rem", color: C.mut2, marginBottom: "0.5rem" }}>Which system? <span style={{ color: C.coral }}>Dots</span> = your priority targets.</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                          {TOPICS.map((t) => {
                            const on = pickTopic === t.id;
                            return (
                              <button key={t.id} className="aa-tap" onClick={() => setPickTopic(t.id)}
                                style={{ display: "flex", alignItems: "center", gap: "0.35rem", border: `1px solid ${on ? C.teal : C.border}`, background: on ? "rgba(63,174,135,0.12)" : "transparent", color: on ? C.teal : C.ink2, borderRadius: 20, padding: "0.4rem 0.8rem", fontSize: "0.78rem", fontFamily: "inherit", cursor: "pointer" }}>
                                {t.priority && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.coral, display: "inline-block" }} />}
                                {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <input value={startNote} onChange={(e) => setStartNote(e.target.value)} placeholder="Note (optional)"
                      style={{ width: "100%", boxSizing: "border-box", marginTop: "1.1rem", background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}`, borderRadius: 9, padding: "0.7rem 0.85rem", color: C.ink, fontFamily: "inherit", fontSize: "0.85rem" }} />

                    <button className="aa-tap" disabled={!pickAction}
                      style={{ ...primaryBtn, marginTop: "1.2rem", opacity: pickAction ? 1 : 0.4, cursor: pickAction ? "pointer" : "not-allowed", background: pickAction ? C.teal : "rgba(255,255,255,0.1)", color: pickAction ? "#06210f" : C.mut2 }}
                      onClick={startSession}>
                      Start &mdash; lock it in
                    </button>

                    <button className="aa-tap" onClick={() => setDreadLocked(false)}
                      style={{ width: "100%", marginTop: "0.6rem", background: "none", border: "none", color: C.mut3, fontFamily: "inherit", fontSize: "0.72rem", cursor: "pointer" }}>
                      &larr; re-rate the dread
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* footer model note */}
            <div style={{ marginTop: "1rem", fontSize: "0.72rem", color: C.mut3, textAlign: "center", lineHeight: 1.6 }}>
              {all.length > 0
                ? <>So far your <span style={{ color: C.coral }}>before</span> runs <span style={{ color: C.amber }}>{fmt1(avgGap)}</span> points hotter than your <span style={{ color: C.teal }}>after</span>.</>
                : <>Before = the dread before you start. After = where it lands. The gap is what avoidance costs you.</>}
              {all.length >= 4 && (
                <div style={{ marginTop: "0.4rem", color: C.mut2 }}>
                  It landed <span style={{ color: C.teal }}>easier than you feared</span> in <span style={{ color: C.ink2 }}>{overN}</span> of <span style={{ color: C.ink2 }}>{all.length}</span> sessions.
                </div>
              )}
            </div>
          </>
        )}

        {/* ───── PROGRESS ───── */}
        {tab === "progress" && (
          <>
            <div style={{ ...card, marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.mut2, marginBottom: "1rem" }}>Round {data.round} — the drop</div>
              {roundEntries.length === 0 && !data.inProgress
                ? <div style={{ color: C.mut2, fontSize: "0.85rem", textAlign: "center", padding: "1.5rem 0" }}>No drops yet. Your first action writes the first data point.</div>
                : <DropChart roundEntries={roundEntries} inProgress={data.inProgress} round={data.round} />}
            </div>

            {/* weak-domain coverage this round */}
            {roundEntries.length >= 1 && (
              <div style={{ ...card, marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.mut2, marginBottom: "0.2rem" }}>Weak domains this round</div>
                <div style={{ fontSize: "0.72rem", color: C.mut3, marginBottom: "0.6rem" }}>From your 20-min topic sessions. A zero is the one you're dodging.</div>
                {TOPICS.filter((t) => t.priority).map((t) => {
                  const n = roundEntries.filter((e) => e.topic === t.id).length;
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.45rem 0", borderTop: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "0.82rem", color: n === 0 ? C.mut : C.ink2 }}>{t.label}</span>
                      <span style={{ fontSize: "0.95rem", fontVariantNumeric: "tabular-nums", color: n === 0 ? C.coral : C.teal }}>{n}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* all-time stats */}
            <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1rem" }}>
              {[["before", fmt1(avgB), C.coral], ["after", fmt1(avgA), C.teal], ["gap", fmt1(avgGap), C.amber]].map(([l, v, col]) => (
                <div key={l} style={{ flex: 1, ...card, padding: "1rem 0.6rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.7rem", color: col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{all.length ? v : "—"}</div>
                  <div style={{ fontSize: "0.66rem", color: C.mut2, marginTop: "0.35rem" }}>avg {l}</div>
                </div>
              ))}
            </div>

            {/* gap by round (cross-round trend) */}
            {roundStats.length >= 2 && (
              <div style={{ ...card, marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.mut2, marginBottom: "0.2rem" }}>Gap by round</div>
                <div style={{ fontSize: "0.72rem", color: C.mut3, marginBottom: "1.1rem" }}>How far your dread overshoots reality, round over round.</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: 88 }}>
                  {roundStats.map((r) => {
                    const h = Math.max(6, Math.round((Math.max(0, r.gap) / maxRoundGap) * 64));
                    const cur = r.round === data.round;
                    return (
                      <div key={r.round} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
                        <div style={{ fontSize: "0.74rem", color: C.amber, fontVariantNumeric: "tabular-nums" }}>{fmt1(r.gap)}</div>
                        <div title={`Round ${r.round}: ${r.n} action${r.n === 1 ? "" : "s"}`} style={{ width: "100%", maxWidth: 34, height: h, background: cur ? C.amber : "rgba(232,160,48,0.38)", borderRadius: 4 }} />
                        <div style={{ fontSize: "0.66rem", color: cur ? C.amber : C.mut2 }}>R{r.round}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1rem" }}>
              <div style={{ flex: 1, ...card, padding: "1rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.4rem", color: C.ink }}>{streak}<span style={{ fontSize: "0.8rem", color: C.mut2 }}> day{streak === 1 ? "" : "s"}</span></div>
                <div style={{ fontSize: "0.66rem", color: C.mut2, marginTop: "0.3rem" }}>current streak</div>
              </div>
              <div style={{ flex: 1, ...card, padding: "1rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.4rem", color: C.ink }}>{all.length}</div>
                <div style={{ fontSize: "0.66rem", color: C.mut2, marginTop: "0.3rem" }}>actions logged, all time</div>
              </div>
            </div>

            {/* history */}
            {all.length > 0 && (
              <div style={{ ...card, padding: "0.5rem 0.5rem" }}>
                <div style={{ fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.mut2, padding: "0.6rem 0.7rem 0.8rem" }}>History</div>
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {[...all].reverse().map((e) => {
                    const drop = e.before - e.after;
                    const isDel = pendingDelete === e.id;
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.7rem", borderTop: `1px solid ${C.border}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.84rem", color: C.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {actionLabel(e.action)}{e.topic ? ` · ${topicLabel(e.topic)}` : ""}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: C.mut2, marginTop: "0.15rem" }}>
                            R{e.round} · {shortDate(e.finishedAt)}{e.finishNote ? ` · ${e.finishNote}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                          <span style={{ color: C.coral }}>{e.before}</span>
                          <span style={{ color: C.mut3 }}>{"→"}</span>
                          <span style={{ color: C.teal }}>{e.after}</span>
                          {drop > 0 && <span style={{ color: C.tealSoft, fontSize: "0.7rem", marginLeft: "0.2rem" }}>{"−" + drop}</span>}
                        </div>
                        {isDel ? (
                          <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                            <button className="aa-tap" onClick={() => deleteEntry(e.id)} style={{ background: C.coralDeep, border: "none", borderRadius: 6, color: "#fff", fontSize: "0.66rem", padding: "0.3rem 0.5rem", cursor: "pointer", fontFamily: "inherit" }}>delete</button>
                            <button className="aa-tap" onClick={() => setPendingDelete(null)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.mut2, fontSize: "0.66rem", padding: "0.3rem 0.5rem", cursor: "pointer", fontFamily: "inherit" }}>keep</button>
                          </div>
                        ) : (
                          <button className="aa-tap" onClick={() => setPendingDelete(e.id)} aria-label="Delete entry" style={{ background: "none", border: "none", color: C.mut3, fontSize: "1rem", cursor: "pointer", lineHeight: 1, flexShrink: 0, padding: "0 0.2rem" }}>{"×"}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* backup */}
            <div style={{ ...card, padding: "1rem", marginTop: "1rem" }}>
              <div style={{ fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.mut2, marginBottom: "0.7rem" }}>Backup</div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="aa-tap" onClick={exportData}
                  style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 9, color: C.ink2, fontSize: "0.8rem", padding: "0.6rem", cursor: "pointer", fontFamily: "inherit" }}>
                  Export
                </button>
                <button className="aa-tap" onClick={importPick}
                  style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 9, color: C.ink2, fontSize: "0.8rem", padding: "0.6rem", cursor: "pointer", fontFamily: "inherit" }}>
                  Import
                </button>
              </div>
              <input type="file" accept="application/json,.json" ref={fileInputRef} onChange={onImportFile} style={{ display: "none" }} />
              {pendingImport && (
                <div style={{ marginTop: "0.8rem" }} className="aa-fade">
                  <div style={{ fontSize: "0.78rem", color: C.ink2, marginBottom: "0.5rem" }}>
                    Found {pendingImport.entries.length} entr{pendingImport.entries.length === 1 ? "y" : "ies"}. Replace current data with this backup?
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="aa-tap" onClick={confirmImport} style={{ background: C.teal, border: "none", borderRadius: 8, color: "#06210f", fontSize: "0.78rem", padding: "0.5rem 1rem", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Replace</button>
                    <button className="aa-tap" onClick={() => setPendingImport(null)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.mut, fontSize: "0.78rem", padding: "0.5rem 1rem", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              )}
              {importMsg && <div style={{ fontSize: "0.74rem", color: C.mut, marginTop: "0.6rem" }}>{importMsg}</div>}
              <div style={{ fontSize: "0.68rem", color: C.mut3, marginTop: "0.7rem", lineHeight: 1.5 }}>Saved in this browser only. Export to move your history to another device or keep a copy.</div>
            </div>

            {/* reset */}
            <div style={{ marginTop: "1.2rem", textAlign: "center" }}>
              {confirmReset ? (
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                  <button className="aa-tap" onClick={resetAll} style={{ background: C.coralDeep, border: "none", borderRadius: 8, color: "#fff", fontSize: "0.78rem", padding: "0.5rem 1rem", cursor: "pointer", fontFamily: "inherit" }}>Erase everything</button>
                  <button className="aa-tap" onClick={() => setConfirmReset(false)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.mut, fontSize: "0.78rem", padding: "0.5rem 1rem", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </div>
              ) : (
                <button className="aa-tap" onClick={() => setConfirmReset(true)} style={{ background: "none", border: "none", color: C.mut3, fontSize: "0.74rem", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>Reset all data</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
