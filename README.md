# Anti-Avoidance Tracker

A 7-day anti-avoidance tracker for NPTE study. Each session logs your anxiety
**before** you start and where it actually **landed** afterward, then plots the
drop — so the data, not a pep talk, makes the case for doing the work.

It's a SUDS log (Subjective Units of Distress, 0–10) wrapped in a study tracker:
pick an action, rate the dread, run a focus timer, rate where it landed, take an
optional break. Sessions accumulate into 7-day rounds, and the before→after gap
is surfaced across every entry.

## Run it locally

Requires Node 20.19+ (or 22.12+).

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173).

## Build / deploy

```bash
npm run build      # outputs static files to dist/
npm run preview    # serve the production build locally
```

**Vercel:** push this repo to GitHub and import it in Vercel. The framework is
auto-detected (Vite), build command `npm run build`, output directory `dist`.
No configuration or backend needed.

## Where your data lives

There is **no backend**. Data is saved in the browser via `localStorage`, so it
persists across reloads but is **per-device and per-browser** — your phone and
laptop won't share history.

To move or back up your history, use **Progress → Backup**:

- **Export** downloads a JSON file of everything.
- **Import** restores a backup (replaces current data, with a confirm step).

That's also how you carry data over from one device — or one deployment — to
another.

> Note on storage: `src/AntiAvoidanceTracker.jsx` includes a small adapter that
> uses the browser's `window.storage` API when running inside a Claude artifact,
> and falls back to `localStorage` everywhere else. In this standalone app it
> always uses `localStorage`.

## Customizing the content

This build is wired to NPTE study. To change what you track, edit the arrays
near the top of `src/AntiAvoidanceTracker.jsx`:

- `ACTIONS` — the daily moves ("10 practice questions", "teach one concept", …).
  Each has an `id`, `label`, and `hint`; one (`topic20`) sets `hasTopic: true`
  to reveal the topic chips.
- `TOPICS` — the systems shown for the "20 minutes of one topic" action. The
  `priority: true` ones get a coral dot (your weak domains).
- `defaultTimerSec(action)` — the suggested focus-timer length per action.
- `ROUND_LEN` — days per round (default 7).

Everything else (the drop chart, focus/break timers, streak, stats) adapts
automatically.

## Stack

Vite + React. No UI framework — styling is inline and the charts are hand-drawn
SVG, so the component has zero dependencies beyond React.
