# Illustrated Motion implementation

This pass preserves the pure-white default canvas and indigo brand. It introduces centralized lavender, sky, mint, and peach tokens with optional dark-theme counterparts. Manrope interface and configurable Lexend reading typography remain intact.

## Implemented

- Replaced the former documentation-like hero with a custom SVG botany illustration inside a bound textbook page, a layered simplified reading sheet, preserved-term annotation, and exact illustrative SourceLens quotation.
- Motion variants choreograph the source and reading sheet. Their springs respond to reading-mode changes and pointer hover. SVG paths draw the source relationship; supporting evidence uses AnimatePresence. Examples remain explicitly illustrative.
- Added distinct colored compositions for conceptual repair, contextual definitions, reading comfort, and detail comparison. Main application backgrounds remain white.
- Shared MotionConfig and a reactive reduced-motion subscription coordinate movement. Keyboard interaction disables decorative motion. Shared-layout tab indicators, button press feedback, dialog entrances, image-preview entrances, native evidence disclosure transitions, learning-stage changes, and comparison movement retain existing controls and semantics.
- Removed the previous Web Animations hooks and overlapping CSS entrances. Native dialogs close immediately and restore focus; animations never postpone essential actions.
- Declared the user's existing Motion 14.14.0 in the frontend manifest and lockfile. No additional animation library was introduced. npm ci reported zero known vulnerabilities.

## Evidence

Open [the interactive comparison gallery](motion.html). It pairs actual before and after Chromium screenshots at 1440px and 390px for landing, hero, scan, image preview, reader, SourceLens, settings, question, repair, follow-up, comparison, and dark-theme views. API responses in browser tests are explicitly synthetic. No live AI requests were made.

Chromium verifies responsive reflow at 320, 360, 390, 768, 1024, and 1440 pixels; white canvas/dialog/reader backgrounds; enlarged text and letter spacing; keyboard navigation; focus restoration; reduced-motion changes; source disclosure; assistance preservation; error recovery; and existing learning journeys. Automated axe checks cover the tested surfaces, not accessibility certification. Computed canvas is rgb(255, 255, 255), filter none, interface font Manrope.

## Checks

- npm run build: passed. Main JS bundle approximately 649 kB, 202 kB gzip. Vite retains its >500 kB chunk advisory; code splitting is a remaining optimization.
- npm run test:run: 42 passed across 10 files.
- npm run test:browser: 25 passed (57.1 seconds). All existing functional tests retained; the previous animation test now targets the Motion container and checks interruption plus live reduced-motion changes.

Backend application code, public API contracts, learning validation, release flags, and persistence gates were not changed during this pass. Prior unrelated working-tree changes are preserved. No physical-device speech or animation frame-rate certification is claimed.
