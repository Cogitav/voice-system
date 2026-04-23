# Legacy Booking Architecture Audit

Generated on: 2026-04-23
Scope audited:

- `supabase/functions/chat-ai-response/index.ts`
- every file in its real import graph under `supabase/functions/_shared/`
- machine-readable companion: `legacy-booking-flow-map.json`

Method:

- import graph taken from the current local source using `scripts/build-legacy-booking-flow-map.mjs`
- findings grounded in the current code only
- anything outside this import graph is marked as `not proven from inspected code`

## Fact / Recommendation Boundary

Facts in sections 1 to 6 are grounded in the inspected code.

Recommendations in sections 7 to 9 are derived from those facts.

## 1. Real Import Graph

Exact dependency tree from `supabase/functions/chat-ai-response/index.ts`:

```text
supabase/functions/chat-ai-response/index.ts
|- supabase/functions/_shared/supabase-client.ts
|- supabase/functions/_shared/context-manager.ts
|  |- supabase/functions/_shared/constants.ts
|  |- supabase/functions/_shared/supabase-client.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/llm-provider.ts
|  |- supabase/functions/_shared/constants.ts
|  |- supabase/functions/_shared/supabase-client.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/extraction-contract.ts
|  |- supabase/functions/_shared/constants.ts
|  |- supabase/functions/_shared/types.ts
|  \- supabase/functions/_shared/validators.ts
|- supabase/functions/_shared/error-handler.ts
|  |- supabase/functions/_shared/constants.ts
|  |- supabase/functions/_shared/context-manager.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/constants.ts
|- supabase/functions/_shared/service-resolver.ts
|  |- supabase/functions/_shared/llm-provider.ts
|  |- supabase/functions/_shared/supabase-client.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/booking-orchestrator.ts
|  |- supabase/functions/_shared/availability-engine.ts
|  |  |- supabase/functions/_shared/supabase-client.ts
|  |  \- supabase/functions/_shared/types.ts
|  |- supabase/functions/_shared/constants.ts
|  |- supabase/functions/_shared/entity-extractor.ts
|  |  |- supabase/functions/_shared/date-parser.ts
|  |  |- supabase/functions/_shared/llm-provider.ts
|  |  |- supabase/functions/_shared/types.ts
|  |  \- supabase/functions/_shared/validators.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/booking-executor.ts
|  |- supabase/functions/_shared/availability-engine.ts
|  |- supabase/functions/_shared/credit-manager.ts
|  |  |- supabase/functions/_shared/constants.ts
|  |  |- supabase/functions/_shared/supabase-client.ts
|  |  \- supabase/functions/_shared/types.ts
|  |- supabase/functions/_shared/guardrails.ts
|  |  \- supabase/functions/_shared/types.ts
|  |- supabase/functions/_shared/logger.ts
|  |  \- supabase/functions/_shared/supabase-client.ts
|  |- supabase/functions/_shared/supabase-client.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/reschedule-handler.ts
|  |- supabase/functions/_shared/availability-engine.ts
|  |- supabase/functions/_shared/credit-manager.ts
|  |- supabase/functions/_shared/guardrails.ts
|  |- supabase/functions/_shared/logger.ts
|  |- supabase/functions/_shared/supabase-client.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/knowledge-retriever.ts
|  |- supabase/functions/_shared/llm-provider.ts
|  \- supabase/functions/_shared/supabase-client.ts
|- supabase/functions/_shared/response-generator.ts
|  |- supabase/functions/_shared/llm-provider.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/response-directive.ts
|  |- supabase/functions/_shared/constants.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/handoff-manager.ts
|  |- supabase/functions/_shared/logger.ts
|  |- supabase/functions/_shared/supabase-client.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/lead-manager.ts
|  |- supabase/functions/_shared/supabase-client.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/state-machine.ts
|  |- supabase/functions/_shared/constants.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/decision-engine.ts
|  |- supabase/functions/_shared/action-types.ts
|  |- supabase/functions/_shared/decision-types.ts
|  \- supabase/functions/_shared/types.ts
|- supabase/functions/_shared/action-types.ts
\- supabase/functions/_shared/decision-types.ts
   |- supabase/functions/_shared/action-types.ts
   \- supabase/functions/_shared/types.ts
```

