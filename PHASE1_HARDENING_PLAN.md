# Phase 1 Hardening Plan

Generated on: 2026-04-23
Based on:

- `LEGACY_BOOKING_ARCHITECTURE_AUDIT.md`
- `legacy-booking-flow-map.json`

Scope:

- Stabilize the current legacy booking runtime that is actually live behind `supabase/functions/chat-ai-response/index.ts`
- Do not migrate to `booking-v2` in this phase
- Optimize for determinism, low regression risk, and enterprise-pilot safety

## 1. Target of Phase 1

### Definition of "stable enough for enterprise pilot"

For this codebase, Phase 1 is complete only when the live legacy runtime satisfies all of the following:

1. One supported runtime state model is enforced in production behavior.
2. One primary action authority exists per turn: `supabase/functions/_shared/decision-engine.ts`.
3. Active booking turns no longer fall into raw legacy intent routing.
4. Service, slot, confirmation, and reschedule decisions are deterministic in critical paths.
5. A slot shown to the user is the same slot that can be selected and booked.
6. Time-only corrections do not corrupt the selected date.
7. Post-confirmation changes do not create duplicate active bookings.
8. Handoff and error state are persisted through the same conversation-context source of truth.
9. User-facing replies for critical booking steps are deterministic and testable.
10. No decision-engine action used in production is left unhandled.

### Phase 1 outcome boundary

Do now:

- stabilize the live legacy shell
- align states, actions, and context contracts used at runtime
- eliminate the most dangerous duplicate routing paths
- harden booking/reschedule behavior and recovery

Do later:

- remove all dead contracts permanently
- redesign the booking core
- migrate the runtime to `booking-v2`
- redesign broader scheduling capabilities outside the live import graph

## 2. Files to Change First

Ranked in recommended order.

| Rank | File | Why it is high leverage |
|---|---|---|
| 1 | `supabase/functions/chat-ai-response/index.ts` | Real outer orchestrator. Most duplicated control logic, most state writes, most business regressions originate here. |
| 2 | `supabase/functions/_shared/decision-engine.ts` | Must become the single action authority. Today it competes with legacy state and raw-intent branches. |
| 3 | `supabase/functions/_shared/types.ts` | Runtime contracts drift here first: states, intents, context fields, booking artifacts. |
| 4 | `supabase/functions/_shared/constants.ts` | Central place for allowed states, deterministic messages, and cross-module runtime flags. |
| 5 | `supabase/functions/_shared/state-machine.ts` | Must match the real supported runtime states or it remains misleading validation only. |
| 6 | `supabase/functions/_shared/booking-orchestrator.ts` | Owns slot generation, slot selection helpers, and missing-field behavior. High business impact with relatively narrow scope. |
| 7 | `supabase/functions/_shared/service-resolver.ts` | Critical for preventing service drift and low-confidence overwrites. |
| 8 | `supabase/functions/_shared/extraction-contract.ts` | Defines the extraction schema that drives service/date/time/personal-data routing. |
| 9 | `supabase/functions/_shared/response-directive.ts` | Best current candidate for a structured response contract. |
| 10 | `supabase/functions/_shared/response-generator.ts` | Must be constrained so LLM wording cannot destabilize critical booking steps. |
| 11 | `supabase/functions/_shared/booking-executor.ts` | Owns final booking guardrails, idempotency, conflict handling, and persistence correctness. |
| 12 | `supabase/functions/_shared/reschedule-handler.ts` | Owns reschedule persistence semantics and must stay aligned with booking execution. |
| 13 | `supabase/functions/_shared/context-manager.ts` | Needed to align persisted context updates and remove drift in state/error persistence. |
| 14 | `supabase/functions/_shared/handoff-manager.ts` | Needed to stop `human_handoff` from drifting away from `conversation_context.state`. |
| 15 | `supabase/functions/_shared/error-handler.ts` | Needed to collapse error counting to one contract and stabilize recovery. |

## 3. Refactor Decisions for Phase 1

