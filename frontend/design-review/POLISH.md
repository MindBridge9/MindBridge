# Targeted critique fixes

All five priority findings from the completed critique, plus the two undersized touch targets, are addressed.

- Reading actions now precede the document on mobile/tablet and stay beside it on desktop. Primary actions and secondary glossary/explanation tools share callbacks and capability checks. No new sticky toolbar covers reading text; scroll padding reserves space for the existing speech dock.
- Original / Simplified is the single mode control. Selecting Simplified uses the existing `easy` backend level, cache, cancellation, errors and request matching. The redundant generation/view button was removed; explicit retry remains available on errors. Original remains selectable while a request is pending.
- Follow-up actions now follow the corrective explanation, before criterion cards. Submitted answers and source quotations can be expanded. Uncertainty, concept statuses, actual feedback and source evidence remain available; assistance and assessment logic are unchanged.
- Student labels use extracted text, understanding criteria, and missing/changed details. Learning sections show ordinal numbers. Internal source references remain in optional Reference disclosures; original source and generated strings are never rewritten by the UI.
- Eligible in-memory Continue learning appears above the hero. No saved-page feature was enabled. Existing default `cream` preference already maps to the near-white Light theme; saved dark/paper preferences remain respected. Browser regression verifies default and saved dark restoration.
- Landing preview tabs and summary-source disclosures now have at least 44px vertical targets.

## Verification

- `npm run build`: passed.
- `npm run test:run`: 42 passed, 10 files.
- `npm run test:browser`: 16 passed, including all existing 15 scenarios and one new focused regression. Existing selectors were updated for intentional labels/roles; no assertions were removed.
- Browser checks retain responsive widths 360/390/768/1024/1440, enlarged text, dark theme, reduced motion, keyboard interaction, error recovery, cached review, and assisted retry.
- New regression checks mobile actions before document, follow-up before concept breakdown, evidence expansion, one Simplified mode control, active-session return before hero, saved dark restoration, and measured 44px targets.
- Actual screenshots inspected: [mobile reader](polish/390/reader.png), [mobile repair](polish/390/feedback.png), [desktop reader](polish/1440/reader.png). Additional screenshots are under `polish/390` and `polish/1440`.
- `git diff --check`: passed.
- Impeccable detector: two warnings in the existing report gallery `index.html` for image sources assigned by JavaScript. These are report-only artifacts, not application source findings; production bundles exclude the gallery.

Files touched: ReaderPage, ReaderTools, ReadingModeControl, HomePage, LearningPage, FeedbackView, SourceEvidence, SourceQuote, SourceLensDialog, ReaderCanvas, UnderstandingForm, ProductPreview, RepairDemo, experience.css, source-lens unit-test selectors, journey/visual browser-test selectors and regression coverage, plus this handoff. Wire contracts, backend, source validation, learning reducer and release gates remain unchanged.

No new dependencies, live AI calls, reviewers, deployment or Git operations were used. Physical-device camera/audio, screen-reader and real mobile speech/highlighting behavior were not verified in this pass; Chromium layout and accessibility checks are not full certification.
