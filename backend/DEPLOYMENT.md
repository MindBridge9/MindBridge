# Backend deployment and integration handoff

This is deployment preparation, not a deployment or P0 acceptance sign-off.
Use one Python process. No database, accounts, paid resources or provider fallback
are required. Both providers remain available; automatic fallback is OFF by default.

## Render configuration

Create a native Python web service only when deployment is approved. Use:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Python version | `PYTHON_VERSION=3.12.16` (also pinned in `.python-version`) |
| Build Command | `python -m pip install -r requirements.txt` |
| Start Command | `python -m app.deployment` |
| Health Check Path | `/api/health` |

The launcher validates production settings and binds `0.0.0.0` to Render's `PORT`
(default 10000), forces **one worker**, disables access logs and implicit proxy
trust, and omits the server header. Use this launcher in production; direct Uvicorn
invocation bypasses its production checks. Health checks make no AI calls and do
not promise provider uptime. Swagger and OpenAPI are disabled in production.

These values follow Render's [FastAPI deployment guide](https://render.com/docs/deploy-fastapi),
[Python version configuration](https://render.com/docs/python-version), and
[web-service binding requirements](https://render.com/docs/web-services).
Do not rely on Render's changing default Python version or worker environment.

Configure these environment variables in the hosting dashboard:

```dotenv
MINDBRIDGE_ENV=production
PYTHON_VERSION=3.12.16
AI_PROVIDER=groq
AI_ENABLED=true
AI_FALLBACK_ENABLED=false
GROQ_MODEL=qwen/qwen3.8-27b
GEMINI_MODEL=gemini-3.5-flash-lite
CORS_ORIGINS=https://YOUR-FRONTEND-HOST
CLIENT_REQUESTS_PER_MINUTE=6
GLOBAL_REQUESTS_PER_MINUTE=12
GLOBAL_REQUESTS_PER_DAY=400
MAX_RATE_LIMIT_CLIENTS=2048
TRUSTED_PROXY_CIDRS=
```

Set `GROQ_API_KEY` as a backend secret. `GEMINI_API_KEY` is optional for Groq-only
operation, required for manual Gemini selection or automatic fallback. No actual
credentials belong in Git, build arguments, frontend `VITE_` values or screenshots.
Render supplies `PORT`; do not include a `$PORT` expression in a dotenv value.
Use `requirements.txt` for production, not `requirements-dev.txt`. No dependency
version changed during hardening; httpx is now explicitly declared as a direct
runtime dependency instead of relying on the Google SDK's transitive dependency.

`CORS_ORIGINS` accepts comma-separated exact origins, without paths or trailing
slashes. Production startup requires HTTPS public hosts and a selected provider
key unless `AI_ENABLED=false`. Wildcards, embedded credentials and invalid ports
are rejected. CORS is a browser policy, not authentication or abuse protection.

## Admission and provider recovery

All six AI POST routes share rolling per-client/minute, global/minute and global/day
limits and two concurrent request slots. Health, development docs and CORS preflight
do not spend these limits. Admitted requests, including invalid bodies, count; these
are **HTTP request limits, not token reservations**. Counters are bounded in memory,
single-process and reset on restart. At most two provider attempts per generation
mean 400 admitted daily requests can consume up to 800 provider requests, but this
does not guarantee staying within Groq's 8,000 TPM or cover other key users.
Provider quota guidance and operation-specific token budgets still apply.

Per-client identity uses the socket peer. Forwarded addresses are ignored unless
the actual peer belongs to `TRUSTED_PROXY_CIDRS`; the nearest untrusted address is
then used. Never trust all addresses. Render's actual proxy ranges were not verified
in this task. Leave this unset until verified: clients behind the same proxy can
share a bucket and hit the client limit together. This requires deployment-side
verification before a multi-user release; global limits remain effective meanwhile.

Saturation returns `503 SERVER_BUSY`; request limits return `429 RATE_LIMITED`
with `Retry-After`. Requests have a total admission deadline (75 s OCR, 35 s other
operations), including upload/body receipt. Image/file/pixel limits, 256 KiB JSON
limits, strict local schemas and source-integrity checks remain enforced.

Set `AI_ENABLED=false` and restart to disable every AI operation with
`501 FEATURE_UNAVAILABLE`, without initializing provider clients. Health stays up.

Fallback is implemented and tested offline but **not enabled or live-verified**.
Only after review, set `AI_FALLBACK_ENABLED=true` with Groq primary and both keys.
There are at most **two total provider attempts**, not two per provider, sharing
one deadline. Transport failures, provider call timeouts and transient upstream
5xx/408 may switch to Gemini after bounded jittered backoff. Provider Retry-After
is respected, and recovery requires time for a full next call. A short known rate
limit can retry Groq; quota/rate limits never switch providers. Authentication,
invalid requests, refusals and source-integrity failures never trigger fallback.
Malformed generated output may use the existing remaining attempt on the same
provider. Both providers receive identical local validation. No mock substitution
exists. Gemini still has known availability problems; enabling this option does
not prove improved uptime. A timed-out upstream call may still consume quota.

Request logs contain generated IDs, allowlisted route names, durations and statuses;
provider logs contain bounded attempt/size/token/error metadata. No bodies, prompts,
answers, images, API keys, raw exceptions or raw provider responses are logged by
the application. The production launcher disables Uvicorn's URL access logging.
Hosting/proxy logs and provider data handling require separate deployment review.
Source and student input remain untrusted data inside fixed provider instructions;
strict output/source validation is a further safeguard, not a proof against every
semantic prompt-injection attempt.

## Frontend connection and capability gates

Development (Owner 1 backend, Owners 2/3/4 consumers):

```bash
cd backend
# Keep keys in backend/.env. Process variables override that file.
MINDBRIDGE_ENV=development CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers --no-access-log
```

Set the frontend API client's base URL to `http://127.0.0.1:8000` using Owner 4's
configuration (`VITE_API_BASE_URL` if that is the approved client setting). Swagger:
`http://127.0.0.1:8000/docs`. Read uses multipart field `image`; the other five POST
routes use `application/json`, approved snake_case payloads and exact source text.
Do not send API keys or enable credentials/cookies. No frontend files were changed.

Production: set that same frontend base URL to `https://YOUR-BACKEND.onrender.com`
without a trailing slash, and backend `CORS_ORIGINS` to the frontend's exact HTTPS
origin. Rebuild the Vite frontend after changing its build-time configuration.
Verify health and an allowed-origin preflight before a deliberately bounded
synthetic request:

```bash
curl --fail --silent --show-error https://YOUR-BACKEND.onrender.com/api/health
curl --include --request OPTIONS https://YOUR-BACKEND.onrender.com/api/define \
  --header 'Origin: https://YOUR-FRONTEND-HOST' \
  --header 'Access-Control-Request-Method: POST' \
  --header 'Access-Control-Request-Headers: content-type'
```

| Endpoint | Integration status |
|---|---|
| `GET /api/health` | Offline runtime discovery ready; not provider readiness. |
| `POST /api/read` | Implemented; broader literal OCR fidelity/quality gate remains open. |
| `POST /api/simplify` | Implemented; broader semantic quality/accessibility review remains open. |
| `POST /api/define` | Prior synthetic live success; ready for integration review. |
| `POST /api/explain` | Prior synthetic live success; ready for integration review. |
| `POST /api/prepare-understanding` | Implemented; evaluate jointly with the full learning loop. |
| `POST /api/check-understanding` | Initial and retry paths implemented; semantic quality blocks release. |

**Production capabilities default to false, independently of credentials.**
`APPROVED_CAPABILITIES` explicitly allowlists reviewed read/simplify/define/explain/
prepare operations. Learning evaluation cannot be added to that production list
while its semantic gate is unresolved. `SYNTHETIC_DEVELOPMENT_INTEGRATION=true`
enables all implemented operations only in development, for synthetic/nonpersonal
integration. Startup rejects it in production. This setting never establishes
acceptance or provider uptime. No production capability was activated. Owner 4 must review real API/browser evidence, error recovery,
accessibility, source quality and release safety with the feature owners before
activation. Learning requires both prepare and check; do not expose half a loop.
The private feature matrix has deliberately not been regenerated or promoted.

Preserve drafts, original page data and generated content on recoverable failures.
Respect `Retry-After`; do not automatically replay AI POST requests. Show safe
messages and `X-Request-ID` for support. Production has no Swagger/OpenAPI; consumers
use the approved contract, not runtime discovery to invent payloads.

## Learning-loop limitation and smallest recovery

The latest recorded learning failure was `502 AI_INVALID_RESPONSE` after two
provider attempts: generated uncertainty/repair content failed local validation.
Earlier evidence includes answer leakage and unsupported feedback wording.
Deterministic target selection and independent-retry logic exist, but structural
tests and an earlier successful loop do not establish consistent semantic quality.
This task does not rewrite prompts or loosen validators.

Keep the learning flow gated. When a reviewed test session gets invalid repair or
follow-up content, retain the **same source, fixed learning plan/rubric and answer**;
offer an explicit later retry or another clear paragraph. Do not show the rejected
question, claim improvement, silently regenerate the rubric, or substitute an
expected answer. Original/reader tools remain a recovery path only when separately
approved. Client-carried plans still cannot authenticate structurally valid semantic
tampering without a reviewed contract/architecture change. Student release remains
blocked pending semantic, integration and safety gates.

## Verification

```bash
cd backend
.venv/bin/python -m pytest app/tests/test_fallback.py app/tests/test_hardening.py -q
# Optional private contract pack is local-only, never a public CI dependency:
MINDBRIDGE_PRIVATE_CONTRACT=1 .venv/bin/python -m pytest app/tests -q
# A clean public checkout runs without the private pack:
python -m pytest app/tests -q
```

Production startup can be checked without AI quota using `AI_ENABLED=false`, explicit
production CORS, and `PORT=10000 python -m app.deployment`. Health must return 200,
docs must return 404, and AI POSTs must return 501. Re-enable AI only with real
backend secrets; invalid JSON/schema checks do not call providers. Live smoke tools
in `app.tests` spend quota and must be explicitly bounded. No live fallback or
learning quality acceptance is claimed by offline tests.