### 3.1 Officially supported runtime states

These should remain the only officially supported runtime states in Phase 1:

- `idle`
- `collecting_service`
- `collecting_data`
- `awaiting_slot_selection`
- `awaiting_confirmation`
- `booking_processing`
- `completed`
- `human_handoff`

### 3.2 States to deprecate or treat as aliases

These should not remain as independent runtime states in Phase 1:

- `checking_availability`
  - Status: deprecated
  - Reason: defined but not meaningfully assigned in the live router
- `collecting_date`
  - Status: alias to `collecting_data`
  - Reason: used as a pseudo-state only
- `collecting_personal_data`
  - Status: alias to `collecting_data`
  - Reason: used as a pseudo-state only
- `handoff`
  - Status: alias to `human_handoff`
  - Reason: pseudo-state emitted by decision logic, not the persisted runtime state
- `cancel_collecting_target`
  - Status: alias to `collecting_data` with cancel intent/context
  - Reason: pseudo-state only
- `reschedule_collecting_target`
  - Status: alias to `collecting_data` with reschedule intent/context
  - Reason: pseudo-state only

### 3.3 Actions to keep in Phase 1

Keep these as the live action surface:

- `HANDOFF`
- `ANSWER_INFO`
- `ASK_SERVICE`
- `ASK_DATE`
- `ASK_PERSONAL_DATA`
- `GENERATE_SLOTS`
- `SHOW_SLOTS`
- `SELECT_SLOT`
- `SLOT_SEARCH_BY_TIME`
- `CONFIRM_BOOKING`
- `CREATE_BOOKING`
- `START_CANCEL`
- `START_RESCHEDULE`
- `EXECUTE_RESCHEDULE`

### 3.4 Actions that are dead and should be removed later

Do later:

- `CONFIRM_SERVICE`
- `EXECUTE_CANCEL`
- `GENERATE_RESCHEDULE_SLOTS`
- `CONFIRM_RESCHEDULE`
- `ASK_CLARIFICATION`
- `RESET_FLOW`

Reason:

- they are dead in current runtime, unhandled, or both
- removing them now is lower value than first stabilizing the live path that users actually hit

### 3.5 Duplicated branches in `chat-ai-response/index.ts` to eliminate first

Priority order:

1. Raw legacy intent fallback for `ANSWER_INFO`
2. Raw legacy intent fallback for `START_CANCEL`
3. Raw legacy intent fallback for `START_RESCHEDULE`
4. `LEGACY_AWAITING_CONFIRMATION`
5. `LEGACY_AWAITING_SLOT_SELECTION`
6. `LEGACY_COLLECTING_SERVICE`
7. `LEGACY_COLLECTING_DATA`
8. `legacy_fallback`

Reason:

- these are the main places where production behavior is decided more than once
- they are the shortest path to making the decision engine authoritative without rewriting the whole shell

## 4. Single-Action-Control Plan

### Target rule

For Phase 1, `supabase/functions/_shared/decision-engine.ts` becomes the primary action authority for every booking turn.

The role of `supabase/functions/chat-ai-response/index.ts` after hardening:

- HTTP entrypoint
- load conversation and context
- persist normalized context updates
- call decision engine
- dispatch one action
- persist final reply and side effects

### Legacy branches currently overriding or duplicating action decisions

In `supabase/functions/chat-ai-response/index.ts`:

- raw-intent `ANSWER_INFO` fallback when `allowLegacyIntentRouting` is true
- raw-intent `START_CANCEL` fallback when `intent === 'CANCEL'`
- raw-intent `START_RESCHEDULE` fallback when `intent === 'RESCHEDULE'`
- `LEGACY_AWAITING_CONFIRMATION`
- `LEGACY_AWAITING_SLOT_SELECTION`
- `LEGACY_COLLECTING_SERVICE`
- `LEGACY_COLLECTING_DATA`
- `legacy_fallback`
- pre-routing service re-resolution block that can change downstream action semantics
- regex confirmation handling that bypasses action-only booking creation