Cold-path but bundled dependencies:

- `supabase/functions/_shared/entity-extractor.ts` is imported by `booking-orchestrator.ts`, but in the live booking path only `getMissingFields()` is called.
- `supabase/functions/_shared/date-parser.ts` is only reached through `extractEntities()` in `entity-extractor.ts`; that execution path is `not proven from inspected code` in the live router.

Bundled helpers not referenced from the live import graph:

- `response-generator.ts::buildConfirmationMessage`
- `response-directive.ts::getHardcodedResponse`
- `context-manager.ts::setConversationState`
- `context-manager.ts::accumulateField`
- `context-manager.ts::getGroupedMissingFields`
- `handoff-manager.ts::returnToAI`
- `handoff-manager.ts::shouldAutoHandoff`
- `state-machine.ts::transition`
- `state-machine.ts::getAllowedTransitions`
- `state-machine.ts::isTerminalState`
- `state-machine.ts::requiresHumanIntervention`

## 2. Real Runtime Source of Truth Map

| Concept | Authoritative module(s) today | Why this is authoritative in runtime | Secondary / conflicting modules |
|---|---|---|---|
| Conversation state | `chat-ai-response/index.ts`, `context-manager.ts` | `index.ts` decides nearly every `state` change and persists through `updateContext()` | `decision-engine.ts` only proposes; `state-machine.ts` only validates some transitions; `handoff-manager.ts` updates `conversation_state` but not `conversation_context.state` |
| Current intent | `chat-ai-response/index.ts` | `index.ts` writes `current_intent` from extraction and also force-overrides it during reset/reschedule/fallback paths | `types.ts::Intent` is weaker than runtime values; `decision-engine.ts` mostly reacts to `extraction.intent`, not `context.current_intent` |
| Service resolution | `chat-ai-response/index.ts` + `service-resolver.ts` | `index.ts` decides when service resolution runs, when it is bypassed by numeric menu selection, and when `service_locked` blocks overwrites; `service-resolver.ts` returns the resolved `service_id` | `extraction-contract.ts` and `hasSoftServiceSignal()` influence whether resolution runs at all |
| Date / time selection | `chat-ai-response/index.ts` + `extraction-contract.ts` | `index.ts` decides when `preferred_date` is kept or replaced, infers time relations, and routes time-based changes; `extraction-contract.ts` defines the extraction schema | `date-parser.ts` exists but is not proven to drive the live flow |
| Slot generation | `booking-orchestrator.ts` + `availability-engine.ts` | `orchestrateBooking()` decides whether to ask for more data, reuse slots, proactively suggest slots, or call availability; `checkAvailability()` is the actual slot source | `chat-ai-response/index.ts` decides when orchestration is called and sometimes reuses existing slots |
| Slot selection | `booking-orchestrator.ts` + `chat-ai-response/index.ts` | `resolveSlotSelectionFromContext()` and `findClosestSlot()` do the matching; `index.ts` decides state transitions and missing-data consequences after a match | `decision-engine.ts` also decides whether slot selection should happen |
| Confirmation | `chat-ai-response/index.ts` | `index.ts` chooses confirmation routing, hardcoded confirmation replies, booking execution, and post-confirmation change handling | `decision-engine.ts::hasClearConfirmation()` duplicates confirmation detection; `response-directive.ts` also has confirmation templates |
| Booking execution | `booking-executor.ts` + `chat-ai-response/index.ts` | `executeBooking()` does guard, duplicate execution check, availability recheck, persistence, logging, and credit consumption; `index.ts` prepares `execution_id`, state, and post-success context | `guardrails.ts` is precondition-only |
| Reschedule execution | `reschedule-handler.ts` + `chat-ai-response/index.ts` | `executeReschedule()` performs the DB update in place; `index.ts` prepares reschedule fields and decides when booking creation should divert to reschedule | `decision-engine.ts` only decides the action |
| Handoff | `chat-ai-response/index.ts` + `handoff-manager.ts` | `index.ts` decides when handoff happens; `triggerHandoff()` updates the conversation owner/status and logs it | `decision-engine.ts` can request `HANDOFF`, but does not perform it |
| Error recovery | `chat-ai-response/index.ts` + `error-handler.ts` | `index.ts` chooses when to call `handleSystemError()` or `resetErrorCount()` and how to recover by branch; `error-handler.ts` owns the nested `error_context` contract | `handoff-manager.ts::shouldAutoHandoff()` reads the wrong counter and is not used |
| Response text generation | `chat-ai-response/index.ts` + `response-directive.ts` + `response-generator.ts` | `index.ts` chooses between static text, slot list builders, hardcoded templates, knowledge answers, and LLM prompt generation; `response-directive.ts` shapes structured prompts; `response-generator.ts` calls the LLM | Response wording is not centralized in one module |

