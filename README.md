# GramRoute AI — No Student Left Stranded

GramRoute AI is an explainable, deterministic rural student transportation and last-mile
coordination platform built for the **ROUTELESS: THE LAST MILE** challenge. It demonstrates how
limited government bus capacity and community vehicles can be coordinated to keep rural students
from being stranded, using realistic Karnataka-inspired villages, Indian Rupee fares, practical
transport constraints and accessibility-first design.

This is a demonstration product, not a production dispatch system. **All transport data, demand,
drivers, students and outcomes are simulated.** No real SMS is sent and no real student personal
data is collected.

---

## 1. Product vision

GramRoute AI connects three layers:

1. **Demand** — identifies stranded students, clusters them by village and destination, and
   forecasts near-term demand with a statistical model over synthetic history.
2. **Optimization** — allocates intact student groups to capacity-constrained community vehicles and
   recommends network improvements such as a relief bus or higher frequency.
3. **Execution** — coordinates students, guardians, drivers and the village transport coordinator
   through a strict dispatch lifecycle with guardian consent, a Trip Safety Code and an explainable
   audit log.

The intelligence is deliberately **not** described as a trained machine-learning model. It is:

- deterministic, capacity-constrained optimization;
- Dijkstra graph routing over real edge travel times;
- seeded discrete-event simulation;
- exponential-smoothing statistical forecasting;
- a seeded 30-day backtest.

---

## 2. Problem statement

Rural students often depend on one or two government bus trips a day. When a bus is full, late,
cancelled or broken down, the next option is usually an expensive solo auto ride — or missing class.
Community vehicles (autos, feeder vans, verified carpools) exist but are not coordinated with bus
capacity, village demand or guardian consent. GramRoute AI closes that coordination gap while keeping
the human coordinator in control.

---

## 3. What the demonstration includes

- **Student App** (mobile-first) — village and college selection, live bus capacity, ETA and route
  status, ranked shared-vehicle alternatives, fare comparison, guardian consent, Trip Safety Code,
  proxy ping for teachers/coordinators, and a compact mobile stop list in place of the map.
- **Guardian consent** — a simulated 4-digit OTP, explicit consent state, and a hard gate before
  coordinator approval. No dispatch can be approved without confirmed consent when required.
- **SMS simulator** — a feature-phone UI supporting `1` (request ride), `YES` (guardian consent) and
  `PANIC` (safety alert), localized replies, and a safety event log. Entirely simulated.
- **Coordinator Control Center** — interactive SVG corridor map with demand heat circles, bus and
  vehicle positions, road closures, allocation recommendations, dispatch approval/cancellation,
  explainable decision log, what-if fleet simulator, demand forecast, 30-day backtest and impact.
- **Guided 90-second demo** — Meena from Adyar: monsoon disruption, Route A failure, SMS request,
  cluster identification, shared Auto-3 recommendation, guardian OTP, coordinator approval,
  ETA countdown, completion, impact update and full decision log. Reproducible for the same seed.
- **Scenario switcher** — normal, heavy rain, exam surge, exam-day crisis, bus breakdown, road
  closure and route cancellation.
- **Exam-Day Crisis** — two buses out of service, seeded demand 40% above the scenario baseline,
  Kalladka cut off by a flooded link, and exam deadlines 30–120 minutes away. The engine prioritises
  exam students, computes ETA + 15-minute buffer slack, redirects a cut-off village to its nearest
  reachable pickup, stages the existing Route C bus as relief, and shows an engine-computed
  no-action versus GramRoute comparison.
- **English / ಕನ್ನಡ / हिंदी** interface and SMS replies, with English retained for technical
  explanations.
- **Versioned localStorage persistence**, BroadcastChannel + storage-event synchronization, action
  deduplication, monotonic state versions and stale-version rejection for approvals.

---

## 4. Architecture

