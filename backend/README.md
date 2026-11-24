# MindBridge backend

Python 3.12, FastAPI and the official Google Gen AI SDK. Current routes: `GET /api/health` and `POST /api/read`. No database, stored uploads or frontend changes. No automatic sample/fixture fallback.

## Run and test locally

From the repository root:

```bash
cd backend
MINDBRIDGE_ENV=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Keep credentials in ignored `backend/.env`; see `.env.example` for names. Process environment overrides the file. The existing virtual environment uses persistent Python 3.12.16 under `~/.local/share/mindbridge/python/`; dependencies remain pinned in the existing requirement locks.

Swagger UI: open <http://127.0.0.1:8000/docs>, expand **POST /api/read**, select **Try it out**, choose one JPEG, PNG or WebP in the `image` field, then **Execute**. The schema is at <http://127.0.0.1:8000/openapi.json>. B01 explicitly disabled Swagger; it is now enabled only when `MINDBRIDGE_ENV=development`. In production both documentation URLs return the safe 404 envelope.

Using curl:

```bash
curl --max-time 90 --include \
  --form 'image=@/absolute/path/to/page.png;type=image/png' \
  http://127.0.0.1:8000/api/read
```

Use `type=image/jpeg` for JPEG or `type=image/webp` for WebP. Do not set a multipart boundary or send a Gemini key from the client. Each upload invokes Gemini; use non-personal, permitted samples and avoid repeated calls. A synthetic sample from the B03 check is available locally at `/tmp/mindbridge-b03-page.png` while that temporary file exists.

Automated tests (no provider calls):

```bash
.venv/bin/python -m pytest app/tests -q
```

With the private planning pack present, include its opt-in schema/fixture checks:

```bash
MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q
```

Private pack tests are skipped by default and are not a public CI dependency. Manual live smoke, only when permitted and quota is available: `.venv/bin/python -m app.tests.smoke_read`. It performs one logical OCR upload with at most two provider attempts, prints safe metadata/checks only and exits nonzero on failure.

## OCR behavior and limits

- Exactly one multipart `image`; JPEG, PNG or single-frame WebP. Actual content must match MIME. Maximum file 8 MiB, total body 9 MiB, decoded pixels 20 million, each dimension 10,000 pixels. Entire body is capped before multipart parsing, including requests without a reliable Content-Length.
- Pillow verifies and fully decodes off the event loop. EXIF orientation is applied and a fresh raster is encoded without EXIF/GPS/text/ICC metadata. Normalized provider images must also fit 8 MiB. Files and buffers close on success and error; no retained upload directory.
- Gemini transcribes visible ordered source blocks, with headings, paragraphs, list markers and captions. Python assigns page UUID/time and page-scoped chunk IDs `c0001` onward. Long blocks split at sentence boundaries without dropping or changing characters; material exceeding preservable limits returns an explicit unsupported error.
- Readable/partial/unreadable results follow the wire contract. Uncertain fragments remain explicitly uncertain; no clear usable source yields `page: null` and retake guidance. Original OCR is separate from generated summary, key terms and contextual glossary. Original OCR can still contain model errors; review the image when accuracy matters.
- Source references must be exact quotations in clear source chunks. Key terms must occur at word boundaries in every referenced clear chunk. Invalid optional enrichment is discarded independently without another OCR call. Missing term metadata is marked unavailable.
- One shared async Gemini client is opened and closed by application lifespan. The read deadline is 75 seconds with the existing 45-second per-call ceiling and at most two attempts. No provider automatic retries, continuation, tools, Files API, model fallback or billing changes.

## B03 verification and remaining gates

Final B03 full private-pack suite: **196 passing tests**, with the existing Starlette/httpx deprecation warning. B01/B02 regression checks pass. HTTP checks verified development Swagger/OpenAPI 200 and health 200; production docs are covered by tests. Swagger's rendered browser interaction and frontend/phone integration have not been manually tested.

Live model: `gemini-3.5-flash-lite`, official SDK 2.34.0. On 2026-11-24 UTC (2026-11-25 IST), a synthetic image containing a heading, paragraph, numbered unit, list item and caption was submitted:

| Attempt | Observation | Elapsed time |
|---|---|---|
| Initial real HTTP upload | API 502; provider rejected request configuration | 1.385 s |
| Diagnostic upload at 18:40:37 UTC | Provider 400 INVALID_ARGUMENT; allowlisted diagnostics confirmed schema complexity | 2.346 s total; provider 2.314 s |
| After internal schema simplification at 18:41:08 UTC | API 503 AI_UNAVAILABLE; both provider attempts returned 503 | 5.207 s total; provider 3.280 / 1.642 s |

The schema fix removes array/numeric bounds from the provider-only generation schema to reduce grammar state complexity, following [Google's guidance](https://aistudio.google.com/docs/structured-output#simplifying-complex-schemas). All local bounds and public schemas remain unchanged. No more live requests were made after the two 503 responses. Safe diagnostics are in `/tmp/mindbridge-b03-schema-rejection.json` and `/tmp/mindbridge-b03-evidence.json`.

At this initial checkpoint no live PageDoc was returned. The repair below supersedes that OCR observation. Existing B02 feedback failures and unverified account billing tier/quota remain unresolved. Health deliberately keeps `read: false` and all other AI capabilities off pending integration review. B04 has not started. Student deployment remains subject to the separate provider and child-data release review.

### B03 live failure investigation and repair

Verified on 2026-11-24 UTC / 2026-11-25 IST with the same non-personal synthetic image, persistent Python 3.12.16 and locked SDK 2.34.0. No dependencies, public contracts, model defaults, credentials, billing or Git state were changed by this repair.

| Controlled check | Result | Seconds |
|---|---|---:|
| Configured 3.5 Flash-Lite metadata | Accessible; generateContent supported | 0.208 |
| Minimal text, 3.5 Flash-Lite | Passed | 1.109 |
| Simple image transcription, 3.5 Flash-Lite | Passed; known number/unit retained | 0.936 |
| Previous nested OCR grammar, 3.5 Flash-Lite | Provider 503, overload category | 1.614 |
| 3.1 Flash-Lite metadata / same nested OCR grammar | Metadata accessible; generation 503, overload category | 0.096 / 2.044 |
| Same nested grammar with references inlined | Provider 503 | 1.298 |
| Core-only constrained grammar, unchanged 8192-token/default-thinking settings | Valid page; partial enrichment | 3.302 |
| Core grammar, 2048-token diagnostic ceiling, explicit MINIMAL thinking | Valid page; partial enrichment | 2.993 |
| Actual endpoint, 8192 tokens, explicit MINIMAL thinking | HTTP 200; exact synthetic source; first provider attempt | 3.050 |
| Actual curl upload to Uvicorn with final configuration | **HTTP 200; valid PageDoc; exact synthetic source** | **3.089499** |

Confirmed failure domain: Gemini structured-generation serving, with overload 503 responses on requests whose minimal text/image controls succeeded. Earlier bounded nested grammar also produced a confirmed schema-complexity 400. Inlining references alone did not help. Constraining the source core and validating optional enrichment independently produced successful results without changing SDK, model, key or deadline. The provider's internal reason for the 503s is not exposed, and some 503s still occurred after simplification; this is not proof that every failure was caused by schema complexity or that explicit thinking alone cures provider overload.

Changes: remove optional enrichment's nested grammar and unused definitions from the internal provider schema; send its code-derived shape as trusted instructions; keep strict, independent Pydantic/quote/term validation locally. OCR prompt version is now `ocr-v2`. Set `thinking_level=MINIMAL` explicitly for read operations on the two verified Flash-Lite IDs. Keep the approved 8192-token read ceiling, 75/45-second deadlines, and maximum two total attempts. No silent model fallback or mock success. Reduced-token probes were diagnostic only; the production ceiling is unchanged. Both models document minimal thinking as the default; these observations do not demonstrate thinking-token exhaustion.

The final network response contained five clear chunks (heading, two paragraphs, list item and caption), available key-term metadata with five terms, and exact original wording/numbers/units. Enrichment was correctly marked `partial`: generated summary/glossary were unavailable after local validation. No valid result was invented to hide those failures. Safe acceptance metadata is in `/tmp/mindbridge-b03-fixed-validation.json`. One clean synthetic page does not establish broader OCR accuracy or educational quality.

Regression command: `MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q` — **197 passed**, one existing Starlette/httpx deprecation warning, no skips. The alternative model was tested explicitly; `.env` remains unchanged and the configured model remains `gemini-3.5-flash-lite`. B02 feedback/account-quota and frontend integration gates remain open. `read` stays false pending review. No B04 work.

## B04 source validation and basic FactGuard

Implemented as deterministic Python utilities; no new endpoint, provider call, model change or capability activation. OCR code and approved wire schemas remain unchanged. The earlier B02/B03 quality, provider, enrichment and integration limitations remain open.

`app.validation.sources` provides:

- `validate_source(source)`: required metadata, Pydantic fields/limits, unique page-scoped chunk IDs in reading order, 12,000-character context limit, and unique terms with valid clear-chunk membership. Unavailable terms require an empty array; missing metadata fails validation.
- `require_chunk(source, chunk_id, clear=True)`: reject dangling selections and reject uncertain passages as generation evidence. Uncertain original text can still be retained/read with `clear=False`.
- `select_source(source, chunk_ids)`: a new context in original order with key-term references filtered to the selected clear subset; availability is preserved, including valid empty metadata.
- `validate_references(source, references, page_id=None, generated=True)`: reject malformed/duplicate/dangling references, wrong output page IDs, uncertain evidence and quotations whose wording, punctuation, case or whitespace differs from the exact source substring. Different quotations from one chunk are allowed. Pass `generated=False` for request references. Use a selected context to restrict permitted evidence to that subset.
- `phrase_present` / `phrase_span`: the same Unicode casefold/word-boundary policy used by B03, with original-string offsets even for casefold expansions. Returned source evidence is never normalized.

Invalid request relationships use safe `VALIDATION_ERROR` 422 errors; uncertain selections use `INSUFFICIENT_SOURCE` 422; invalid generated references use retryable `AI_INVALID_RESPONSE` 502. The caller must reuse its existing bounded provider attempt budget for any repair. These checks do not authenticate client-carried source content.

`app.validation.facts.check_facts(source, chunk_id, generated_text, explicit_details=())` returns an internal `FactGuardResult` containing typed `OmissionWarning` values, supplied terms retained in generated text, and `terminology_check_status`. It checks signed/decimal/grouped/scientific numbers, percentages, known number–unit pairs, recognizable dates, and explicitly supplied terms. A changed-number warning requires a unique replacement with unchanged surrounding wording; ambiguous correspondence becomes a missing-number warning with no invented replacement. Units detached from their original numbers are flagged even when the individual tokens remain elsewhere.

Supported exact rational conversions cover the listed SI length, mass, volume, time, area, speed, pressure, energy, density and temperature units/aliases. ISO dates and English month formats can match across equivalent formatting. Ambiguous numeric date order is not guessed. Every warning value is an actual source/output substring. More than 30 distinct warnings or an unrepresentable warning fails explicitly rather than being silently truncated; pathological numeric inputs are bounded.

Name/key-detail checks require an internal `ExplicitDetail(phrase, kind)` classification (`name` or `key_detail`) of an existing validated source term. No entity detector, inferred names or new request fields are introduced. Other omitted supplied terms use `missing_term`. Available empty metadata is `checked`; unavailable metadata stays `unavailable`. Numeric checks still work when terminology is unavailable.

These are lexical preservation signals, not proof of factual errors or complete semantic verification. Unsupported units, paraphrases, abbreviations, rounded conversions, word-written numbers and unrecognized date formats can produce warnings or escape detection. Repeated identical values are not proof that every semantic relationship was retained. All warnings advise comparison with the original; an empty warning list never establishes universal fact preservation.

Verification: `cd backend && MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q` — **306 passed**, no skips, one existing Starlette/httpx deprecation warning (6.10 s). This includes all 197 prior tests and 109 B04 cases. The approved synthetic omission fixture returned `missing_number` for `20` and `missing_unit` for `mL`. The previously recorded live B03 PageDoc validated offline with five source chunks and five terms; no new live AI call was made. `git diff --check` passed. B04 utilities are ready for B05 integration; simplification and new feature activation have not begun.