Key fact:

- The real outer orchestrator is still `supabase/functions/chat-ai-response/index.ts`.
- No imported module replaces it as the single router.

## 3. Real State Machine

### 3.1 States defined in `types.ts`

| State | Defined in type contract | Actually assigned in runtime | Actually consumed in runtime | Classification |
|---|---|---|---|---|
| `idle` | yes | yes | yes | real |
| `collecting_service` | yes | yes | yes | real |
| `collecting_data` | yes | yes | yes | real |
| `checking_availability` | yes | no | no meaningful live usage | dead contract |
| `awaiting_slot_selection` | yes | yes | yes | real |
| `awaiting_confirmation` | yes | yes | yes | real |
| `booking_processing` | yes | yes | yes | real but transient |
| `completed` | yes | yes | yes | real |
| `human_handoff` | yes | only through `handoff-manager.ts` DB row update | not read back from `conversation_context` in live router | split / drifting contract |

### 3.2 State-like values used outside the official type

These values are used in code but are not part of `ConversationState`:

- `collecting_date`
- `collecting_personal_data`
- `handoff`
- `cancel_collecting_target`
- `reschedule_collecting_target`

Classification:

- `collecting_date`, `collecting_personal_data`: pseudo-states used by `decision-engine.ts` and `ACTIVE_BOOKING_STATES` sets, but the main router usually normalizes them back to `collecting_data`
- `handoff`: pseudo-state emitted by `decision-engine.ts` for `HANDOFF`, but real handoff persistence uses `human_handoff`
- `cancel_collecting_target`, `reschedule_collecting_target`: pseudo-states proposed by `decision-engine.ts`; the live router writes `collecting_data` instead

### 3.3 Real state control points

State is controlled simultaneously by:

1. `chat-ai-response/index.ts`
2. `context-manager.ts::updateContext()`
3. `decision-engine.ts::proposed_state`
4. `state-machine.ts::canTransition()`
5. `handoff-manager.ts::triggerHandoff()`

This is not one coherent state machine.

### 3.4 Mismatches

| Mismatch | Evidence | Impact |
|---|---|---|
| `decision-engine.ts` returns states not present in `ConversationState` | `collecting_date`, `collecting_personal_data`, `handoff`, `cancel_collecting_target`, `reschedule_collecting_target` | runtime state model is wider than the type contract |
| `state-machine.ts` transition table does not include pseudo-states | `VALID_TRANSITIONS` only knows the 9 typed states | transition validation is partial only |
| `triggerHandoff()` writes `conversation_state='human_handoff'` but does not update `conversation_context.state` | `handoff-manager.ts` | conversation row and context row can diverge |
| `checking_availability` is modeled but not used by the live router | `constants.ts`, `types.ts`, `state-machine.ts` | dead documentation and dead template state |

## 4. Real Action Map

