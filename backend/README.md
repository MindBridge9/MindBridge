# MindBridge backend

Python 3.12, FastAPI and the official Google Gen AI SDK. Current routes: `GET /api/health`, `POST /api/read` and `POST /api/simplify`. No database, stored uploads or frontend changes. No automatic sample/fixture fallback.

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

## B05 easy simplification and SourceLens

`POST /api/simplify` accepts the approved `SimplifyRequest` and returns `SimplificationResult`. P0 supports `easy` for 1–3 unique clear chunks. `guided` returns 501 `FEATURE_UNAVAILABLE`; `original` and unknown levels fail schema validation with 422 (original reading never needs an AI request). JSON content type and the 256 KiB body cap are checked before model parsing, including streamed bodies without Content-Length.

The versioned `simplify-v1` trusted prompt requests short English sentences and familiar vocabulary for Classes 6–10, while retaining academic terms, source facts, names, conditions, numbers, dates and units. Source text stays JSON-encoded untrusted data. Only selected clear chunks and their filtered term metadata are sent. No source data is mutated.

The shallow provider schema asks only for chunk ID, simplified text and string quotations. Python validates exact quotations against each item's original chunk with B04 SourceLens utilities, enforces one item per selected ID, returns items in request order, and calculates FactGuard warnings/preserved terms/status itself. Model-authored warnings or preservation claims are rejected. Reference and FactGuard failures share the adapter's bounded repair budget, not a separate retry loop. Valid omissions remain visible as possible-issue warnings; unavailable term metadata never becomes a successful terminology check.

Generation uses the same configured `gemini-3.5-flash-lite`, official SDK 2.34.0, explicit MINIMAL thinking for supported Flash-Lite IDs, 4096 output tokens, 35-second total/15-second per-call limits and at most two attempts across all provider/schema/reference failures. Refusal/exhausted-quota failures are not retried. Existing error envelopes preserve safe recovery; the consumer must retain the original source and draft on failure. There is no fixture fallback or bulk generation.

### Test through Swagger

From the repository root:

```bash
cd backend
MINDBRIDGE_ENV=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Open <http://127.0.0.1:8000/docs>, expand **POST /api/simplify**, select **Try it out**, paste this synthetic request, then select **Execute**:

```json
{
  "source": {
    "page_id": "11111111-1111-4111-8111-111111111111",
    "chunks": [
      {
        "id": "c0001",
        "kind": "paragraph",
        "text": "Green plants use light energy from sunlight to make glucose from carbon dioxide and water during photosynthesis.",
        "quality": "clear"
      }
    ],
    "key_terms": [
      {"term": "glucose", "chunk_ids": ["c0001"]},
      {"term": "photosynthesis", "chunk_ids": ["c0001"]}
    ],
    "key_terms_status": "available"
  },
  "chunk_ids": ["c0001"],
  "level": "easy"
}
```

A successful response has the same `page_id`, `level: easy`, and one item with text, exact `source_refs`, deterministic `preserved_terms`/`warnings`, and `terminology_check_status: checked`. Output wording varies. With unavailable metadata, send `key_terms: []` and `key_terms_status: unavailable`; the result must say `unavailable`. Each Execute sends a provider request. A 503 is a real provider failure; preserve the source and try later. Production documentation stays disabled.

### B05 verification evidence

Final regression command: `MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q` — **357 passed**, no skips, one existing Starlette/httpx deprecation warning (11.43 s). All 306 previous tests pass plus 51 B05 cases. Coverage includes request/output validation, own-chunk exact evidence, omission warnings, metadata states, three-chunk ordering, source immutability, refusal/quota/timeout/503 handling, CORS recovery, body limits, and mixed-error retry limits. An initial test expectation for `original` was corrected to match the approved enum; no schema was changed. Compilation and `git diff --check` passed.

Real HTTP tests used original synthetic photosynthesis text/image and unchanged model configuration on 2026-11-24 UTC / 2026-11-25 IST:

| Live check | HTTP/result | Latency |
|---|---|---:|
| Fresh image → `/api/read` | 200, readable PageDoc; enrichment unavailable | 4.105 s |
| That PageDoc → `/api/simplify` | 200, three items; exact clear references and deterministic checks validated; original source unchanged; terminology honestly unavailable | 2.725 s |
| Separate synthetic request with explicit term metadata | 200, one item; five supplied terms preserved; status checked; exact references; no warnings | 1.257 s |

Three logical live requests were made; no HTTP-level automatic retries or model changes. No 503 occurred in these checks, which does not resolve the known intermittent-provider limitation. Evidence contains safe metadata only at `/tmp/mindbridge-b05-evidence.json` and `/tmp/mindbridge-b05-evidence-standalone.json`. The optional manual runner is `.venv/bin/python -m app.tests.smoke_simplify` against a separately running local server on port 8765; `--standalone` sends one synthetic simplification without OCR. It is never collected by pytest. Any read failure is reported separately rather than hidden by a sample response.

B05 backend behavior is ready for frontend integration and B06 dependency use after review. Capabilities/release flags remain off pending Owner 4 integration approval. B02 feedback/account-quota verification, B03 intermittent 503/incomplete enrichment and student release gates remain unresolved. FactGuard is lexical and conservative, not a semantic accuracy guarantee; these synthetic smoke checks do not establish educational effectiveness or broad reading quality. No frontend files or private planning documents changed; no B06 work.

## Gemini reliability investigation — 2026-11-25

Status: adapter hardening complete; live reliability remains an open gate. Configured
model remains `gemini-3.5-flash-lite`, SDK 2.34.0. No B06, frontend, public schema,
provider, dependency, billing or capability changes. Existing working-tree changes
were preserved.

Normal single-worker Uvicorn (not a monkeypatched diagnostic server), using the
same `.env` loader and virtual environment, produced these synthetic HTTP results:

| Check | Read HTTP / seconds / retries | Simplify HTTP / seconds / retries |
|---|---|---|
| Pipeline 1 | 503 / 6.383 / 1 | Not sent |
| Standalone | Not sent | 200 / 9.374 / 1 |
| Pipeline 2 | 200 / 3.236 / 0 | 200 / 1.831 / 0 |
| Pipeline 3 | 200 / 4.084 / 0 | 503 / 5.295 / 1 |

Pipeline success: **1/3**, a small observational sample, not a reliability estimate.
Six logical endpoint calls used nine provider attempts: four successful attempts,
five upstream 503s. All five errors contained overload/high-demand/capacity wording;
last two explicitly logged upstream `UNAVAILABLE`. No Retry-After, 429, local
validation failure or timeout was observed. Successful simplifications passed exact
SourceLens references, deterministic FactGuard checks and source immutability.
Standalone retained all five supplied terms. OCR enrichment remained partial or
unavailable. Live calls stopped after the third pipeline; Uvicorn shut down cleanly.

Confirmed failure boundary: upstream Gemini serving, before local output validation.
Identical OCR input and schema failed and subsequently succeeded; standalone
simplification failed then succeeded with the same request on its retry. OCR used
25,244 image bytes and a 1,317-byte provider schema; simplify used the same 433-byte
schema with 630 standalone / 706 successful pipeline / 606 failed pipeline JSON
input bytes. Smaller input also failed. Successful output token counts were 106
(standalone), 558/198 (pipeline 2), and 593 (pipeline 3 OCR), well below 8192/4096
ceilings. Thinking usage was absent, which does not prove zero thinking tokens.
There is no evidence here that payload size, thinking limits, consecutive calls,
quota, or connection reuse caused the failures. Google's internal serving reason
and account quota remain unobservable. Previous temporary diagnostic evidence files
were absent in this session; historical conclusions come from the recorded README.

Central changes in `app/ai/client.py`:

- Replace fixed 250 ms retry delay with bounded exponential delay plus jitter,
  starting at 1–2 seconds (aligned with the installed SDK's retry strategy).
  Still only two total attempts; SDK retries and continuation remain disabled.
- Honor numeric/date Retry-After and structured RetryInfo across transient errors.
  Use the larger hint; never shorten an oversized hint to fit the deadline.
  Public retry hints remain within the contract's 1–86400 seconds, otherwise null.
- Require budget for a complete per-call ceiling after waiting, including queue
  time in the shared deadline. A slow OCR failure may therefore have no retry.
- Distinguish safe upstream categories from transport, timeout and local validation
  failures in metadata logs. Auth/permission/model/precondition errors are not
  user-retryable; 408/504 map to AI_TIMEOUT. Unknown/daily quota never auto-retries.
- Log generated call ID, operation, attempt, sizes/schema hash, upstream status,
  duration, retry decision and available token/truncation metadata. Never log raw
  exceptions, prompts, source, images, answers, keys or provider response text.

One async HTTPX client was already reused and closed correctly; aiohttp is absent.
SDK source confirms `attempts=1` disables its retry loop. No lifecycle modification
was warranted. `Settings.from_env()` uses an absolute `.env` path; no model/key
process override was present. TestClient diagnostics use wrappers and can override
thinking; `diagnose_read` can override model/schema/tokens, so they are not identical
to production. This investigation used ordinary Uvicorn for all reported live runs.
`smoke_simplify` now stops on OCR failure and exits unsuccessfully for an incomplete
pipeline instead of automatically issuing a separate synthetic simplification.

Guidance checked: [Google retry strategy](https://aistudio.google.com/docs/troubleshooting#retry-strategy),
[structured output](https://aistudio.google.com/docs/structured-output), and
[project/model quotas](https://aistudio.google.com/docs/rate-limits). Retry hardening
cannot repair a provider outage; the observed recovery does not prove jitter caused it.

Fallback recommendation: rehearse a visibly labelled, previously captured synthetic
sample for the demo, explicitly separate from live AI; retain original reading and
show honest retry recovery on live failures. No automatic sample substitution was
added. A separately approved, manually selected alternative Gemini model via the
existing GEMINI_MODEL setting is simpler than an automatic fallback. Validate its
image/structured output, SourceLens and quality first. Prior 3.1 Flash-Lite failures
mean that specific alternative is not established as more reliable. Model limits
vary but are project-scoped, so another key is not a quota workaround. An automatic
fallback, if later justified, must consume the existing second attempt and shared
deadline, never a fresh retry budget; do not trigger it on auth/daily quota errors.
No fallback model/provider is enabled. Actual quota dashboard and provider/student
release reviews, broader OCR quality and frontend integration gates remain open.

Final regression: `MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q`
— **373 passed**, no skips, one existing Starlette/httpx deprecation warning, 57.57 s.
This retains the original 357 cases and adds 16 targeted cases. The first run had
two old timing expectations fail; these were updated for jitter and the full-call
budget rule. Compilation and `git diff --check` pass. Synthetic unit tests prove
adapter behavior, not provider uptime or educational quality. B06 should not be
represented as having a passed live reliability prerequisite; stop for lead review.

## Groq integration — 2026-11-25

Local testing now selects `AI_PROVIDER=groq` in ignored `backend/.env`.
Set `GROQ_API_KEY` there and `GROQ_MODEL=qwen/qwen3.8-27b`. The template includes
these names without credentials. `AI_PROVIDER=gemini` selects the existing
`GEMINI_API_KEY` / `GEMINI_MODEL`; there is **no automatic failover**. When
AI_PROVIDER is absent, the historical Gemini default is retained. Environment
variables override the file. No dependencies, public contracts, prompts, service
validation, frontend, capability flags or billing were changed.

`app/ai/providers.py` defines the structural generation interface and factory.
The existing lifespan opens/closes one selected adapter; its `state.gemini` slot
is retained as a legacy internal name for compatibility. Groq uses one pooled
HTTPX AsyncClient at the fixed HTTPS chat-completions endpoint, redirects disabled,
with backend-only Bearer authentication and inline base64 images. It shares the
existing safe errors, jitter/backoff and Retry-After parsing helpers, deadlines,
concurrency limit and maximum two total attempts. There are no HTTP transport
retries, tools, streaming, continuations or persistent chats. Daily quota does not
auto-retry; short rate limits require a provider delay. The request queue and
backoff consume the total deadline. Large delay hints are never shortened to fit.

Groq strict JSON uses the underlying Pydantic schema rather than Gemini's relaxed
OCR grammar: every object is closed, every property required, and nullable fields
retain null unions. Provider string/numeric/array bounds are removed; strict local
Pydantic and all SourceLens/FactGuard validation remain authoritative. OCR enrichment
has a typed provider schema and still validates independently locally. Unstructured
text generation also works. Malformed envelopes/JSON, truncation, refusals, tool
calls, timeouts, permanent configuration errors and transient failures fail safely.
Safe logs include attempt count, timings, status/category and numeric quota headers;
no credentials or raw provider/request content are logged.

Official documentation verified:
- [Strict schemas](https://console.groq.com/docs/structured-outputs): Qwen supports strict mode; closed objects and required properties, nullable unions and references.
- [Qwen parameters/limits](https://console.groq.com/docs/model/qwen/qwen3.8-27b): reasoning_effort none, 131072 context, 16384 maximum output. Existing read 8192 / simplify 4096 budgets fit model limits; these are ceilings, not guaranteed account capacity.
- [Vision](https://console.groq.com/docs/vision): base64 image input; 20 MB request limit. Our one normalized image at most 8 MiB fits after base64 encoding.
- [Rate limits](https://console.groq.com/docs/rate-limits): organization-level quotas; response request limits refer to RPD, token limits to TPM. Live headers confirmed 1000 RPD and 8000 TPM. RPM/TPD, billing tier and complete console settings were not inspected or changed.

### Actual synthetic Uvicorn checks

| Run | OCR HTTP / seconds / retries | Simplify HTTP / seconds / retries | Quality observation |
|---|---|---|---|
| 1 | 429 / 2.938 / 1 | Not sent | Initial upstream 200 failed local validation; retry hit rate limit. Exact initial validation reason unavailable. |
| 2 | 200 / 2.152 / 0 | 200 / 0.508 / 0 | Exact OCR, academic terms, quantity, references and deterministic checks passed. Enrichment unavailable. Original overly literal condition check failed; output was not retained for manual adjudication. |
| 3 | 200 / 2.646 / 0 | 200 / 0.814 / 0 | Exact OCR; five metadata terms preserved, quantity/condition, references and deterministic checks passed. Complete enrichment; readability partial. |

Two of three attempts completed both endpoints (66.7%); one of three passed the
smoke runner's full checks as executed. These are small observations, not an uptime
or educational-quality estimate. Five logical HTTP calls used six provider attempts
(one retry). No further live calls were made. All runs used the normal Uvicorn
entry point and the configured Groq model. Synthetic evidence is in
`/tmp/mindbridge-groq-run1.json` through `run3.json` while temporary files remain.

Manual review of run 3's validated synthetic simplification found repetitive,
expanded prose and an added speculative statement about absence of light. Its
source facts, five terms and 20 mL condition were retained, but semantic faithfulness
and concise easy-reading quality are **not passed**. No FactGuard warning does not
prove correctness. Run 1's validation failure and observed quota pressure also
remain reliability limitations. Keep release/integration and student/provider
review gates open. Adapter integration is available for review; B06 has not begun,
and its quality prerequisite must not be described as resolved.

Manual verification (each smoke run spends provider quota):

```bash
cd /home/BYE/Nothing/MindBridge/backend
AI_PROVIDER=groq MINDBRIDGE_ENV=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --workers 1
# In another terminal, from backend:
MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q
.venv/bin/python -m app.tests.smoke_simplify
```

To select Gemini, stop the server and run the same startup command with
`AI_PROVIDER=gemini`. For the smoke runner also set `AI_PROVIDER=gemini` so its
reported configuration matches the server. The runner checks exact synthetic OCR,
references, deterministic warnings/terms and source immutability; its condition
marker check is heuristic. It stores only the validated synthetic simplification
at `/tmp/mindbridge-synthetic-simplification-review.json` for explicit human review.
It stops on OCR failure without substituting sample responses.

Final regression: **412 passed** (all 373 previous cases plus 39 Groq cases), no
skips, one existing Starlette/httpx deprecation warning, 54.86 s. Targeted tests
cover strict OCR schema construction, image encoding, selection/secrets, malformed
output, refusals, retries, quota hints, deadlines, cancellation and client cleanup.
`git diff --check` and Python compilation passed. The temporary Uvicorn server was
stopped cleanly; no Git staging/history operations were performed.

## OCR partial-readability correction

OCR prompt `ocr-v3` now explicitly assesses regions independently. Small text,
low image resolution or a cropped edge alone must not discard intact readable
sentences/list items. The model must separate clear complete portions from
uncertain/incomplete visible fragments, preserve retake reasons and return partial
when clear usable non-heading text remains. It must never complete missing words,
guess cropped text or join across missing regions. Headings alone or uncertain
fragments alone remain insufficient.

Inspection found no minimum-resolution rejection in image sanitation. Existing
local classification already preserves usable partial pages, rejects contradictory
unreadable-with-clear-prose output, and prevents uncertain chunks from supporting
generation. Those strict checks and image limits are unchanged. The reported
509 x 655 photograph and raw provider extraction were unavailable for inspection;
its exact failure cannot be reconstructed. A response with no usable extracted
blocks cannot be safely recovered locally by relabelling it.

Offline regression tests submit synthetic 509 x 655 textbook rasters through both
Groq and Gemini transports with controlled provider outputs for cropped, small-text
and combined conditions. They verify partial page retention, exact fragment text,
retake guidance, uncertainty warnings and exclusion from downstream generation.
Negative cases retain unreadable behavior and contradictory-output rejection.
These mocked tests verify application behavior and prompt delivery, not model
perception. No live provider calls or real-book-image retest were made; real OCR
quality remains an open acceptance gate.

Verification: `MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q`
— **422 passed**, no skips, one existing Starlette/httpx warning (53.29 s).
Python compilation and `git diff --check` passed. No Git staging or history changes.

## Focused Groq stabilisation and B06

B06 backend implemented: `POST /api/prepare-understanding` accepts the existing
PrepareRequest and returns the unchanged LearningPlan contract. It selects a clear
paragraph, excludes uncertain context, generates a fixed 2–4 criterion objective
before any answer, validates every exact source reference, rejects duplicate
criteria and invalid question coverage, and assigns all IDs locally. Each criterion
is anchored to the selected paragraph. Missing/non-paragraph/uncertain selections
fail safely; a source that cannot support a grounded rubric returns 422
INSUFFICIENT_SOURCE. Provider/schema/evidence failures share the existing <=2
attempts and deadline. JSON content type, 256 KiB body limit and safe errors apply.
No evaluation, repair, retry endpoint, B07 implementation or frontend activation.
B04/B05 code dependencies exist; B06's independent backend work is permitted.

Possible misconceptions are internal generation hints only, not student diagnoses
or new public fields. Correct criteria cannot contain a `Misconception:` annotation.
Duplicate descriptions and literal answer-copying in the question are rejected;
semantic equivalence, entailed meaning and accessible question quality still require
human review. Exact quotations alone do not establish that a generated claim follows
from them. Plans are stateless client-carried data; original source is preserved.

Groq budgets now account approximately for compact JSON input, instructions, strict
schema, message overhead and Qwen's documented 2048-token image cost. Text estimates
use UTF-8 bytes / 3 plus headroom; they are not exact tokenizer counts or shared
organization quota counters. Initial budgets: OCR 3072, prepare 1536, simplify
768–4096 based on source length, define 768, explain 1024; existing check ceiling is
4096 (not an activated operation). Gemini keeps its existing operation ceilings.
Groq ceilings are bounded by estimated room within 8000 tokens, reserving 256 for
headroom. Below 512 output capacity the adapter rejects the request with RATE_LIMITED
and smaller-section guidance, without sending/truncating source or guessing a reset.
Larger passages retain growing simplification capacity. OCR may regenerate at a
higher ceiling on truncation if estimated input room permits, up to 8192; otherwise
it fails explicitly. A larger regeneration still uses the one existing retry and
deadline. No partial JSON is accepted. Retry-After remains authoritative; no extra
sleep, model fallback or dependency was introduced. This reduces reservations but
cannot guarantee no 429s under an organization-wide 8000 TPM limit.

Groq OCR no longer receives duplicate enrichment schema prose because its typed
response schema already includes that structure. Gemini still receives the trusted
shape with its reduced grammar. OCR `ocr-v4` stresses literal visible transcription,
no restored cropped words/corrected wording, and preserving partial readability,
uncertain fragments and retake reasons. Wrapped lines of an intact paragraph should
stay together; missing regions must never be bridged. Local image/source validation
is unchanged. It cannot independently compare model text to image pixels.

Simplify `simplify-v2` requests concise nonrepetitive wording, own-chunk grounding,
no speculative conclusions/converse inference, preservation of terminology and
conditions. Output validation now rejects exact repeated sentences and newly added
`only if`, `only when` or `unless` phrases absent from that item's source. These are
conservative guards within the shared repair budget, not semantic verification.
SourceLens and FactGuard remain intact. Provider calls never substitute fixtures.

### Actual minimal live checks (normal Uvicorn, Groq Qwen)

| Check | HTTP / latency | Attempts | Quality |
|---|---|---|---|
| Initial B06 | 200 / 1.256 s | 1 | Exact refs, but unsupported soil/complexity claims and redundant criterion; failed human review. |
| After prepare-v2 refinement | 200 / 0.819 s | 1 | Two distinct evidence-backed energy/material criteria; conceptual roles question, no answer supplied. Passed this synthetic review. |
| One OCR call | 200 / 2.147 s | 1 | Exact joined synthetic text, readable, partial enrichment; wrapped sentence incorrectly split into chunks. |
| Its simplification | 200 / 0.475 s | 1 | Concise; all five known terms across output, 20 mL, exact refs, deterministic checks and source unchanged. Human review found `if` strengthened to `only if` and cross-chunk completion. |

No live 429, timeout or truncation in these four calls. Automated pipeline checks
passed 1/1, but the identified semantic/chunking issues mean **quality did not pass**.
Final line-grouping prompt and condition guards were added after that check and
verified offline; they have not been live rechecked. No further quota use. The first
B06 result prompted a focused refinement, not a reliability investigation. The
follow-up question was: "In your own words, explain how sunlight, carbon dioxide,
and water each differ in their function when green plants produce glucose."
Its rubric distinguishes light as energy from carbon dioxide/water as materials;
it covers both criteria and asks for understanding rather than word recall. One
sample is not evidence of broad question quality. No real book photograph was
submitted in this task. Source fidelity, incomplete enrichment, semantic
simplification quality, wider question-quality cases and integration/release gates
remain open. B06 is ready for backend review; B07 may use its interface after lead
review, but dependent quality/release gates must not be marked passed.

Evidence while temporary files remain: `/tmp/mindbridge-b06-initial-plan.json`,
`/tmp/mindbridge-b06-initial-evidence.json`, `/tmp/mindbridge-b06-synthetic-plan.json`,
`/tmp/mindbridge-b06-evidence.json`, `/tmp/mindbridge-b06-pipeline-evidence.json`.
All are synthetic validated API results or safe metadata, not raw provider logs.
Official references: [Groq rate limits](https://console.groq.com/docs/rate-limits)
and [Qwen limits/image cost](https://console.groq.com/docs/model/qwen/qwen3.8-27b).

### Swagger verification

```bash
cd /home/BYE/Nothing/MindBridge/backend
AI_PROVIDER=groq MINDBRIDGE_ENV=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --workers 1
```

Open http://127.0.0.1:8765/docs, expand POST /api/prepare-understanding, select
Try it out, paste the following synthetic JSON and Execute once. Each Execute
spends provider quota. Inspect the question for answer leakage and rubric meaning,
not just status. With Gemini configured, `AI_PROVIDER=gemini` selects that adapter;
Gemini live reliability was not re-investigated. Development docs only.

```json
{
  "source": {
    "page_id": "11111111-1111-4111-8111-111111111111",
    "chunks": [{"id": "c0001", "kind": "paragraph", "quality": "clear", "text": "Green plants use light energy from sunlight to make glucose from carbon dioxide and water during photosynthesis."}],
    "key_terms": [],
    "key_terms_status": "unavailable"
  },
  "chunk_id": "c0001",
  "target_concept": "How plants make glucose"
}
```

Expected success: same page/chunk/concept, backend-assigned unique IDs, 2–4 distinct
criteria with verbatim source evidence, question criterion_ids resolving to the
rubric. Omit target_concept to infer it; explicit null is invalid. Select an
uncertain/non-paragraph chunk to verify 422, or a conceptually thin paragraph to
check insufficient-source recovery. Retain source on all errors. For an opt-in
single synthetic HTTP smoke: `.venv/bin/python -m app.tests.smoke_prepare`.

Offline regression command:
`MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q`.
New coverage includes both providers' B06 paths, rubric integrity, source validation,
question subset mapping, errors, body caps, token estimates, long-source growth,
truncation regeneration, OCR prompt delivery and condition/repetition rejection.
No feature capability flag was activated; no Git staging/history changes.

Final verification: **494 passed**, no skips, one existing Starlette/httpx warning
(55.78 s), preserving 422 previous cases with updated prompt/token/route expectations.
Early failures exposed a generic-source estimation bug and an outdated route-list
expectation; both were corrected before this final full pass. Compilation and
`git diff --check` passed. All task-started Uvicorn servers stopped cleanly.

## B07 initial understanding evaluation

Implemented `POST /api/check-understanding` with the existing ComprehensionRequest
and EvaluationResult contracts. The common provider interface serves Groq and
Gemini. No rubric regeneration, accounts, plan storage, provider fallback or B08
retry evaluation was added. Valid previous_attempt submissions return explicit
501 FEATURE_UNAVAILABLE. B07 returns a different follow-up for an evaluated initial
attempt as required by contract, but never evaluates that follow-up yet.

Before generation, source/plan page and paragraph selection, unique IDs and rubric
descriptions, exact clear-source criterion quotations, actual initial question
(all fields), question coverage and assistance consistency are validated. Bad
relationships fail with 422 before provider use. Whitespace-only/oversize answers,
extra properties, wrong JSON content type and the 256 KiB body limit fail safely.
Client-carried plans are not authenticated: a well-formed semantic alteration
with valid source relationships cannot be proven to match an earlier server result.
The rubric is never modified in response to an answer, and all source/plan input is
copied and treated as untrusted data, separate from trusted instructions.

Generated output contains only judgement/feedback fields. Local validation requires
one independent assessment per fixed criterion; tested versus not_tested status;
verbatim answer quotes (required for demonstrated/possible_misconception); grounded
repair references; distinct follow-up text and valid criterion coverage. Assessment
source_refs are attached by Python from the already validated fixed rubric. Untested
explanations are a deterministic coverage statement, not a judgement about absent
student knowledge. Repair quotations are validated separately against clear source.
Original question/answer/assistance/attempt ID/plan ID are echoed by Python, with a
server UTC timestamp. retry_result remains null.

Uncertain feedback requires nonnull uncertainty/recovery, tested criteria unclear,
others not_tested, null explanation/hint/follow-up/practice flag and no comparison.
Malformed provider/schema/evidence results remain API errors, never fake uncertainty.
Missing/misconception results require grounded targeted repair and a hint. Minimal
internal schema, 4096-token check ceiling (subject to existing Groq input headroom),
35/15-second deadlines and <=2 total provider attempts are reused. Safe diagnostics
include allowlisted field names only, without student/source/provider content.
Prompt `evaluate-v3` requests synonym/spelling-tolerant conceptual assessment,
missing-versus-explicit-belief distinction, neutral feedback, no unsupported
analogies or claims, and actual semantic question coverage. These semantic policies
are not proven by deterministic validation and remain subject to quality review.

### Actual minimal live evidence

Normal Uvicorn, configured Groq Qwen model, synthetic photosynthesis source only.
The fixed synthetic plan has energy/materials criteria; its actual initial question
asks only about energy. Therefore materials must remain not_tested in every case.
No live Gemini reliability investigation, key output or real student data.

| Check | HTTP / seconds | Retries | Human/structural result |
|---|---|---|---|
| Initial correct answer | 502 / 3.256 | 1 | Both upstream 200 outputs failed local length validation; no evaluation returned. Initial failing field not captured. |
| Correct-answer recheck | 200 / 0.831 | 0 | Energy demonstrated; materials not_tested; exact answer/source refs; no unnecessary repair. Follow-up shifted to materials/word recall rather than preferred energy coverage. |
| First misconception | 200 / 1.098 | 0 | Energy possible_misconception, materials not_tested; correct distinction but unsupported factory analogy and unjustified praise. Failed complete quality review. |
| Focused repair recheck | 200 / 4.183 | 1 | First output rejected for short targeted_explanation; second had exact evidence and energy/product repair. Follow-up asked materials but labelled energy: semantic coverage failed despite valid IDs. |
| Ambiguous "It helps." | 200 / 1.002 | 0 | Energy missing, materials not_tested. No fabricated misconception, but expected clarification/uncertainty policy failed. |

Prompt refinements followed observed quality failures. Final evaluate-v3 was used
for ambiguity; no further live calls were made. Correct/misconception results were
from earlier prompt versions and must not be presented as final-v3 quality proof.
Five logical calls used seven provider attempts; four API successes, one safe 502.
No provider 429, timeout, truncation or overload occurred in these checks. A 200
response is not a passed conceptual-quality gate. Exact references, echo/source/
rubric immutability and known status checks were verified; semantic repair and
follow-up entailment cannot be established by quote matching alone.

B07 status: backend implementation available for review; **live semantic-quality
acceptance remains blocked**, specifically follow-up coverage and conservative
ambiguity handling. B08 should wait for lead review of these blockers. Prior OCR,
simplification, broader quality, frontend integration and student/provider release
gates remain open. Health/release flags remain off. No B08 comparison or retry
assessment was implemented. All task-started servers were stopped.

### Reproduce through terminal or Swagger

Start normally:

```bash
cd /home/BYE/Nothing/MindBridge/backend
AI_PROVIDER=groq MINDBRIDGE_ENV=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --workers 1
```

In another terminal from `backend`, generate synthetic Swagger input WITHOUT any
provider request:

```bash
.venv/bin/python -m app.tests.smoke_evaluation --case correct --write-request-only
cat /tmp/mindbridge-b07-correct-request.json
```

Open http://127.0.0.1:8765/docs, expand POST /api/check-understanding, Try it out,
paste that complete JSON and Execute once. Inspect each assessment, exact quotes,
repair meaning and follow-up coverage. Change only answer and attempt_id for a new
initial submission; retain plan, question and previous_attempt=null. Use the
misconception/ambiguous CLI cases to generate alternative bodies. Swagger Execute
spends quota; the write-request-only command does not. Retry evaluation is 501.

Opt-in live terminal checks (one logical request each, no HTTP-level retry):

```bash
.venv/bin/python -m app.tests.smoke_evaluation --case correct
.venv/bin/python -m app.tests.smoke_evaluation --case misconception
.venv/bin/python -m app.tests.smoke_evaluation --case ambiguous
```

The runner returns nonzero for unexpected semantic status, even on HTTP 200. Its
expectations are specific to the synthetic case; human repair/coverage review is
still required. Safe evidence and validated synthetic results are saved under
`/tmp/mindbridge-b07-<case>-evidence.json` and `-result.json` while temporary files
remain. Earlier failure evidence/results have `initial-` names. There are no raw
provider logs or real user content in these task artifacts. To select configured
Gemini manually, restart with AI_PROVIDER=gemini; this task did not live-retest it.

Automated regression command:
`MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q`.
Canned-provider tests check service behavior for correct/paraphrased/poor-spelling,
partial, missing, irrelevant, injection, misconception and ambiguous responses;
plan tampering/quotations, uncertainty null rules, untested coverage, malformed
output, errors/retry limits, ordering/echoes, body limits and source/rubric
immutability across both adapters. They do not establish AI judgement quality.

Final full regression: **614 passed** (494 existing plus 120 B07 cases), no skips,
one existing Starlette/httpx deprecation warning, 58.07 s. Compilation and
`git diff --check` passed. No credentials, public contracts, frontend, dependencies,
billing, provider selection or Git staging/history were changed by this task.

## B07 stabilisation / B08 provisional retry implementation

`check-understanding` now supports evaluated initial baselines and retry answers
through the same service/provider interface. It validates baseline plan/question,
assessment coverage, exact answer/source quotations, assistance consistency and
matching follow-up fields. An uncertain or mismatched baseline, repeated initial
question/attempt ID, or altered context returns 422 before provider use. Retry
judgement receives only the current answer/question and fixed source/rubric, not
the old answer or judgement. No third question is permitted. Uncertain retry has
null comparison and preserves the original evaluated initial baseline for later
clarification. Source, rubric and assistance metadata remain unchanged.

Comparison is Python-only, in rubric order: previously missing/misconceived/unclear
then demonstrated becomes newly_demonstrated; demonstrated in both is retained;
current missing/misconception/unclear remains practice; untested becomes
not_retested. Previously untested becoming demonstrated is not labelled improvement.
`independent_in_app` is solely `not current assistance.used`, not proof of unaided
work elsewhere. Current assistance is not inherited from learning before the retry
question; frontend must retain conceptual help opened during that question.
Typography/speech accommodations remain outside conceptual-help kinds.

B07 changes: `evaluate-v4` requests an explicit internal answer interpretation and
rejects evaluated output with no interpretable relationship. Follow-up IDs must
stay on the actual misunderstood criteria (misconception first, otherwise missing/
unclear; original tested coverage if all demonstrated). Repair is concise, without
invented analogies or praise. Semantics still require review: valid IDs and quotes
alone cannot prove a follow-up's meaning or repair entailment.

A narrow local abstention rule now handles answers composed entirely of generic
acknowledgements/deictic terms (e.g. "It helps", "That works") BEFORE provider use.
It returns contract-valid uncertain/clarify_answer, tested criteria unclear, others
not_tested, with no repair, hint, question, practice claim or comparison. This is
explicit application clarification policy, not a mock or substitution for failed AI.
No length threshold is used; short concept-bearing/spelling-variant answers still
reach AI. This small English vocabulary rule does not solve general ambiguity.
Provider/schema failures remain errors, with no uncertainty fallback. Existing
bounded retries/deadlines/token budgets and SourceLens/FactGuard are preserved.

Structural integrity does not authenticate client-carried history. A coordinated
well-formed semantic rewrite of source/plan/prior result, false assistance metadata,
or replay with new IDs cannot be proven false without trusted state/signing and
contract/architecture review. No such architecture change was introduced.

Actual normal-Uvicorn synthetic checks, configured Groq model:

| Check | HTTP / seconds | Provider attempts | Result |
|---|---|---|---|
| First model ambiguity check | 502 / 3.699 | 2 | Local validation rejected both outputs. |
| After local clarification policy | 200 / 0.033 | 0 | uncertain, energy unclear, materials not_tested; no progress/repair. |
| Live preparation for loop | 200 / 3.544 | 2 | Second response returned a valid energy/materials plan. |
| Initial misconception in loop | 429 / 3.117 | 2 | Invalid first output, then rate limit; Retry-After 2s. |
| Bounded continuation with saved live plan | 502 / 7.921 | 2 | Both outputs rejected by follow-up distinctness/targeted-coverage validator. |

No live retry judgement was reached. The loop **did not pass**; no new repair or
follow-up was accepted for human semantic approval. Provider calls stopped after
that continuation. This is an exact B07 dependency blocker to B08 live acceptance,
not proof of a provider outage. B08 request validation/comparison/retry components
are implemented and offline-tested, but provisional. Do not mark G4 or B08 complete;
B09 is not cleared. Broader OCR/semantic/release/integration gates remain open;
capability flags remain off. No frontend, billing, fallback, dependencies or public
schema changes. Servers stopped; no B09 or Git staging/history work.

Manual commands (from backend; each live call consumes quota):

```bash
MINDBRIDGE_ENV=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --workers 1
# Another terminal, same backend directory:
MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q
.venv/bin/python -m app.tests.smoke_evaluation --case ambiguous
.venv/bin/python -m app.tests.smoke_retry
```

The loop runner stops on failure and checks statuses/comparison, not semantic
quality. `--resume-prepare` explicitly reuses its saved synthetic live plan instead
of invoking preparation again; it does not substitute provider responses. Review
`/tmp/mindbridge-b08-*-request.json`, `*-result.json` and `-evidence.json` while they
exist. Failed calls do not create successful-result artifacts. To test in Swagger,
open http://127.0.0.1:8765/docs. Execute prepare, copy its LearningPlan unchanged into
an initial check request. For a valid evaluated result, retain the original plan,
copy `attempt` to `previous_attempt`, copy its `feedback.follow_up_question` to
`question`, use a new attempt_id and actual new answer/assistance. No other fields
are renamed. An uncertain retry must keep that original initial attempt as baseline.
Use these steps only after inspecting whether the question tests its declared IDs.

Final regression: **715 passed**, no skips, one existing Starlette/httpx warning
(60.33 s). Existing cases were retained with updated internal-provider fixtures and
retry-availability expectations. New tests cover independent/assisted/persistent/
partial/uncertain retry states, baseline reuse, invalid context, comparison,
clarification, source integrity and safe diagnostics across both providers. An
initial final-suite invocation from the repository root failed collection; rerunning
from the documented backend directory produced this passing result. Compilation
and `git diff --check` passed. Tests do not establish provider judgement quality.