### Minimum safe sequence

#### Step 1. Freeze the contract surface

Files:

- `supabase/functions/_shared/types.ts`
- `supabase/functions/_shared/constants.ts`
- `supabase/functions/_shared/state-machine.ts`
- `supabase/functions/_shared/action-types.ts`
- `supabase/functions/_shared/decision-types.ts`

Outcome:

- supported states and actions are explicit
- pseudo-states become aliases, not persisted runtime states
- dead actions remain documented as future removals, not live behavior

#### Step 2. Block legacy raw-intent routing inside active booking states

Files:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/decision-engine.ts`

Outcome:

- active booking state means decision action wins
- raw `INFO_REQUEST`, `CANCEL`, `RESCHEDULE`, and confirmation regex do not override the action layer

#### Step 3. Collapse slot behavior into action-driven helpers

Files:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/booking-orchestrator.ts`

Outcome:

- `SELECT_SLOT` owns ordinal selection
- `SLOT_SEARCH_BY_TIME` owns time/comparative selection
- legacy slot-selection branches become thin wrappers or disappear

#### Step 4. Collapse confirmation and create-booking behavior

Files:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/decision-engine.ts`
- `supabase/functions/_shared/booking-executor.ts`
- `supabase/functions/_shared/reschedule-handler.ts`

Outcome:

- `CONFIRM_BOOKING` owns confirmation prompt
- `CREATE_BOOKING` owns booking execution
- `EXECUTE_RESCHEDULE` owns reschedule execution
- legacy regex confirmation no longer creates bookings directly

#### Step 5. Collapse collecting-state behavior last

Files:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/service-resolver.ts`
- `supabase/functions/_shared/extraction-contract.ts`
- `supabase/functions/_shared/booking-orchestrator.ts`

Outcome:

- `ASK_SERVICE`, `ASK_DATE`, `ASK_PERSONAL_DATA`, and `GENERATE_SLOTS` become the only valid control surface for collecting phases
- legacy collecting-state branches can be removed with lower risk

### Do now vs do later

Do now:

- make action dispatch authoritative
- keep helper functions already proven in runtime
- convert legacy branches into delegated wrappers before deleting them

Do later:

- fully thin the HTTP shell
- replace legacy flow with an internal booking core

## 5. Response-Layer Plan

### Deterministic replies that must remain hardcoded

These must be deterministic in Phase 1 because they are user-visible transaction steps:

- slot list presentation
- invalid slot selection and re-presentation
- comparative-time fallback explanation
- confirmation summary
- booking success
- booking conflict / slot no longer available
- reschedule success
- handoff acknowledgement
- cancel/reschedule starter prompts
- missing required data prompts
- explicit unsupported-action or recovery prompts

Primary files:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/response-directive.ts`
- `supabase/functions/_shared/constants.ts`

### Replies that can remain LLM-generated

These can remain LLM-generated in Phase 1:

- informational answers from `ANSWER_INFO`
- non-critical service/date/personal-data prompt wording
- knowledge-based informational replies outside active booking

Primary files:

- `supabase/functions/_shared/knowledge-retriever.ts`
- `supabase/functions/_shared/response-directive.ts`
- `supabase/functions/_shared/response-generator.ts`
- `supabase/functions/_shared/llm-provider.ts`

### Minimum response architecture for robust booking UX

Phase 1 target:

1. `decision-engine.ts` decides the action.
2. `index.ts` dispatches that action once.
3. Critical booking actions use deterministic response builders only.
4. Informational actions may use `response-directive.ts` plus `response-generator.ts`.
5. No critical booking state depends on free-form LLM wording to preserve correctness.

## 6. Booking Flow Hardening Tasks

### 6.1 Service selection

- Current problem:
  - service can still be resolved from multiple signals and overwritten later unless lock semantics are strictly enforced
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/service-resolver.ts`
  - `supabase/functions/_shared/extraction-contract.ts`
  - `supabase/functions/_shared/types.ts`