| Action | Produced by `decision-engine.ts` | Handled in `chat-ai-response/index.ts` | Runtime status | Duplicate path? |
|---|---|---|---|---|
| `HANDOFF` | yes | yes | live | no |
| `ANSWER_INFO` | yes | yes | live | yes, also legacy raw-intent fallback |
| `ASK_SERVICE` | yes | yes | live | yes, also legacy `collecting_service` branch |
| `CONFIRM_SERVICE` | no | no | dead |
| `ASK_DATE` | yes | yes | live | yes, also via orchestration / fallback |
| `ASK_PERSONAL_DATA` | yes | yes | live | yes, also via orchestration and slot branches |
| `GENERATE_SLOTS` | yes | yes | live | yes, also legacy `collecting_data` flow |
| `SHOW_SLOTS` | yes | yes | live | yes, also via orchestration replies |
| `SELECT_SLOT` | yes | yes | live | yes, also legacy `awaiting_slot_selection` and `awaiting_confirmation` branches |
| `SLOT_SEARCH_BY_TIME` | yes | yes | live | yes, also legacy `awaiting_confirmation` branch |
| `CONFIRM_BOOKING` | yes | yes | live | yes, also hardcoded legacy confirmation state |
| `CREATE_BOOKING` | yes | yes | live | yes, also regex confirmation path in legacy confirmation branch |
| `START_CANCEL` | yes | yes | live | yes, also raw-intent fallback |
| `EXECUTE_CANCEL` | no | no | dead |
| `START_RESCHEDULE` | yes | yes | live | yes, also raw-intent fallback |
| `GENERATE_RESCHEDULE_SLOTS` | no | no | dead |
| `CONFIRM_RESCHEDULE` | no | no | dead |
| `EXECUTE_RESCHEDULE` | yes | yes | live | yes, also `processCreateBooking()` diverts into reschedule |
| `ASK_CLARIFICATION` | yes | no | dead decision output |
| `RESET_FLOW` | yes | no | dead decision output |

Main fact:

- The decision engine is not the only behavior router.
- The live system still contains a decision layer plus legacy branch logic plus hardcoded fallbacks.

## 5. Field Contract Map

Detailed machine-readable field occurrences are in `legacy-booking-flow-map.json`.

### 5.1 Core flow fields

| Field | Main writers | Main readers | Classification |
|---|---|---|---|
| `state` | `createEmptyContext()`, `updateContext()` from `chat-ai-response/index.ts`, `processCreateBooking()`, `processRescheduleBooking()` | router branches, decision engine, guardrails, directives | authoritative |
| `previous_state` | `context-manager.ts::updateContext()` | almost nowhere else | transitional |
| `current_intent` | extraction accumulation, booking/reschedule resets, fallback routing in `index.ts` | logging, lead/handoff payloads, some branching | weak / duplicated with `extraction.intent` |
| `service_id` | numeric menu selection, `resolveService()`, resets in `index.ts` | decision engine, orchestrator, executors | authoritative |
| `service_name` | numeric menu selection, `resolveService()`, resets in `index.ts` | confirmation, response generation, executors | derived-but-important |
| `service_source` | `index.ts` only | logging and service-lock reasoning | auxiliary |
| `service_locked` | numeric menu selection, explicit service change reset, lock prevention in `index.ts` | service overwrite guards in `index.ts` | auxiliary but operational |
| `preferred_date` | extraction accumulation, slot selection updates, reschedule helpers, orchestrator resets | decision engine, orchestrator, availability | authoritative |
| `preferred_time` | extraction accumulation | orchestrator and time-based slot search | authoritative |
| `available_slots` | orchestrator updates, slot fallback sorting, state resets | slot presentation, slot matching, selection branches | authoritative list |
| `selected_slot` | slot selection updates, booking/reschedule resets | confirmation, booking execution, time relation context | authoritative selected candidate |
| `slots_page` | resets only | not read in live flow | dead |
| `slots_generated_for_date` | orchestrator updates and date resets | orchestrator reuse checks | weak / transitional |

### 5.2 Customer data fields

