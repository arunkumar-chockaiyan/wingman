# ADR-001: LLM Guardrail Strategy — Lightweight In-Process Approach

**Status:** Accepted  
**Date:** 2026-04-09  
**Deciders:** Wingman engineering team

---

## Context

Wingman uses three LLM agents (Sales Coach, Q&A, Search) powered by Gemini 1.5 Flash to generate real-time coaching insights during live sales calls. The pipeline is latency-sensitive: transcripts arrive from Vosk STT and must pass through agents and back to the frontend in near real-time.

As the system processes user-generated speech input (transcripts) and serves LLM output to salespeople, guardrails are required to:

- Prevent prompt injection attacks via caller speech
- Avoid PII (card numbers, SSNs, emails, phone numbers) leaking into Kafka topics or logs
- Cap runaway LLM output lengths that would degrade the real-time UX
- Block harmful or off-topic content in LLM responses

The team evaluated two approaches:

1. **Standard guardrail frameworks** (NeMo Guardrails, Guardrails AI, LLM Guard)
2. **Lightweight in-process guardrails** with Gemini's native safety settings

---

## Decision

We chose **Option 2: lightweight in-process guardrails**, implemented as:

- `src/utils/guardrails.ts` — `sanitizeInput()`, `validateOutput()`, `redactPII()` utilities
- Gemini SDK `safetySettings` and `generationConfig.maxOutputTokens` applied at every model call
- PII redaction applied in `kafkaOrchestrator.broadcastTranscript()` before transcripts enter Kafka

Standard guardrail frameworks were evaluated and **rejected for this project at this time**.

---

## Evaluation of Standard Guardrail Frameworks

### NeMo Guardrails (NVIDIA)

| Criterion | Assessment |
|---|---|
| Language | Python only |
| Runtime model | Requires a running Python process serving a REST/gRPC API |
| Latency overhead | Adds a synchronous network hop per LLM call |
| Configuration | Declarative Colang DSL — well-suited for complex dialog policies |
| Maturity | Active project, strong enterprise adoption |

**Why rejected:** The entire Wingman backend is TypeScript/Node.js. Introducing a Python sidecar solely for guardrails adds: a second process to manage, a new network boundary in the hot path, additional Docker service, and cross-language deployment complexity. For a real-time pipeline where agent latency is already a UX concern, this overhead is not justified at the current scale.

### Guardrails AI

| Criterion | Assessment |
|---|---|
| Language | Python only |
| Integration | Wraps LLM calls via a Python SDK |
| Validators | Rich library of validators (PII, toxicity, format) |
| Node.js support | None — no official JS/TS client |

**Why rejected:** Same runtime incompatibility as NeMo Guardrails. No TypeScript path exists without a sidecar.

### LLM Guard (Protect AI)

| Criterion | Assessment |
|---|---|
| Language | Python only |
| Deployment | Can run as a REST service |
| Scanners | Prompt injection, PII, toxicity, relevance |
| Node.js support | REST client possible, but adds latency |

**Why rejected:** Same sidecar concern. The REST deployment pattern reintroduces the latency and operational overhead issues. Additionally, the toxicity and relevance scanners would require downloading and loading ML models, adding significant memory and startup overhead.

---

## Rationale for the Chosen Approach

### 1. Gemini native safety settings (zero overhead)

Gemini's `safetySettings` API applies content filtering inside the existing API call with no additional latency. This covers harassment, hate speech, dangerous content, and sexually explicit categories — the most likely outputs of concern in a sales coaching context.

### 2. In-process input sanitization (sub-millisecond)

Regex-based injection detection in `sanitizeInput()` runs in-process before the Gemini API call. Patterns cover the most common prompt injection vectors (instruction override attempts, persona hijacking, system prompt manipulation). Rejected inputs are logged for monitoring.

### 3. In-process output validation (sub-millisecond)

`validateOutput()` enforces a 1,000-character ceiling on agent output, preventing verbose responses from degrading the frontend and ensuring costs remain predictable.

### 4. PII redaction at the Kafka boundary

`redactPII()` is applied in `broadcastTranscript()` — the single point where Vosk output enters Kafka. This ensures PII is stripped before it can propagate to: agent prompts, the `transcripts` topic, frontend display, database persistence (via `fullTranscript`), or log aggregation (Loki).

---

## Consequences

### Positive

- No new runtime dependencies or infrastructure services
- No measurable latency impact on the real-time pipeline
- All guardrail logic is TypeScript, colocated with the agents it protects
- Gemini safety settings are maintained per-model-call, not globally, allowing per-agent tuning if needed

### Negative / Accepted trade-offs

- Injection detection is pattern-based; adversarial inputs with novel phrasing may not be caught
- Output validation does not check factual accuracy or hallucination detection — the QA agent system prompt addresses this instructionally but not programmatically
- PII redaction uses heuristic regex; edge cases (non-US phone formats, domain-specific identifiers) will not be caught

---

## Revisit Criteria

This decision should be revisited if any of the following occur:

1. **The backend is partially migrated to Python** — NeMo Guardrails or Guardrails AI become viable without a sidecar
2. **Injection attacks are observed in production logs** — the pattern list in `guardrails.ts` should be expanded or replaced with a dedicated ML-based scanner
3. **Regulatory requirements mandate auditable guardrail provenance** — frameworks with built-in audit trails (NeMo, Guardrails AI) would be preferable
4. **The pipeline moves to batch/async processing** — latency is no longer a constraint, making sidecar services more acceptable

---

## Related

- `src/utils/guardrails.ts` — implementation
- `src/agents/coreAgents.ts` — `sanitizeInput` / `validateOutput` integration
- `src/agents/searchAgent.ts` — `sanitizeInput` / `validateOutput` integration
- `src/services/kafkaOrchestrator.ts` — `redactPII` integration
