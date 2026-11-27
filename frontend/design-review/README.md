# MindBridge visual redesign

Latest creative pass: [white-first design, motion, tests and limitations](CREATIVE.md) · [actual before/after gallery](creative.html).

Latest targeted follow-up: [resolved critique findings and verification](POLISH.md). The `polish/` screenshots supersede `after/` for these layouts.

The redesign replaces the cream/olive identity with a light canvas, indigo actions and evidence surfaces, and a neutral midnight dark theme. Manrope remains the interface face; configurable Lexend/Manrope/system reading typography remains intact. PRODUCT.md and DESIGN.md were not overwritten.

Open [the screenshot comparison gallery](index.html). It includes desktop and mobile landing, scan, image preview, reader, SourceLens, reading settings, question, misconception feedback, retry comparison, and dark-theme captures.

## Evidence provenance

- Initial before screenshots were captured and inspected before editing. They were stored under `/tmp` and disappeared when the environment restarted during `codex resume`.
- Durable `baseline/` captures therefore come from repository revision `eac7dc8`, exported into an isolated temporary directory using read-only Git archive. They represent the prior committed visual design, not every uncommitted integration improvement present immediately before this task. No working files or Git history were restored or changed for this capture.
- `after/` captures show the final redesigned working tree. Both sets use Chromium at 390×1000 and 1440×1000, with full-page captures except scrollable dialogs. Sticky controls appear at the viewport edge within full-page screenshots.
- Screenshots use explicit, nonpersonal synthetic API interception in Playwright. They are not evidence of live provider output. The landing demonstration itself is labelled illustrative and does not make API requests.
- `connectivity.png` and `connectivity.json` are separate, real browser observations without API interception.

## Implemented design changes

- New book/bridge mark and wordmark; responsive navigation and global light/dark control on landing and scan.
- Editorial hero followed by a working original/simplified preview and expandable SourceLens evidence.
- Connected seven-stage learning journey; interactive misconception-to-follow-up demonstration; reading typography specimen; honest FactGuard explanation; closing scan action.
- Scan stages reflect actual selection/request state. Document framing guidance, a prominent upload surface, compact replacement controls, image preview and an explicit processing disclosure preserve the existing capture behavior.
- Reader leads with the original document and places its AI summary below it. Supporting tools form one coherent rail, with simplified-mode controls and preserved review access during outages.
- Learning stages use a connected process indicator. Questions and answer inputs share one writing surface. Grounded repair precedes detailed criterion assessments, with expandable evidence. Initial and retry answers form a visually distinct comparison using actual backend data.
- Shared buttons, fields, segmented controls, notices, SourceQuote panels, dialogs, glossary/explanation panels, speech controls and settings use semantic tokens. The stored `cream` theme enum now presents as “Light”; saved preference schema and validator remain unchanged.
- Route entry scrolls to the top. Mobile settings retain an accessible label and a 44px icon control.

## Interaction and animation review

| Before | After | Why |
| --- | --- | --- |
| Button color changes and tiny vertical nudge | 160ms pointer press scale, 100ms release | Immediate tactile response without layout movement |
| Discrete segment backgrounds | Interruptible 200ms transform indicator | Selection moves coherently; arrow keys also move focus and skip disabled options |
| Dialog keyframe entrance | 220ms transform transition from a small offset/scale | Responsive entry; immediate exit and focus restoration |
| Feedback fade briefly reduced contrast | Full-opacity content with a short positional entrance | Text keeps its contrast while feedback appears |
| Repeated expanded rubric quotations | Native evidence disclosures with a rotating chevron | Supports inspection without overwhelming the concept breakdown |
| Motion irrespective of input method | Keyboard-triggered transitions are immediate; reduced motion removes movement | Preserves speed, focus, and motion preferences |

Review verdict: approve for the tested Chromium interactions. Moving transitions use transform; color changes are limited to controls. No animation library, per-frame React updates, continuous decorative animation, blur animation, or permanent `will-change` layers were added. Real-device frame-time profiling was not performed.

## Final verification

| Command / check | Result |
| --- | --- |
| `npm run build` | Passed; JS 492.43 kB / 148.70 kB gzip; CSS 61.26 kB / 12.13 kB gzip |
| `npm run test:run` | 42 tests passed in 10 files |
| `npm run test:browser` | 15 passed; all previous 11 browser tests preserved |
| Responsive browser checks | 360, 390, 768, 1024 and 1440px; no horizontal overflow in tested flows |
| Reading preferences | Maximum 32px text and 0.12em letter spacing; light/dark themes and dialog reflow checked |
| Accessibility | Axe checks on selected landing, reader, SourceLens, glossary, feedback and result states; keyboard, focus restoration, reduced motion exercised |
| Impeccable mechanical detector | No findings (`impeccable-detector.json`) |
| `git diff --check` | Passed |

The first iteration exposed enlarged-text overflow at 360px and temporary contrast loss during fade-ins. Both were fixed in the implementation. No contrast rules or regression assertions were disabled.

Manual screenshot inspection covered the landing, scan, reader, SourceLens, settings, question, feedback, retry comparison, mobile navigation, and midnight theme. This is not full accessibility certification or physical-device verification. Native camera behavior, audible speech, Safari, screen readers, and real mobile performance remain outside this visual verification pass.

No backend, API contracts, validators, capability gates, assistance tracking, or learning reducer changes were made during this redesign. The prior backend result remains 879 passed; backend tests were not rerun for CSS/presentation changes. No live AI calls, dependency installations, deployment, staging, commits, push, reset, or Git history changes were performed.

## Connectivity diagnosis

Before the environment restart, a real Chromium request to `http://127.0.0.1:8000/api/health` returned HTTP 200 with `Access-Control-Allow-Origin: http://127.0.0.1:5173`. After restart, curl and Chromium both reported connection refused at port 8000. The backend process was no longer listening. The current server-unreachable message is accurate; the design does not bypass it or substitute sample responses.

The browser reported `filter: none` and `color-scheme: light`; the old olive appearance was present in the application's own CSS. Browser extensions or display transformations in another user profile were not inspected.

Restart using your existing backend configuration (the command does not enable capabilities):

```bash
cd /home/BYE/Nothing/MindBridge/backend
MINDBRIDGE_ENV=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

In another terminal:

```bash
cd /home/BYE/Nothing/MindBridge/frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 5173
```

Approved synthetic integration configuration remains documented in `../README.md`. Healthy connectivity does not itself grant release approval or resolve semantic learning acceptance.

## Changed source areas

New: `src/components/home/ProductPreview.jsx`, `src/components/home/RepairDemo.jsx`, `src/styles/experience.css`, `tests/e2e/visual.spec.js`, `tests/design-check.mjs`, and this evidence directory.

Updated: `src/styles/{tokens,global,reading}.css`; `src/pages/{HomePage,ScanPage,ReaderPage,LearningPage,MissingPage}.jsx`; shared components under `src/components/common`; layout `AppShell.jsx` and `SiteHeader.jsx`; presentation components under scan, reader, settings, source-lens, glossary, speech, and understanding. Most secondary component edits replace literal colors with semantic tokens. Existing backend and integration modifications in `git status` predate this visual task.

To refresh final captures from the frontend directory:

```bash
MB_CAPTURE_DIR="$PWD/design-review/after" npm run test:browser
```

The evidence directory is outside `public/` and is not imported by the application, so it is excluded from the production build.