| Field | Main writers | Main readers | Classification |
|---|---|---|---|
| `customer_name` | extraction accumulation in `index.ts` with plausibility gates | decision engine, orchestrator, booking/reschedule persistence | authoritative with acceptance guard |
| `customer_email` | extraction accumulation | decision engine, orchestrator, booking persistence | authoritative |
| `customer_phone` | extraction accumulation | decision engine, booking persistence | authoritative |
| `customer_reason` | backfilled from raw message in `index.ts` | orchestrator, lead creation, booking notes, service resolution context | authoritative but overloaded |

### 5.3 Execution and reschedule fields

| Field | Main writers | Main readers | Classification |
|---|---|---|---|
| `booking_lifecycle_id` | only cleared/reset in `index.ts` and defaulted in `context-manager.ts` | not read in inspected runtime | dead |
| `execution_id` | set/reset in `processCreateBooking()` and completed-booking reset logic | `executeBooking()` duplicate execution guard, stale-slot reset logic | authoritative idempotency token |
| `agendamento_id` | booking success, reschedule success, resets | completed-booking mutation reset logic, stale execution logic | transitional but important |
| `reschedule_from_agendamento_id` | completed-booking reset logic, reschedule start path | decision engine, create/reschedule execution | authoritative reschedule mode flag |
| `reschedule_new_date` | slot/time reschedule updates | `resolveRescheduleSlot()` | weak helper |
| `reschedule_new_time` | slot/time reschedule updates | `resolveRescheduleSlot()` | weak helper |
| `reschedule_new_slot` | slot selection updates and reschedule prep | `executeReschedule()` | authoritative for reschedule execution |
| `confirmed_snapshot` | booking success, reschedule success, cleared on fresh cycle | completed-booking mutation detection, stale execution reset, time-relative matching | authoritative snapshot of last confirmed booking |

### 5.4 Error and meta fields

| Field | Main writers | Main readers | Classification |
|---|---|---|---|
| `fields_collected` | `accumulateField()` only | almost nowhere | dead |
| `fields_missing` | orchestrator and `accumulateField()` | limited prompt support only | weak |
| `consecutive_errors` | defaulted and logged, but not maintained by `error-handler.ts` | `handoff-manager.ts::shouldAutoHandoff()` and logs | duplicated / weak |
| `last_error` | booking failure path in `index.ts` | not meaningfully read in inspected runtime | weak |
| `language` | defaulted and carried into directives | not updated by live flow | low-value / stable |
| `context_version` | `context-manager.ts` optimistic concurrency | every `updateContext()` call | authoritative metadata |
| `updated_at` | `context-manager.ts` | not read in inspected runtime | metadata only |
| `error_context` | `error-handler.ts`, reset flows, booking conflict handling | decision engine handoff gate and router error recovery | authoritative nested error state |

## 6. Duplication / Conflict Matrix

