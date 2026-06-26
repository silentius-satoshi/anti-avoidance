# Anti-Avoidance Tracker

A 7-day anti-avoidance tracker for NPTE study, installable as a phone app. Each session logs your anxiety **before** you start and where it actually **landed** afterward, then plots the drop — so the data, not a pep talk, makes the case for doing the work (Knowledge of Results, not Performance).

It is a SUDS log (Subjective Units of Distress, 0–10) wrapped in a study tracker. Sessions accumulate into 7-day **rounds**, and the before→after gap is surfaced across every entry.

## How a session works

1. **Dread gate** — on open, before you pick anything, it shows your record ("It was worse in your head than reality 15 of 18 times", once you have at least 4 sessions) and asks how much you were dreading today. The dread is captured *before* the friction of choosing — that is the point.
2. **Pick a move** — one small action (10 questions, 20 minutes on a topic, review rationales, teach a concept, update your why-I-got-it-wrong log).
3. **Focus timer** — a wall-clock Pomodoro that survives screen-lock and reload.
4. **Land it** — when the timer is done, rate where the anxiety actually landed, add an optional note, log the drop.
5. **Break (optional)** — a separate rate-first break timer that does not count toward the 7 days.

A subtle **← change action** link lets you fix a mis-tapped action before you finish a block; **← re-rate the dread** steps back to the gate.

## What the Progress tab shows

- The current round's **drop chart** (before→after per day).
- **All-time** average before, after, and gap.
- **Hit-rate** — how often the dread overshot reality (shown once you have at least 4 sessions).
- **Gap by round** — whether the gap widens as you get reps (shown once you have at least 2 rounds).
- **Weak domains this round** — coverage of your priority systems from 20-minute topic sessions; a zero is flagged in coral (the one you are dodging).
- Streak, total actions, full history (with delete), and JSON export/import.

## Install on your phone (iOS)

It is a PWA — installable and fully offline once added:

1. Open the deployed URL in **Safari**.
2. **Share → Add to Home Screen**.
3. Launch from the icon — it runs full-screen, no browser chrome, and works offline.

(Android: open in Chrome and use the install prompt / "Add to Home screen".)

## Daily reminder

A PWA cannot schedule its own local notification on iOS, so reminders are handled with an **iOS Shortcuts** personal automation: Shortcuts → Automation → Time of Day → Daily, "Run Immediately", then add a **Show Notification** action. (A self-contained Web Push build was scoped but shelved.)

## Run it locally

Requires Node 20.19+ (or 22.12+).

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173). Note: the service worker is only active in the production build, not in `dev`.

## Build / deploy

```bash
npm run build      # static files to dist/ (incl. service worker + manifest)
npm run preview    # serve the production build locally (use this to test the PWA)
```

**Vercel:** push to GitHub and import in Vercel. Framework auto-detected (Vite), build `npm run build`, output `dist`. No configuration or backend needed. The service worker is `autoUpdate`, so a redeploy refreshes installed apps on next launch.

## Where your data lives

There is **no backend**. Data is saved in the browser via `localStorage` — it persists across reloads but is **per-device and per-browser**; your phone and laptop will not share history. Use **Progress → Backup** to **Export** a JSON of everything or **Import** a backup (replaces current data, with a confirm step) — also how you carry data between devices or deployments.

> `src/AntiAvoidanceTracker.jsx` includes a small storage adapter that uses `window.storage` inside a Claude artifact and falls back to `localStorage` everywhere else. In this standalone app it always uses `localStorage`.

## Customizing the content

Edit the arrays near the top of `src/AntiAvoidanceTracker.jsx`:

- `ACTIONS` — the daily moves. Each has `id`, `label`, `hint`; one (`topic20`) sets `hasTopic: true` to reveal the topic chips.
- `TOPICS` — systems for the "20 minutes of one topic" action; `priority: true` ones get a coral dot (weak domains).
- `defaultTimerSec(action)` — suggested focus-timer length per action.
- `ROUND_LEN` — days per round (default 7).

Everything else (charts, timers, streak, stats) adapts automatically.

## Stack

Vite 8 + React 18. No UI framework — styling is inline and the charts are hand-drawn SVG, so the app has no runtime dependencies beyond React. `vite-plugin-pwa` (build-time) generates the service worker and manifest for offline use and installability.