```text
React 18 UI (Vite + TypeScript strict)
  ├── Header / Student App / Control Center / SMS simulator / Guided demo
  ├── useReducer  ← single authoritative state store
  │     ├── dispatch state machine + seat reservation / release
  │     ├── decision log + impact accounting
  │     └── derived clusters / plans / reallocations after each change
  ├── pure services (no React, DOM, browser APIs or hidden clock)
  │     ├── graphRouter.ts      Dijkstra over usable road edges
  │     ├── routeOptimizer.ts   risk, clustering, orchestration, what-if
  │     ├── allocation.ts       capacity-constrained cluster allocation + exam priority + scoring
  │     ├── examPolicy.ts       15-minute arrival buffer and exam on-time/slack policy
  │     ├── crisisPlanner.ts    exam countdown, before/after comparison, bus moves, unserved list
  │     ├── weights.ts          normalized optimization weights
  │     ├── forecasting.ts      exponential smoothing + seasonal modifiers
  │     └── backtest.ts         seeded 30-day static-vs-GramRoute simulation
  ├── seeded data (stops, edges, routes, vehicles, pings, scenarios, translations)
  ├── simulation clock: 3 real seconds = 1 simulated minute
  └── persistence: versioned envelope { version, savedAt, state }
```

### Deterministic optimization

- **Overcrowding risk** — `R = (D + W) / S`, clamped to `[0, 1]`, with a monotonic
  departure-urgency multiplier. Seat-free routes with demand are critical; no division by zero.
- **Clustering** — waiting pings are grouped by village + destination inside a rolling 10-minute
  window. A cluster forms at 3+ students, or immediately when the relevant bus route is full,
  cancelled or broken down. Clusters are intact and never silently split.
- **Allocation** — exhaustive search for the small seeded dataset (coverage first, then weighted
  score, then lower cost) with a documented deterministic greedy fallback above 7 clusters / 6
  vehicles. Capacity, availability, reachability, detour, daylight, destination and safety rules are
  enforced. No assignment can exceed seats. A lone minor cannot be placed with an unverified driver.
- **Scoring** — normalized 0–1 utilities: cost 0.25, ETA 0.15, reliability 0.20, detour 0.20, seat
  fit 0.10, verification 0.10. Weights sum to exactly 1.
- **Explainability** — every plan's `reasoning[]` is generated from the calculated fare, detour,
  ETA, seat capacity, verification tier and solo-fare comparison. Nothing is invented.

### Dispatch lifecycle

```text
requested → matched → guardian_consented → approved → dispatched → completed
```

Cancellation is allowed at any stage before completion. Seats are tentatively reserved at `matched`,
released exactly once on cancellation or completion, and re-validated immediately before approval.
Duplicate approval is idempotent. A completed dispatch cannot be rolled back through the ordinary
cancel path. Every transition is appended to the dispatch history and the global decision log.

### Persistence and browser synchronization

State is saved in a schema-versioned envelope. Load validates the envelope and required fields,
migrates supported legacy payloads, and resets to seeded demo data if corrupt or unsupported.
Cross-tab sync uses BroadcastChannel and the storage event, accepts only newer monotonic versions,
and deduplicates actions by ID. The control-center tab is the authoritative dispatch writer.

> **Important:** browser-only synchronization is a demo mechanism, not a substitute for server-side
> transactions, row-level locking or authoritative capacity checks.

---

## 5. Technology stack

Pinned exact versions in `package.json`:

- Vite 5.4.10
- React 18.3.1 / React DOM 18.3.1
- TypeScript 5.6.3 (strict)
- Tailwind CSS 3.4.14 + PostCSS 8.4.47 + Autoprefixer 10.4.20
- lucide-react 0.454.0
- Vitest 2.1.4
- `@vitejs/plugin-react` 4.3.3

No backend, no paid APIs, no API keys, no external map service, no external charting library.
Maps and charts are native SVG.

---

## 6. Project structure