- Recommended change:
  - treat numeric menu selection plus explicit service change as the only lock/unlock boundary
  - allow one final service resolver path only
  - keep `service_locked` operational in active booking states
- Risk level:
  - high
- Test cases required:
  - initial menu selection `1` remains the same service through completion
  - vague service text asks again instead of auto-overwriting
  - explicit service-change request unlocks and replaces service

### 6.2 Date collection

- Current problem:
  - date semantics are split between extraction, router guards, and pseudo-states; time-only changes can still bypass the intended flow if duplicate branches fire
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/extraction-contract.ts`
  - `supabase/functions/_shared/decision-engine.ts`
  - `supabase/functions/_shared/types.ts`
- Recommended change:
  - keep one persisted collecting state: `collecting_data`
  - treat date updates as explicit action-driven field updates
  - enforce the "time-only does not change date" rule in the single slot-time path only
- Risk level:
  - high
- Test cases required:
  - date-only input advances correctly
  - time-only correction in `awaiting_confirmation` keeps existing date
  - explicit new date plus time updates both fields

### 6.3 Personal data collection

- Current problem:
  - personal-data gathering is split across extraction accumulation, orchestration checks, and router fallback; weak names can remain in context
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/extraction-contract.ts`
  - `supabase/functions/_shared/booking-orchestrator.ts`
  - `supabase/functions/_shared/validators.ts`
- Recommended change:
  - keep one acceptance gate for `customer_name`
  - keep one missing-fields prompt path
  - ensure collecting personal data uses action-driven prompts, not pseudo-state routing
- Risk level:
  - high
- Test cases required:
  - full name, email, and phone in one message populate correctly
  - service-like text is not retained as `customer_name`
  - stronger later full name replaces weak previous name

### 6.4 Slot generation

- Current problem:
  - slot generation can happen through decision action and also through legacy collecting-data fallback
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/booking-orchestrator.ts`
  - `supabase/functions/_shared/availability-engine.ts`
  - `supabase/functions/_shared/decision-engine.ts`
- Recommended change:
  - route generation through `GENERATE_SLOTS` only
  - keep `booking-orchestrator.ts` as the single slot-source adapter
  - preserve deterministic slot ordering from `available_slots`
- Risk level:
  - high
- Test cases required:
  - all required fields present produces slots directly
  - same-date reuse shows the same ordered list
  - no-availability fallback returns deterministic alternatives

### 6.5 Slot selection

- Current problem:
  - slot selection is handled both by action branches and legacy state branches; numeric and time-based selection can diverge
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/booking-orchestrator.ts`
  - `supabase/functions/_shared/decision-engine.ts`
- Recommended change:
  - keep one path for `SELECT_SLOT`
  - keep one path for `SLOT_SEARCH_BY_TIME`
  - eliminate state-local selection logic from legacy branches
- Risk level:
  - high
- Test cases required:
  - numeric `5` selects `available_slots[4]`
  - exact time selects the exact matching slot
  - invalid numeric selection re-shows the same list without stale selection

### 6.6 Confirmation

- Current problem:
  - confirmation is detected by both decision engine and legacy regex confirmation branches
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/decision-engine.ts`
  - `supabase/functions/_shared/response-directive.ts`
- Recommended change:
  - make `CONFIRM_BOOKING` the only confirmation-summary action
  - make `CREATE_BOOKING` the only booking-execution action
  - remove direct booking creation from legacy confirmation regex handling
- Risk level:
  - high
- Test cases required:
  - `sim` in `awaiting_confirmation` creates exactly one booking
  - denial or change request does not create booking
  - confirmation summary always uses `selected_slot` directly

### 6.7 Post-confirmation change

- Current problem:
  - after confirmation or completion, user changes can still be interpreted through multiple legacy and decision paths
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/decision-engine.ts`
  - `supabase/functions/_shared/booking-orchestrator.ts`
  - `supabase/functions/_shared/types.ts`
