# CLAUDE.md

Guidance for working in this repo with Claude Code.

## What this is

A 7-day "anti-avoidance" tracker for NPTE study, shipped as an installable PWA. It is a SUDS log: rate anxiety **before** a study action and **after**, and surface the gap as objective evidence that anticipated dread overshoots reality. Design principle: **Knowledge of Results, not Performance** — objective data, no motivational framing.

## Stack & commands

- **Vite 8 + React 18**, `vite-plugin-pwa` for the service worker and manifest. No UI framework, no CSS files.
- Node 20.19+ (or 22.12+).
- `npm run dev` (no service worker in dev) · `npm run build` (emits `dist/` incl. `sw.js` + `manifest.webmanifest`) · `npm run preview` (serve the prod build — use this to test the PWA/SW).

## Architecture

- **The entire app is one file: `src/AntiAvoidanceTracker.jsx`.** `src/main.jsx` and `src/App.jsx` are thin wrappers; `index.html` holds the viewport (`viewport-fit=cover`) and iOS meta tags.
- **Inline styles only.** Colors come from the `C` palette object at the top of the component. There is one small global `<style>` block *inside the component* (custom range slider, focus rings, `prefers-reduced-motion`, and iOS-fit rules). No Tailwind, no CSS modules.
- **Semantic colors (do not repurpose):** `coral` = before/dread, `teal` = after/calm, `amber` = the gap. `sudsColor(v)`: <=3 teal, <=6 amber, else coral.
- **State & persistence:** a single `data` object — `{ entries, inProgress, round, restTimer }` — persisted through the `store` adapter under `STORE_KEY = "antiavoidance:v1"` via the `persist()` callback. The adapter uses `window.storage` in a Claude artifact, else `localStorage`, else in-memory. **No backend, no account, per-device.** Use `persist(...)` / `store`; never touch `localStorage` directly.
- **Data model:** a logged `entry` = `{ id (Date.now()), round, action, topic, before, after, startNote, finishNote, startedAt, finishedAt }` (plus carried-over timer fields). `before` is captured at session start, `after` at completion. A **round** is `ROUND_LEN` (7) actions. All Progress-tab stats derive from `data.entries`.

## Key flows

- **Two-phase start:** Phase 1 is the **dread gate** (your record / hit-rate + a backward-framed dread slider, gated by `dreadLocked`); Phase 2 is the **action picker**. `dreadLocked` resets in `startSession`.
- **In-progress:** a wall-clock **Pomodoro** timer (stores an end-timestamp, survives screen-lock/reload, never writes storage per tick). A `← change action` link (`backToPicker`, shown while `!tDone`) discards the in-progress session and returns to the picker with the dread preserved — nothing is logged. `← re-rate the dread` returns to the gate.
- **Finish:** rate `after` → optional note → `finishSession` pushes the entry and clears `inProgress`. An optional **break timer** (rate-first, separate accent) does not count toward the 7 days.
- **Progress stats:** all-time avg before/after/gap; **hit-rate** (`before > after` count over all entries, shown at >=4 sessions); **gap-by-round** trend (shown at >=2 rounds); **weak-domain coverage** (priority `TOPICS` for the current round, zero flagged coral); streak; history with delete; JSON export/import.

## PWA

- `vite-plugin-pwa` in **`generateSW`** mode (`registerType: "autoUpdate"`); manifest lives in `vite.config.js`; icons in `public/`; iOS `apple-*` meta tags + `viewport-fit=cover` in `index.html`; safe-area insets applied via `env(safe-area-inset-*)` in the `shell` style.
- There is **no custom service worker.** Adding push notifications would require switching to **`injectManifest`** and writing `src/sw.js` (precache + `push`/`notificationclick` handlers) — scoped but **not implemented**. Daily reminders are handled externally via an iOS Shortcuts automation.

## Conventions & gotchas (read before editing)

- **Do not reformat or lint-fix the file** — preserve the dense single-line inline-style style. Make minimal, literal edits.
- **Keep inputs >=16px.** The global `input,textarea,select { font-size:16px !important }` rule prevents iOS focus-zoom — do not remove it.
- **Keep timers wall-clock.** Do not replace the end-timestamp approach with a `setInterval` countdown (breaks when the tab is backgrounded/locked).
- **Do not add a UI framework or CSS files.** Match the inline-style + `C`-palette convention.
- **The data model is stable** across features (`before`/`after` per entry); add stats by deriving from `data.entries`, not by changing the entry shape.
- **Customizing content:** `ACTIONS`, `TOPICS`, `defaultTimerSec`, `ROUND_LEN` near the top of the component.

## Working style

The owner reviews Claude Code plans before applying and prefers small, surgical, literal edits, verified with `npm run build`.