| Behavior | First decision point | Second / third decision point | Effect today |
|---|---|---|---|
| Service resolution | `decision-engine.ts` decides `ASK_SERVICE` based on `service_id`, state, and soft service signal | `chat-ai-response/index.ts` then runs numeric menu selection or `resolveService()` and recalculates decision | service routing is two-stage and can change after the initial decision |
| Slot selection | `decision-engine.ts` chooses `SELECT_SLOT` or `SLOT_SEARCH_BY_TIME` | `chat-ai-response/index.ts` also has legacy slot selection logic in `awaiting_slot_selection` and `awaiting_confirmation` | slot choice behavior depends on which branch wins first |
| Confirmation | `decision-engine.ts::hasClearConfirmation()` | `chat-ai-response/index.ts` regex-confirmation in legacy `awaiting_confirmation` | booking creation can start from more than one confirmation detector |
| Post-confirmation changes | `decision-engine.ts` can route to `SLOT_SEARCH_BY_TIME`, `SELECT_SLOT`, or `CONFIRM_BOOKING` | legacy `awaiting_confirmation` branch separately handles time requests, re-selection, and orchestration fallback | change handling is split across decision and legacy layers |
| Reschedule | `decision-engine.ts` emits `START_RESCHEDULE` or `EXECUTE_RESCHEDULE` | completed-booking mutation reset logic in `index.ts` also enters reschedule mode indirectly; `processCreateBooking()` redirects to reschedule if `reschedule_from_agendamento_id` exists | reschedule has both explicit and implicit entry points |
| Personal data collection | `decision-engine.ts` emits `ASK_PERSONAL_DATA` | `booking-orchestrator.ts` also asks for grouped personal fields; slot selection branches also ask again if data is missing | missing-data prompts are generated in multiple places |
| Response wording | `response-directive.ts` + `response-generator.ts` | `chat-ai-response/index.ts` hardcoded strings, `HARDCODED_TEMPLATES`, `buildSlotsPresentationReply()`, knowledge direct answer | user-facing wording is not centralized |
| Handoff | `decision-engine.ts` can request `HANDOFF` | `chat-ai-response/index.ts` also handoffs on explicit human intent and error threshold without relying on decision action | handoff is multi-entry, not single-path |
| Error counters | `error-handler.ts` updates `error_context.consecutive_errors` | top-level `consecutive_errors` still exists and `handoff-manager.ts::shouldAutoHandoff()` reads it | duplicated counters with drift risk |

## 7. Production Risk Ranking

### 1. State contract divergence

- Symptom: state names differ between `types.ts`, `decision-engine.ts`, `constants.ts`, and the live router.
- Root cause: pseudo-states are emitted and consumed without being part of `ConversationState`.
- Affected files: `supabase/functions/_shared/types.ts`, `supabase/functions/_shared/decision-engine.ts`, `supabase/functions/_shared/constants.ts`, `supabase/functions/_shared/state-machine.ts`, `supabase/functions/chat-ai-response/index.ts`
- Severity: high
- Recommended fix direction: define one runtime state enum and make `decision-engine`, `chat-ai-response`, and `VALID_TRANSITIONS` share it exactly.

### 2. Multiple controllers decide the same turn

- Symptom: the same user turn can be routed by extraction intent, decision engine, post-service-resolution re-decision, legacy state branches, and generic fallback.
- Root cause: `chat-ai-response/index.ts` mixes modern decision actions with legacy state-driven routing.
- Affected files: `supabase/functions/chat-ai-response/index.ts`, `supabase/functions/_shared/decision-engine.ts`, `supabase/functions/_shared/booking-orchestrator.ts`
- Severity: high
- Recommended fix direction: reduce to one primary router and make all other logic explicit subroutines only.

### 3. Handoff can drift between DB row and conversation context

- Symptom: the conversation row can move to `human_handoff` while `conversation_context.state` remains a previous booking state.
- Root cause: `triggerHandoff()` updates table columns but does not update the stored context object through `updateContext()`.
- Affected files: `supabase/functions/_shared/handoff-manager.ts`, `supabase/functions/_shared/context-manager.ts`, `supabase/functions/chat-ai-response/index.ts`
- Severity: high
- Recommended fix direction: handoff should go through the same context write path as all other state changes.

### 4. Intent contract is weaker than runtime behavior

- Symptom: `current_intent` stores values outside `Intent`, and routing relies more on `extraction.intent` than on stored context.
- Root cause: `Intent` only models a subset of values while `ExtractedIntent` is richer and `index.ts` writes `as any`.
- Affected files: `supabase/functions/_shared/types.ts`, `supabase/functions/chat-ai-response/index.ts`
- Severity: high
- Recommended fix direction: split extracted intent from flow intent, or fully align both contracts.

### 5. Confirmation logic is duplicated

- Symptom: explicit confirmation can be recognized by both `decision-engine.ts` and legacy regex branches.
- Root cause: `hasClearConfirmation()` exists in the decision layer, but legacy `awaiting_confirmation` still has its own regex and fallback logic.
- Affected files: `supabase/functions/_shared/decision-engine.ts`, `supabase/functions/chat-ai-response/index.ts`
- Severity: high
- Recommended fix direction: keep one confirmation detector and route all confirm/deny/change outcomes through it.

