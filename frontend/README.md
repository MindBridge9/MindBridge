# MindBridge frontend

## Visual redesign checkpoint

The latest white-first creative and motion pass is documented in [design-review/CREATIVE.md](design-review/CREATIVE.md), with [actual before/after screenshots](design-review/creative.html). Frontend: 42 unit tests and 25 browser tests pass.

The latest frontend now uses a light-first indigo and slate visual system. See [the redesign evidence and verification notes](design-review/README.md) and [the before/after screenshot gallery](design-review/index.html). This supersedes earlier visual descriptions below; backend and release acceptance status is unchanged.


Existing React/Vite JSX application completed and hardened for synthetic hackathon development. Warm cream/forest/teal identity, Manrope UI and Lexend reading typography follow the approved local design. Impeccable 4.11.1 Shape, Typeset, Layout, Adapt, Audit, Critique and Polish references informed the implementation; the launcher could not initialize its external engine cache, so context was read directly. PRODUCT.md and DESIGN.md were preserved.

## Run locally

Use Node 22.23.1 or a Vite-compatible supported Node release and the existing Python 3.12 backend environment. Provider credentials stay exclusively in backend/.env. No account, database, billing or deployment is required.

Terminal 1, from repository root, for **synthetic/nonpersonal development only**:

```bash
cd backend
MINDBRIDGE_ENV=development SYNTHETIC_DEVELOPMENT_INTEGRATION=true CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

Terminal 2, from repository root:

```bash
cd frontend
npm ci
VITE_API_BASE_URL=http://127.0.0.1:8000 VITE_ENABLED_CAPABILITIES=read,simplify,define,explain,prepare_understanding,check_understanding npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173. Process variables override dotenv files. For normal reviewed builds, enable only individually approved frontend capabilities. Defaults remain off. Backend credentials alone never enable capabilities; `APPROVED_CAPABILITIES` is the separate reviewed allowlist. Development integration is rejected in production and does not close the learning semantic or student-release gates.

## Implemented behavior

- Home: editorial learning journey, SourceLens/FactGuard/repair explanation, clearly labelled preprocessed reading sample and real health refresh.
- Scan: native camera hint/gallery/drop selection, image validation/decode/resize/preview, replace/discard, external-processing disclosure, cancellable OCR, partial/unreadable/error recovery. Images remain on recoverable errors; no fixture replacement.
- Reader: immutable OCR text, separate generated summary and per-section Easy text, provenance, section navigation, exact-source comparison, possible lexical omissions, photo, contextual glossary/definitions and explanations. Reading and source tools use the same typography preferences. Generated caches remain reviewable during outages.
- Speech: shared browser sentence queue, current-text highlighting, play/pause/resume/stop/navigation, voice/rate settings and cleanup. OS reduced-motion preference is respected. Actual device audio remains a separate acceptance check.
- Learning: fixed prepared rubric, draft preservation in memory, validated assessments, uncertainty clarification, repair, different retry, assistance tracking and backend comparison. Returning through the reader records source access before resuming a retry. Unrelated navigation confirms abandonment and clears learning state. Refresh/close warns about unfinished practice.
- Integrity: strict response-schema and request-relationship validation rejects malformed/mismatched content, fabricated quotes and comparisons. Failed health refresh clears stale capabilities. New unavailable AI actions are disabled without hiding existing feedback.
- Privacy: answers, drafts, pages and images remain in memory in P0. Only accessibility preferences are saved automatically. Legacy session-storage drafts are removed. IndexedDB save/restore controls and routes are unmounted while P1 is frozen. A full refresh intentionally requires a rescan or the labelled sample.

## Verification on 2026-11-26

| Check | Evidence |
|---|---|
| Install/build | `npm ci`; `npm run build` pass. |
| Unit/component | `npm run test:run`: 42 passed in 10 files. |
| Dependency audit | npm install/clean install: zero reported vulnerabilities after updating test tooling. |
| Public reproducibility | Frontend copied into `/tmp/mindbridge-public-frontend` without node_modules, environment files, private documents or fixtures: clean `npm ci`, production build and 42 tests passed. |
| Browser | `npm run test:browser`: 11 Chromium tests passed; 360, 390, 768, 1024 and 1440px; keyboard/focus, large text, light/dark, no horizontal overflow, sample, full source/learning journey, outage review, abandonment and scan failure. |
| Automated accessibility | Axe checks passed on tested home/reader/glossary/SourceLens/feedback/results states, including dark feedback. This is not accessibility certification or a real screen-reader audit. |
| Backend | `MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q`: 879 passed; one existing Starlette deprecation warning. |
| Live reading | Actual Chromium → backend port 8000 → Groq: one synthetic image read and one simplification returned 200; reader and SourceLens rendered, no browser errors/overflow. Initial test forwarding returned 422 before provider access; direct browser transport passed. |
| Live learning | One `app.tests.smoke_retry` run: prepare/initial/retry all 200, misconception detected, follow-up coverage matched, valid independent comparison, fixed source/rubric. One locally invalid initial generation retried successfully; retry initially encountered provider 429 and respected the 11-second wait within its two-attempt limit. |
| Production isolation | Production bundle excludes the development harness and synthetic test corpus. No provider secrets enter the frontend. |

Live evidence is synthetic and bounded; it does not establish consistent AI quality, learning effectiveness or provider uptime. No Gemini investigation, live fallback verification, student trial, publication, deployment or Git mutation was performed.

Run browser checks after installing Chromium:

```bash
npm ci
npx playwright install chromium
npm run build
npm run test:run
npm run test:browser
```

