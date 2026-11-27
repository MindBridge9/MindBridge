# White-first creative design and motion pass

Open the [actual before/after gallery](creative.html). Baseline screenshots show the running application immediately before this creative pass, after the previous usability fixes. Final captures use identical nonpersonal synthetic API responses. They are UI evidence, not live provider acceptance results. Evidence is outside `public/` and is not imported by the application.

## Visual system

The default canvas is pure white `#FFFFFF`. Supporting surfaces use `#F8F9FC` and `#F5F3FF`, actions use `#4F46E5`, headings use `#111827`, body text uses `#475569`, and subtle borders use `#E2E8F0`. Colors and specimen roles are centralized in tokens. The persisted `cream` enum remains the default Light presentation; it now renders white. Existing dark and paper selections are preserved without modifying preference validation or storage.

Chromium asserted `rgb(255, 255, 255)` on the app canvas, header, reader article and settings dialog at 320, 360, 390, 768, 1024 and 1440px, and on the learning canvas. Recorded [desktop](creative-after/1440/computed-theme.json) and [mobile](creative-after/390/computed-theme.json) values include the canvas color, Manrope font family, heading size and `filter: none`. Dark mode is checked separately.

The landing now uses an asymmetric editorial hero and a layered passage/SourceLens composition. Highlighted terms carry the relationship between original and simplified wording. A compact process line adapts to a connected vertical learning journey on phones. The repair demonstration adds a labelled illustrative follow-up-answer comparison. A contextual definition demonstration opens in place and restores focus when closed. Detail comparison gives FactGuard a concrete number/unit illustration without fabricating a detected warning. The reading specimen is bright rather than a dark block. Closing actions and the footer share the new visual language.

The scan surface has refined framing, image depth and an indeterminate scan sweep only while `/api/read` is pending. The reading workspace, settings, speech dock, SourceLens and learning surfaces use white chrome, quieter borders and selective accent surfaces. Reading content remains stable. Mobile Simplified/Practice placement and the follow-up action immediately after repair are preserved. Results compare the actual initial and follow-up answers with Then/Now labels; no outcomes are synthesized by the styling.

## Motion implementation

No new dependencies were installed. CSS handles simple state transitions; the Web Animations API handles small, interruptible surface movements. No per-frame React updates, animated layout dimensions, blur animation, decorative infinite background motion or animation library was added.

| Before | After | Purpose |
|---|---|---|
| Static product presentation | Short hero movement and layered reading/evidence composition | Establish the passage-to-source relationship |
| Static source marks | Transform reveal of highlight backgrounds when mode changes | Keep related energy/glucose terms easy to trace; text never fades |
| Static feature sections | Once-per-section 380ms movement on intersection | Introduce the next explanatory section without hiding content |
| Immediate demo-state replacement | 220ms surface movement, cancelled on a new state | Signal original/simplified, definition and illustrative comparison changes |
| Generic pending scan | Indeterminate sweep during the real pending request | Indicate activity without invented percentages or completed stages |
| Static learning states | 220ms movement of the stage container | Orient the learner as the workflow changes; child surfaces do not enter separately |
| Unchanging header boundary | Observer-driven boundary after scrolling | Keep navigation distinct from scrolling content without per-frame updates |

All content starts readable and interactive. Text retains full contrast during movement. Keyboard input cancels programmatic motion; keyboard-triggered controls have immediate state changes. Reduced motion skips programmatic movement and stops the scan sweep. Short CSS press feedback, segment indicators, evidence chevrons and dialog entrances remain consistent with the existing system. Browser tests verify transform-only preview keyframes, keyboard interruption, reduced-motion absence, and sweep cancellation. These establish implementation behavior, not a physical-device frame-rate benchmark.

## Final verification

| Check | Result |
|---|---|
| `npm run build` | Passed; JavaScript 498.72 kB / 150.28 kB gzip; CSS 82.38 kB / 15.52 kB gzip |
| `npm run test:run` | 42 passed across 10 files |
| `npm run test:browser` | 25 passed; all existing 16 scenarios preserved |
| Responsive checks | 320, 360, 390, 768, 1024, 1440px; no horizontal overflow in tested states |
| Enlarged reading | 32px text and 0.12em spacing tested at all six widths with dark settings |
| Accessibility | Existing axe checks, keyboard/focus tests and 44px regressions pass; new definition close restores trigger focus |
| Motion | Transform-only movement, keyboard interruption, reduced motion and pending-scan cancellation tested |
| Console/runtime | Existing browser journey checks report no page errors; no live provider requests used |
| Source detector | One rounded-card accent-border warning was found and its thick border removed |
| `git diff --check` | Passed |

Initial iteration caught overlapping mobile journey labels; final tests assert label/detail separation at every width. Computed-color checks initially sampled a detached element during navigation; waiting for the new screen corrected the test without changing the color requirement. No assertions or capability gates were weakened.

Actual screenshots inspected during development: landing desktop/mobile and dark theme, reader desktop/mobile, SourceLens, settings, question, repair, follow-up, comparison, and pending scan. [Hero crop](creative-after/1440/hero-demo.png), [mobile reader](creative-after/390/reader.png), [mobile repair](creative-after/390/feedback.png), [comparison](creative-after/1440/results.png), [follow-up](creative-after/390/follow-up.png), [scan processing](creative-after/scan-processing.png).

Physical phones, Safari, screen readers, audible speech and real-device animation performance were not tested. Automated checks are not accessibility certification. Live AI reliability, student release and remaining semantic acceptance gates are unchanged; the earlier 879 backend result was not rerun for this frontend-only task.

## Files

New source: `src/styles/creative.css`, `src/hooks/useSurfaceMotion.js`, `src/components/home/ContextDemo.jsx`.

Updated source: `src/styles/{tokens,global,experience}.css`; `src/components/home/{ProductPreview,RepairDemo}.jsx`; `src/pages/{HomePage,ScanPage,LearningPage}.jsx`; `src/components/layout/{AppShell,SiteHeader,SiteFooter}.jsx`; `src/components/scan/ImagePreviewCard.jsx`; `src/components/understanding/LearningResults.jsx`.

Updated browser evidence: `tests/e2e/visual.spec.js` and this directory's creative gallery, before/after captures and computed-theme records. PRODUCT.md, DESIGN.md and private planning were not regenerated. Backend, contracts, API validation, learning reducers, assistance tracking and release flags were not changed. No Git mutation, deployment, billing, live AI calls, new reviewers or dependency installations were performed.