### 6. Slot selection logic is duplicated

- Symptom: numeric selection and time-based changes are handled in both action branches and legacy state branches.
- Root cause: `resolveSlotSelectionFromContext()` and `findClosestSlot()` are central helpers, but the router wraps them from multiple independent branches.
- Affected files: `supabase/functions/chat-ai-response/index.ts`, `supabase/functions/_shared/booking-orchestrator.ts`
- Severity: high
- Recommended fix direction: expose a single slot-resolution path and call it from one router point only.

### 7. Service resolution is multi-source and order-dependent

- Symptom: service may come from menu selection, deterministic/LLM resolution, or soft extraction signals, with `service_locked` modifying behavior mid-flow.
- Root cause: service detection is split between extraction, direct numeric parsing, `resolveService()`, and router-side service lock rules.
- Affected files: `supabase/functions/chat-ai-response/index.ts`, `supabase/functions/_shared/service-resolver.ts`, `supabase/functions/_shared/extraction-contract.ts`
- Severity: high
- Recommended fix direction: define one service-selection contract with one final resolver and explicit lock semantics.

### 8. Error state is duplicated

- Symptom: some code reads `context.consecutive_errors`, while recovery logic updates `context.error_context.consecutive_errors`.
- Root cause: legacy top-level field was kept even after nested `error_context` became the active contract.
- Affected files: `supabase/functions/_shared/types.ts`, `supabase/functions/_shared/context-manager.ts`, `supabase/functions/_shared/error-handler.ts`, `supabase/functions/_shared/handoff-manager.ts`
- Severity: medium
- Recommended fix direction: remove or fully deprecate the top-level counter and keep only `error_context`.

### 9. Runtime response wording is fragmented

- Symptom: user-visible wording changes depending on whether the branch used hardcoded text, prompt directives, orchestration hint, or knowledge retrieval.
- Root cause: no single response composition layer is enforced.
- Affected files: `supabase/functions/chat-ai-response/index.ts`, `supabase/functions/_shared/response-directive.ts`, `supabase/functions/_shared/response-generator.ts`, `supabase/functions/_shared/constants.ts`
- Severity: medium
- Recommended fix direction: centralize all user-facing text through one composition pipeline.

### 10. Dead contracts make the code look more coherent than it is

- Symptom: `checking_availability`, `booking_lifecycle_id`, dead actions, and unused helpers imply architecture that the live flow does not actually execute.
- Root cause: partial migration and retained scaffolding.
- Affected files: `supabase/functions/_shared/types.ts`, `supabase/functions/_shared/constants.ts`, `supabase/functions/_shared/state-machine.ts`, `supabase/functions/_shared/action-types.ts`, `supabase/functions/_shared/decision-types.ts`, `supabase/functions/_shared/booking-executor.ts`
- Severity: medium
- Recommended fix direction: explicitly prune or quarantine dead contracts so the live system surface matches reality.

## 8. Refactor Recommendation

### Recommended target architecture

`hybrid temporary with explicit boundary`

### Why this is the right target

Facts:

- The live runtime is still controlled by `chat-ai-response/index.ts`.
- `booking-v2` is not part of the live import graph audited here.
- The biggest current problem is duplicated control logic inside the live legacy shell, not absence of another implementation.

Recommendation:

- Keep the current live shell temporarily.
- Make the shell explicitly responsible only for HTTP, conversation loading/persistence, credits, and final response persistence.
- Move booking decisions behind one explicit internal boundary before attempting any full v2 migration.

### What to keep

- `supabase/functions/chat-ai-response/index.ts` as the temporary outer entrypoint
- `supabase/functions/_shared/context-manager.ts` for context persistence and optimistic concurrency
- `supabase/functions/_shared/availability-engine.ts`
- `supabase/functions/_shared/booking-executor.ts`
- `supabase/functions/_shared/reschedule-handler.ts`
- `supabase/functions/_shared/response-directive.ts` as the most structured response contract already present