```text
gramroute-ai/
├── public/favicon.svg
├── src/
│   ├── components/
│   │   ├── layout/Header.tsx, Footer.tsx
│   │   ├── student/StudentView.tsx, PlanCard.tsx, GuardianConsent.tsx
│   │   ├── coordinator/CoordinatorView.tsx, RecommendationPanel.tsx,
│   │   │   DecisionLog.tsx, WhatIfSimulator.tsx, ForecastPanel.tsx,
│   │   │   BacktestPanel.tsx, ImpactPanel.tsx
│   │   ├── map/CorridorMap.tsx
│   │   ├── charts/ForecastChart.tsx, BacktestChart.tsx
│   │   ├── sms/SmsSimulator.tsx
│   │   └── demo/DemoRunner.tsx
│   ├── data/seedData.ts, scenarios.ts, translations.ts
│   ├── services/graphRouter.ts, weights.ts, routeOptimizer.ts, allocation.ts,
│   │   forecasting.ts, backtest.ts
│   ├── state/mobilityReducer.ts, actions.ts, persistence.ts
│   ├── types/mobility.ts
│   ├── utils/seededRandom.ts, simulationClock.ts, formatters.ts
│   ├── hooks/useSimulationClock.ts, useCrossTabSync.ts
│   ├── App.tsx, main.tsx, index.css
├── tests/
│   ├── routeOptimizer.test.ts
│   ├── allocation.test.ts
│   ├── dispatch.test.ts
│   ├── forecasting.test.ts
│   └── persistence.test.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── vercel.json
├── netlify.toml
└── README.md
```

---

## 7. Local setup

Requirements: Node.js 20+ and npm.

```bash
cd gramroute-ai
npm install
npm run dev          # http://localhost:5173
```

Production build and tests:

```bash
npm run build        # tsc --noEmit && vite build
npm test             # vitest run
npm run preview      # serve the production build locally
```

---

## 8. Deployment

### Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to the project folder that contains `package.json`.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. `vercel.json` already rewrites all routes to `/index.html` for the SPA.
5. Deploy. No environment variables or API keys are required.

### Netlify

1. Create a new site from the repository.
2. Base directory: the folder containing `package.json`.
3. Build command: `npm run build`. Publish directory: `dist`.
4. `netlify.toml` already provides the `/* → /index.html` rewrite (status 200).
5. Deploy. No environment variables are required.

Both targets use the same static SPA output and require no backend.

---

## 9. Demo walkthrough (about 60–90 seconds)

Click **Run Demo** in the header. The guided runner pins itself to the bottom of the screen.

1. **Normal seeded morning** — 8 stops, 3 routes, 14 anonymized student pings, 5 already waiting at
   Adyar.
2. **Heavy monsoon** — Melkar–BC Road floods; every usable edge takes 40% longer.
3. **Route A breakdown** — the government bus is unavailable; Meena is stranded at Adyar.
4. **Corridor map** — the flooded link turns red and the route gap is visible.
5. **Meena texts `1`** — the feature-phone simulator sends a simulated SMS request.
6. **Cluster** — 6 students at Adyar for Sahyadri FGC form one intact cluster.
7. **Recommendation** — Auto-3 wins on cost, ETA, detour, seat fit and verification.
8. **Explanation** — fare per student, solo-auto comparison, detour, ETA and verification tier.
9. **Guardian OTP** — the simulated guardian consent is confirmed.
10. **Coordinator approval** — capacity and version are re-validated; dispatch is approved.
11. **Departure** — the vehicle moves on the SVG corridor; ETA counts down with the simulation clock.
12. **Completion** — impact metrics and the decision log update from the completed dispatch.

Pause/resume/reset are available in the demo panel. The same seed reproduces the same data, plan and
outcome. Reset Demo Data in the footer restores the exact seeded state.

### 60-second judge script

> “Rural students miss college when the one government bus is full or breaks down. GramRoute AI
> first clusters stranded students, then allocates intact groups to capacity-constrained community
> vehicles using deterministic optimization. Here is Meena at Adyar. Heavy rain hits, Route A fails,
> and she texts ‘1’ from a feature phone. The engine identifies a cluster of six and recommends
> Auto-3: ₹15 per student instead of ₹114 for a solo auto, an 18-minute ETA and an ID-verified
> driver. Her guardian confirms a simulated OTP, the coordinator approves, the vehicle departs, and
> only when the trip completes do the impact numbers move. Every decision is explained in the log.
> No real student data is used, and the same seed reproduces the same demo.”