- Recommended change:
  - formalize post-confirmation change as action-driven slot update or reschedule preparation
  - stop allowing legacy confirmation-state branches to mutate booking intent implicitly
- Risk level:
  - high
- Test cases required:
  - user asks for another time before booking creation and stays in edit flow
  - user asks for another time after completion enters reschedule path
  - comparative time changes use current selected slot as reference

### 6.8 Reschedule

- Current problem:
  - reschedule is both an explicit action and an implicit diversion from `processCreateBooking()`
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/reschedule-handler.ts`
  - `supabase/functions/_shared/decision-engine.ts`
  - `supabase/functions/_shared/types.ts`
- Recommended change:
  - keep `reschedule_from_agendamento_id` as the only mode switch
  - make `EXECUTE_RESCHEDULE` the only execution action
  - keep update-in-place semantics explicit and deterministic
- Risk level:
  - high
- Test cases required:
  - completed booking time change preserves original appointment identity
  - reschedule success updates the original appointment instead of leaving two active bookings
  - reschedule without selected new slot cannot execute

### 6.9 Conflict recovery

- Current problem:
  - slot conflict recovery is spread across execution results, router resets, and fallback wording
- Exact files involved:
  - `supabase/functions/chat-ai-response/index.ts`
  - `supabase/functions/_shared/booking-executor.ts`
  - `supabase/functions/_shared/reschedule-handler.ts`
  - `supabase/functions/_shared/error-handler.ts`
- Recommended change:
  - define one deterministic recovery path for `SLOT_CONFLICT`
  - clear only the minimum stale fields
  - immediately return alternatives or a clear next-step prompt
- Risk level:
  - high
- Test cases required:
  - slot becomes unavailable after selection and user receives deterministic retry flow
  - conflict during reschedule returns back to slot-choice flow cleanly
  - repeated conflict does not corrupt error counters or state

## 7. Phase 1 Acceptance Criteria

Phase 1 is not done until all items below are true.

### Contract and routing checklist

- only supported runtime states are persisted in `conversation_context.state`
- pseudo-states are not persisted as primary runtime states
- every live `decision-engine` action has exactly one main router handler
- no live action emitted in production remains unhandled
- active booking states do not allow legacy raw-intent routing
- handoff persists consistently in both conversation row and conversation context
- error counting uses one authoritative contract

### Booking behavior checklist

- service chosen from numeric menu stays locked until explicit service change
- low-confidence service text does not auto-select a service
- service-like text is not retained as customer name
- slot list order shown to the user matches `available_slots`
- numeric selection maps `n` to `available_slots[n-1]`
- exact time selection works from the currently shown slot list
- comparative time requests respect `before`, `after`, `earlier`, and `later`
- invalid slot selections never silently keep a stale slot
- confirmation summary always uses the actual `selected_slot`
- time-only correction in `awaiting_confirmation` never changes date
- booking confirmation creates exactly one booking
- post-confirmation change does not create duplicate active bookings
- reschedule updates the existing appointment identity instead of leaving the old one active
- slot conflict recovery is deterministic and reversible

### Response checklist

- slot presentation is deterministic
- confirmation wording is deterministic
- booking success wording is deterministic
- booking conflict wording is deterministic
- handoff wording is deterministic
- informational answers may still use LLM generation only outside critical booking steps

## 8. Test Matrix

At least these scenarios must pass before Phase 1 is accepted.

| ID | Scenario | Start state | Expected result |
|---|---|---|---|
| 1 | User starts with vague service request | `idle` | `ASK_SERVICE`, no auto-booking |
| 2 | First message contains service, date, and time | `idle` | flow advances without re-asking service unnecessarily |
| 3 | Pure informational question outside booking | `idle` | `ANSWER_INFO` only |
| 4 | Human request outside booking | `idle` | `HANDOFF` |
| 5 | Numeric initial menu selection `1` | `collecting_service` | service resolves and locks |
| 6 | Locked service followed by personal-data message | `collecting_data` | service remains unchanged |
| 7 | Explicit "quero mudar de serviço" | `collecting_data` | service lock is cleared and new service can be chosen |
| 8 | Low-confidence service phrase | `collecting_service` | no `service_id` auto-selection |
| 9 | `INFO_REQUEST` while collecting service | `collecting_service` | still `ASK_SERVICE`, not `ANSWER_INFO` |
| 10 | Date supplied after service already known | `collecting_data` | date stored, next missing field requested |
| 11 | Full personal data in one message | `collecting_data` | name, email, phone stored in one turn |
| 12 | Service-like word as standalone message | `collecting_data` | not accepted as `customer_name` |
| 13 | Weak old name then later full real name | `collecting_data` | full name replaces weak one |
| 14 | Service + date + personal data complete | `collecting_data` | `GENERATE_SLOTS` |
| 15 | Slot list shown for a date | `awaiting_slot_selection` | display order equals `available_slots` order |
| 16 | User selects `1` from slot list | `awaiting_slot_selection` | selects `available_slots[0]` |
| 17 | User selects `5` from slot list | `awaiting_slot_selection` | selects `available_slots[4]` |
| 18 | Invalid numeric slot selection | `awaiting_slot_selection` | same list re-shown, no stale selection |
| 19 | Exact time request `12:30` | `awaiting_slot_selection` | exact slot selected if present |
| 20 | `antes das 16h` | `awaiting_slot_selection` | nearest slot strictly before 16:00 |
| 21 | `depois das 16h` | `awaiting_slot_selection` | nearest slot strictly after 16:00 |
| 22 | `mais cedo` relative to current selected slot | `awaiting_confirmation` | earlier slot chosen if available |
| 23 | `mais tarde` relative to current selected slot | `awaiting_confirmation` | later slot chosen if available |
| 24 | Confirmation summary shown | `awaiting_confirmation` | summary uses exact `selected_slot` |
| 25 | User replies `sim` to confirmation | `awaiting_confirmation` | exactly one booking created |
| 26 | User replies with change request instead of yes | `awaiting_confirmation` | no booking created; edit flow continues |
| 27 | Time-only correction `as 14h` | `awaiting_confirmation` | same date retained |
| 28 | Explicit new date and time | `awaiting_confirmation` | both date and time updated |
| 29 | Booking succeeds | `booking_processing` | `completed`, `confirmed_snapshot`, `agendamento_id` persisted |
| 30 | Slot conflict on create booking | `booking_processing` | deterministic retry/recovery flow |
| 31 | User asks to change time after completion | `completed` | reschedule preparation starts, not fresh duplicate booking |
| 32 | Reschedule confirmed with new slot | `completed` or reschedule path | original appointment updated in place |
| 33 | Active booking receives info-style question | any active booking state | stays in booking flow; no raw legacy `ANSWER_INFO` override |
| 34 | Handoff triggered after repeated errors | any active state | `human_handoff` persisted consistently |
| 35 | Unsupported or ambiguous turn after repeated failures | active booking state | deterministic recovery prompt, no state corruption |

## 9. Execution Boundary for Phase 1

### Do now

- align states, actions, and context contracts actually used in runtime
- make `decision-engine.ts` the primary action authority
- eliminate the highest-risk duplicate branches in `chat-ai-response/index.ts`
- make critical booking replies deterministic
- harden service, slot, confirmation, reschedule, and conflict flows

### Do later

- physically remove all dead contracts after the live path is stable
- thin the shell further
- move to a dedicated booking core boundary
- evaluate `booking-v2` migration only after Phase 1 acceptance is passed

## 10. Final Recommendation for Phase 1

The correct Phase 1 strategy is:

- keep the current legacy shell in place
- reduce it to one authoritative action router
- preserve proven executors and availability code
- remove duplicate control logic before broader migration

This is the lowest-risk path to enterprise-pilot stability based on the current audited runtime.