### What to remove

- dead action contracts: `CONFIRM_SERVICE`, `EXECUTE_CANCEL`, `GENERATE_RESCHEDULE_SLOTS`, `CONFIRM_RESCHEDULE`, `ASK_CLARIFICATION`, `RESET_FLOW`
- dead or pseudo state names that are not part of the final runtime enum
- top-level `consecutive_errors` if `error_context` remains the real error contract
- unused helper paths that are not part of the live booking shell

### What to merge

- service resolution logic in `chat-ai-response/index.ts` and `service-resolver.ts`
- slot selection logic in `chat-ai-response/index.ts` and `booking-orchestrator.ts`
- confirmation logic in `decision-engine.ts` and `chat-ai-response/index.ts`
- response wording split across `chat-ai-response/index.ts`, `response-directive.ts`, and `response-generator.ts`

### What to postpone

- full migration to `booking-v2`
- replacement with broader scheduling modules outside the live import graph
- any redesign that assumes non-legacy modules are already parity-complete

Reason:

- parity of `booking-v2` is `not proven from inspected code` in this audit
- the immediate live risk is within the legacy shell itself

## 9. Phased Execution Plan

### Phase 1: Hardening

Goal:

- align contracts so the live flow cannot drift between type names, pseudo-states, and handoff/error counters

Files to touch:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/types.ts`
- `supabase/functions/_shared/action-types.ts`
- `supabase/functions/_shared/decision-types.ts`
- `supabase/functions/_shared/decision-engine.ts`
- `supabase/functions/_shared/constants.ts`
- `supabase/functions/_shared/state-machine.ts`
- `supabase/functions/_shared/context-manager.ts`
- `supabase/functions/_shared/handoff-manager.ts`
- `supabase/functions/_shared/error-handler.ts`

Concrete outcome:

- one real state enum
- one real intent contract
- one error counter contract
- handoff persisted through the same context source of truth

### Phase 2: Simplification

Goal:

- remove double-decision points inside the live shell

Files to touch:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/service-resolver.ts`
- `supabase/functions/_shared/booking-orchestrator.ts`
- `supabase/functions/_shared/extraction-contract.ts`
- `supabase/functions/_shared/guardrails.ts`
- `supabase/functions/_shared/response-directive.ts`
- `supabase/functions/_shared/response-generator.ts`

Concrete outcome:

- one service resolution path
- one slot selection path
- one confirmation path
- one response composition path

### Phase 3: Architecture Cleanup

Goal:

- make the outer shell thinner and the booking core explicit

Files to touch:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/booking-orchestrator.ts`
- `supabase/functions/_shared/availability-engine.ts`
- `supabase/functions/_shared/booking-executor.ts`
- `supabase/functions/_shared/reschedule-handler.ts`
- `supabase/functions/_shared/context-manager.ts`

Concrete outcome:

- the booking core becomes an explicit internal boundary
- booking execution and reschedule execution stop depending on router-local side effects
- context mutations become deliberate and easier to test

### Phase 4: Enterprise Readiness

Goal:

- make the live shell observable, auditable, and regression-safe

Files to touch:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/logger.ts`
- `supabase/functions/_shared/credit-manager.ts`
- `supabase/functions/_shared/supabase-client.ts`
- `scripts/reconcile-edge-functions.mjs`
- `scripts/build-legacy-booking-flow-map.mjs`
- add a regression-contract script under `scripts/`

Concrete outcome:

- deterministic architecture snapshots
- repeatable deploy reconciliation
- runtime contract checks for states, actions, and context fields

## 10. Final Position

Fact:

- the current live system is still a legacy conversation shell with multiple internal decision layers.

Recommendation:

- do not jump straight from this code to a full `booking-v2` replacement.
- first establish a hybrid temporary boundary inside the live legacy shell, then migrate behind that boundary.

Anything broader than that is `not proven from inspected code` in this audit.