---

## 10. Simulated versus real

| Capability | Status |
| --- | --- |
| Village stops, roads, routes, vehicles, demand, students | Simulated / seeded |
| Student aliases and “Meena” persona | Fictional anonymized identifiers |
| SMS sending and replies | Simulated feature-phone UI only |
| Guardian OTP | Displayed demo OTP, no real SMS/OTP provider |
| Driver verification tiers | Labels used by the policy engine; not real ID or police verification |
| Vehicle availability and driver positions | Simulated |
| Demand history and forecasts | Synthetic data + statistical forecasting |
| 30-day backtest | Seeded simulation, not a real-world trial |
| Map and charts | Hand-built SVG, no external map/tile service |
| Persistence and cross-tab sync | Browser-only demo mechanism |
| Backend, payments, production auth | Not included |

No claim of Aadhaar verification, police verification or DPDP Act certification is made.

---

## 11. Testing and invariants

`npm test` runs 47 Vitest assertions across six test files. Covered invariants include:

1. No vehicle assignment exceeds seat capacity.
2. Clusters remain intact unless splitting is explicitly allowed.
3. Unverified-driver lone-minor safety restrictions are enforced.
4. Approving the same dispatch twice is idempotent.
5. Invalid state transitions are rejected.
6. Cancellation restores reserved seats and pings exactly once.
7. Overcrowding risk never decreases when demand increases, or as departure approaches.
8. Forecast output is deterministic for a given seed.
9. Backtest output is deterministic for a given seed.
10. Reset restores the exact initial seeded state.
11. Closed roads are never used by the routing engine.
12. Repeated/stale dispatch actions cannot overbook a vehicle; stale approval versions are rejected.
13. The full guided-demo reducer sequence completes with exactly 6 rescued students.
14. Exam students rank before non-exam students, then by earliest deadline.
15. No student is counted on time when ETA + 15 minutes exceeds the exam deadline.
16. The flooded edge is never used and Kalladka plans use the nearest reachable pickup.
17. The exam crisis seed is deterministic, 40% above its derived baseline, and seats are below demand.

---

## 12. Accessibility and privacy

- Keyboard-navigable SVG map nodes with focus styles and ARIA labels.
- Semantic landmarks, headings, lists, tables, form labels and progress bars.
- Accessible OTP form with error messaging and live status updates.
- Large touch targets and responsive layouts for mobile and desktop.
- Visible focus indicators and high-contrast palette.
- `prefers-reduced-motion` disables decorative animation while preserving functional updates.
- Anonymized identifiers only; no real student data; demo OTPs and safety codes are local values.

Privacy note shown in the app footer:

> “GramRoute AI uses anonymized student identifiers in this demonstration. No real student personal
> data is collected. This prototype illustrates privacy-conscious design aligned with India’s Digital
> Personal Data Protection framework; it is not a certification of DPDP Act compliance.”

---

## 13. Known limitations and honest scope

- **No backend.** Capacity, consent and approval are enforced in the browser reducer. Multi-tab
  coordination is best-effort and not transactional.
- **Stop reordering and emergency feeder-stop insertion** are modeled in the what-if simulator;
  they are not applied as live route mutations. Relief-bus and frequency interventions are also
  simulated recommendations, not real fleet commands.
- **Simulated integrations.** No SMS gateway, IVR, payment, identity or vehicle-tracking provider is
  connected.
- **Verification labels are demo metadata.** “ID-verified”, “Depot-registered”,
  “Community-vouched” and “Unverified” are synthetic tiers used to enforce the safety policy.
- **Forecasting is statistical, not ML**, and backtest results are synthetic. They must not be read
  as real-world accuracy.
- **Road/network data is illustrative**, not a real GIS dataset. Coordinates are for the SVG corridor
  only; travel times come from seeded edge values.
- **Persistence is local to one browser profile.** Clearing site data resets the demo.
- **Demo pacing** is roughly 55 seconds; timings are UI pacing around one centralized simulation
  clock, not separate simulation clocks.