The browser suite intercepts API responses with explicit synthetic test data. Its local Vite server enables development flags; do not reuse a manually started server with incompatible flags. The optional `MINDBRIDGE_LIVE_TEST=1 node tests/live-read.mjs` performs at most one actual read and one simplify against the app's configured backend and stops on errors. It spends provider quota and is excluded from ordinary tests.

Screenshots and traces are written to ignored `test-results/`; finite animations are disabled for screenshots. Browser speech events are unit-tested with a fake engine; no claim is made that headless Chromium proves audible speech on a phone.

## Public test data and contracts

`src/test-data/` contains the deliberately reviewed nonpersonal synthetic examples used by tests and the development harness. Private planning documents and fixture files remain ignored and unchanged. `src/lib/responseSchemas.json` is the reviewed response-only projection of the approved API 1.0 schemas; it contains no fixture data and does not alter the wire contract. `validateResponse.js` additionally enforces source/evaluation relationships.

## Readiness and remaining acceptance

Ready for a supervised **synthetic development demonstration**, with explicit provider configuration and possible quota/network recovery. Production capability defaults remain off; the complete P0 release gate is not signed off.

Still required: broader Misconception Repair/Independent Retry semantic acceptance; real Android/iOS capture and speech playback/pause/resume/voices; real screen-reader and zoom interaction checks; hosting/CORS/deep-link acceptance; provider eligibility and child-data review before student access. Define/explain were integrated through browser synthetic transport in this session, not newly live-verified. Guided reading, saved pages, cached-definition persistence, offline reopening/PWA and other P1 features remain off. No automatic fallback, mastery score or unsupported improvement claim is introduced.

`vercel.json` prepares SPA deep-link rewrites; no deployment was made. Any static host must serve `/index.html` for the four app routes while serving assets directly. Configure a reviewed HTTPS backend URL at build time and exact backend CORS origins before hosting.

## Changed files in this checkpoint

Modified existing files:

- `backend/.env.example`
- `backend/DEPLOYMENT.md`
- `backend/README.md`
- `backend/app/api/health.py`
- `backend/app/config.py`
- `backend/app/tests/test_foundation.py`
- `backend/app/tests/test_health.py`
- `frontend/.env.example`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/App.jsx`
- `frontend/src/components/common/Dialog.jsx`
- `frontend/src/components/common/Notice.jsx`
- `frontend/src/components/common/SegmentedControl.jsx`
- `frontend/src/components/common/SourceQuote.jsx`
- `frontend/src/components/glossary/GlossaryPanel.jsx`
- `frontend/src/components/layout/AppShell.jsx`
- `frontend/src/components/reader/ExplanationPanel.jsx`
- `frontend/src/components/reader/ReaderCanvas.jsx`
- `frontend/src/components/reader/ReaderTools.jsx`
- `frontend/src/components/source-lens/SourceLensDialog.jsx`
- `frontend/src/components/understanding/FeedbackView.jsx`
- `frontend/src/components/understanding/LearningResults.jsx`
- `frontend/src/components/understanding/RetryView.jsx`
- `frontend/src/components/understanding/UnderstandingForm.jsx`
- `frontend/src/config/features.js`
- `frontend/src/context/ApiContext.jsx`
- `frontend/src/context/PageContext.jsx`
- `frontend/src/hooks/useLearningSession.js`
- `frontend/src/hooks/useReadingTools.js`
- `frontend/src/hooks/useSpeechQueue.js`
- `frontend/src/lib/api.js`
- `frontend/src/main.jsx`
- `frontend/src/mocks/DevFixtureHarness.jsx`
- `frontend/src/pages/HomePage.jsx`
- `frontend/src/pages/LearningPage.jsx`
- `frontend/src/pages/ReaderPage.jsx`
- `frontend/src/pages/ScanPage.jsx`
- `frontend/src/styles/global.css`
- `frontend/src/styles/reading.css`
- `frontend/src/tests/accessibility.test.jsx`
- `frontend/src/tests/api.test.js`
- `frontend/src/tests/features.test.js`
- `frontend/src/tests/learning.test.jsx`
- `frontend/src/tests/persistence.test.js`
- `frontend/src/tests/reader.test.jsx`
- `frontend/src/tests/scan.test.jsx`
- `frontend/src/tests/source-lens.test.jsx`

Created public implementation/test/documentation files:

- `frontend/README.md`
- `frontend/playwright.config.js`
- `frontend/public/fonts/lexend-OFL.txt`
- `frontend/public/fonts/manrope-OFL.txt`
- `frontend/src/lib/responseSchemas.json`
- `frontend/src/lib/validateResponse.js`
- `frontend/src/test-data/README.md`
- `frontend/src/test-data/check.misconception.json`
- `frontend/src/test-data/check.uncertain.json`
- `frontend/src/test-data/define.success.json`
- `frontend/src/test-data/error.rate-limit.json`
- `frontend/src/test-data/health.initial.json`
- `frontend/src/test-data/preferences.defaults.json`
- `frontend/src/test-data/prepare.success.json`
- `frontend/src/test-data/read.enrichment-unavailable.json`
- `frontend/src/test-data/read.partial.json`
- `frontend/src/test-data/read.success.json`
- `frontend/src/test-data/read.unreadable.json`
- `frontend/src/test-data/retry.independent-success.json`
- `frontend/src/test-data/retry.narrow.json`
- `frontend/src/test-data/simplify.no-terms.json`
- `frontend/src/test-data/simplify.omission.json`
- `frontend/src/tests/integrity.test.jsx`
- `frontend/tests/assets/synthetic-page.png`
- `frontend/tests/e2e/journey.spec.js`
- `frontend/tests/live-read.mjs`
- `frontend/vercel.json`