---

## 14. Future ML roadmap

**Phase 1 — Explainable deterministic optimization and synthetic forecasting (current).**
Cluster demand, enforce constraints, rank feasible vehicles, explain every recommendation and
backtest the policy against a static schedule.

**Phase 2 — Collect anonymized, consent-based real ridership data.**
Work with colleges, panchayats and depot operators. Collect only the minimum fields needed, with
guardian consent, retention limits and aggregation.

**Phase 3 — Train and validate demand prediction models.**
Use historical ridership, attendance calendars, weather and road closures. Evaluate with
time-based splits and held-out villages; keep deterministic allocation as the safety layer.

**Phase 4 — Compare predicted demand with actual outcomes.**
Track calibration, bias and failure modes. A forecast only changes deployment when it beats the
current statistical baseline under human review.

**Phase 5 — Deploy validated models with human oversight.**
Keep coordinator approval, explainability, fallback scheduling and an audit trail. No automated
dispatch without a human and a safety policy.

---

## 15. Pilot proposal

Start with **2–3 villages** and one or two colleges.

- Partner with local educational institutions and the Block Education Office.
- Involve village coordinators, teachers and registered community drivers.
- Provide phone-based or SMS/IVR request channels for feature-phone users.
- Run static and GramRoute-assisted weeks with the same demand measurement.

Measure:

- average student waiting time;
- missed classes caused by transport;
- cost per student;
- vehicle utilization;
- completed trips and safety incidents.

Success criteria should be agreed before the pilot: reduced waiting time, reduced missed classes,
no safety incidents, and cost per student below a solo-auto baseline.

### Funding model

- Block Education Office and local government transport budgets.
- Gram Panchayat support.
- CSR partnerships.
- Institutional transportation partnerships with colleges.

---

## 16. Production roadmap

1. Secure backend synchronization and transactional seat reservations.
2. Offline-capable PWA with queued requests.
3. Real SMS/IVR integration and local-language voice assistance.
4. Real driver onboarding, document verification and periodic re-verification.
5. Secure guardian consent with auditable identity and consent records.
6. Real vehicle availability and GPS integration.
7. Privacy, security and accessibility audits.
8. DPDP-aligned retention, deletion and consent-management processes.
9. Operations dashboard with human-in-the-loop dispatch controls.
10. Controlled pilots before any public rollout.

---

## 17. Seeded demo data

- **Villages:** Bantwal, Adyar, Kothur, Farangipete, Vittla, Mudipu, Melkar, BC Road.
- **Colleges:** Sahyadri First Grade College, Kothur; Vishwa Mangala Government College,
  Farangipete.
- **Government routes:** A (Bantwal–Adyar–Kothur), B (Vittla–Farangipete–Mudipu–Kothur),
  C (Melkar–BC Road–Bantwal–Farangipete).
- **Community vehicles:** Auto-3 (ID-verified), Feeder Van-1 (Depot-registered), Carpool-2
  (Community-vouched), Auto-7 (Unverified).
- **Demo persona:** Meena (`STU-AD-100`), a minor, Adyar → Sahyadri FGC. All other student
  identifiers are anonymized.

All names are fictional or used as illustrative place names. All operational data is fabricated for
the demonstration.

---

## 18. Acceptance summary

- `npm run build` passes (`tsc --noEmit` + Vite production build).
- `npm test` passes: 6 files, 47 tests, including exam-priority, deadline, flooded-road, capacity
  and deterministic-seed invariants.
- Student App, Control Center, guardian consent, SMS simulator and guided Meena demo are functional.
- The guided demo was exercised in headless Chrome: Route A breakdown, Auto-3 match, guardian
  consent, coordinator approval, dispatch and completion all executed with no console errors; impact
  updated only at completion (6 students rescued).
- Capacity never exceeded; duplicate approval idempotent; cancellation rollback verified.
- Road closures respected by Dijkstra; forecast and backtest deterministic from seeds.
- Reset restores the exact seeded demo state.

**GramRoute AI — No Student Left Stranded.**
