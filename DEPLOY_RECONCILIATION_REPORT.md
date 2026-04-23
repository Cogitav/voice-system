# Deploy Reconciliation Report

Generated on: 2026-04-23
Project root: `C:\Users\Tiago Gracio\Desktop\Voice-system-plus`
Git HEAD: `903260e1dfabd1c7b9f2411ed918b5f02d3510f1`
Supabase CLI: `npx supabase 2.95.0`

## 1. Scope

Goal: reconcile the local Supabase Edge Function source with the deployed booking-related functions, without changing business logic.

Primary function:
- `supabase/functions/chat-ai-response/index.ts`

Shared source-of-truth area:
- `supabase/functions/_shared/`

Other deployed functions that bundle the same shared modules and therefore could remain stale if not redeployed:
- `supabase/functions/public-chat/index.ts`
- `supabase/functions/close-conversation/index.ts`
- `supabase/functions/close-idle-conversations/index.ts`

Explicitly not modified:
- `supabase/functions/booking-v2/`

## 2. Local Manifest Used

Machine-readable manifest:
- `deploy-manifest.json`

Manifest generator:
- `scripts/reconcile-edge-functions.mjs`

Manifest summary:
- Relevant files under `chat-ai-response/` + `_shared/`: `53`
- All files under `supabase/functions/`: `69`
- Transitive files in `chat-ai-response` import chain: `28`
- Files with missing relative imports: `0`

Critical file hashes used for deploy verification:

| File | SHA256 |
|---|---|
| `supabase/functions/chat-ai-response/index.ts` | `94790890df22ef9431b7966ed4b18c5743bf1d27d26ff386649776ef878a5f30` |
| `supabase/functions/_shared/types.ts` | `723bf105c0beea6afed01e313fab0539bb4fb553cdbde0d6254eb94d6b7fed18` |
| `supabase/functions/_shared/action-types.ts` | `60d85f210182552b76399f9cbefd60168dbb6a3c5aed6e69494d852c4b219d53` |
| `supabase/functions/_shared/decision-types.ts` | `9d16b13363b0e733fcadf100ffbeca7bf0d398f1e9efd7de46a2abdff71cf1a8` |
| `supabase/functions/_shared/context-manager.ts` | `7194040fc64b9ea1aa34bba0c7ad288bf6041e07482f29ac5e12d8a7e02f6b21` |
| `supabase/functions/_shared/decision-engine.ts` | `1aad10c04fe092d0e36008111d38846d1f8b4d03f6782100121a1349e273257c` |
| `supabase/functions/_shared/booking-orchestrator.ts` | `44adb7830807c7ab02d8e4067f2b40f8e4a2e123665c4092f9d811c3cebbce06` |
| `supabase/functions/_shared/availability-engine.ts` | `e5e104dfe46ac16b7b5a0da0245bbcdb1635bbe7ae4ae5e3368ddd84d6f98b81` |
| `supabase/functions/_shared/booking-executor.ts` | `aa103f60279e7e94dcac7cb7e24c40c80c63d333de4faf7504e98bb6c35618d3` |
| `supabase/functions/_shared/reschedule-handler.ts` | `1d9a65246c7a0b5f433ee0a9814c7a85f7d7857069dd12463865e6a95ff44cf8` |
| `supabase/functions/_shared/extraction-contract.ts` | `e27afdc440fbb924b44829252e6484ddc0e0649e9587fd54e2db7b36b42797f5` |
| `supabase/functions/_shared/validators.ts` | `b7eafa9a4d33e7ea4b61163980688a4bddd58e1224901c9fb8fe5775b6c5a1da` |
| `supabase/functions/_shared/constants.ts` | `f05c172a7d76dd317826e470a70cfaeb90838772d7bd74d568bab4c61d3cfba7` |
| `supabase/functions/_shared/state-machine.ts` | `633bf7e6c96795c9e46568a4a8e7f56c497334af757f7e60b17143cdedfd1958` |
| `supabase/functions/_shared/response-generator.ts` | `c8bfe06277fb7bd423b7897e498149d6ff44390d3c359e47fa0fced2e575f8c0` |
| `supabase/functions/_shared/response-directive.ts` | `931c3d6d9fa18ec5407637f72d094fe184871001f8fce6b6b466723d162bacee` |
| `supabase/functions/_shared/service-resolver.ts` | `6548d0c95949503403f8378544a4b8e5bb1c0f7f715a7b5b87a4165f9ff613c0` |
| `supabase/functions/_shared/error-handler.ts` | `12ce0ad9edea96f32917e466cb1721f0d554b7d245575db675852e087ab6baec` |
| `supabase/functions/_shared/knowledge-retriever.ts` | `f888de22ee622a5b17723cb15e2e353334820a14c3ad2a56015003a143100f91` |
| `supabase/functions/_shared/llm-provider.ts` | `27f2ae11d8b98e56be72df1fa678712fd7ec9f3465a7e1d24dbffcd21ae92915` |
| `supabase/functions/_shared/logger.ts` | `87a90081e71821dbcfb3770acfd9f68ce07a23caea302690dd96e9b1eaca5f8a` |

## 3. Real Deploy Chain for `chat-ai-response`

Static import graph resolved locally from `supabase/functions/chat-ai-response/index.ts`:

- `supabase/functions/chat-ai-response/index.ts`
- `supabase/functions/_shared/supabase-client.ts`
- `supabase/functions/_shared/context-manager.ts`
- `supabase/functions/_shared/llm-provider.ts`
- `supabase/functions/_shared/extraction-contract.ts`
- `supabase/functions/_shared/error-handler.ts`
- `supabase/functions/_shared/constants.ts`
- `supabase/functions/_shared/service-resolver.ts`
- `supabase/functions/_shared/booking-orchestrator.ts`
- `supabase/functions/_shared/booking-executor.ts`
- `supabase/functions/_shared/reschedule-handler.ts`
- `supabase/functions/_shared/knowledge-retriever.ts`
- `supabase/functions/_shared/response-generator.ts`
- `supabase/functions/_shared/response-directive.ts`
- `supabase/functions/_shared/handoff-manager.ts`
- `supabase/functions/_shared/lead-manager.ts`
- `supabase/functions/_shared/credit-manager.ts`
- `supabase/functions/_shared/state-machine.ts`
- `supabase/functions/_shared/logger.ts`
- `supabase/functions/_shared/types.ts`
- `supabase/functions/_shared/decision-engine.ts`
- `supabase/functions/_shared/action-types.ts`
- `supabase/functions/_shared/availability-engine.ts`
- `supabase/functions/_shared/date-parser.ts`
- `supabase/functions/_shared/decision-types.ts`
- `supabase/functions/_shared/entity-extractor.ts`
- `supabase/functions/_shared/guardrails.ts`
- `supabase/functions/_shared/validators.ts`

Other function entrypoints that intersect this shared chain:
- `supabase/functions/public-chat/index.ts`
- `supabase/functions/close-conversation/index.ts`
- `supabase/functions/close-idle-conversations/index.ts`

No broken local relative imports were found in any file under `supabase/functions/`.

## 4. Mismatches Found Before Reconciliation

### 4.1 Deployment target mismatch

Issue:
- `supabase/config.toml` was pointing to `slfiptqsuwoxvbikzqww`
- `supabase/.temp/project-ref` and `supabase/.temp/linked-project.json` were pointing to `szlwbqvqdvgjmnczfoaq` (`Voice-prod`)

Impact:
- Deploy target was ambiguous.
- Local config and effective CLI link state were not aligned.

Resolution:
- `supabase/config.toml` was updated to `project_id = "szlwbqvqdvgjmnczfoaq"`
- Deploy commands were run with explicit `--project-ref szlwbqvqdvgjmnczfoaq`

### 4.2 Supabase CLI availability

Issue:
- `supabase` was not installed globally in the shell.

Impact:
- Direct verification/deploy could not start until CLI access was established.

Resolution:
- Used `npx supabase`, which downloaded CLI `2.95.0`.

### 4.3 Remote source inspection limitation

Issue:
- Direct source comparison was only possible through `supabase functions download --use-api`.
- Downloaded remote files for:
  - `supabase/functions/_shared/types.ts`
  - `supabase/functions/_shared/action-types.ts`
  - `supabase/functions/_shared/decision-types.ts`
  were zero-byte files.

Observed fact:
- These three local files contain only TypeScript type/interface exports.
- The downloaded server-side unbundled artifacts are empty, which is consistent with type erasure during transpilation/unbundling.

Impact:
- Exact byte-for-byte remote verification is not available for these three type-only modules through this download method.

Resolution:
- Treated this as a verification limitation, not as proof of bad deployment.
- All runtime-bearing files in the redeployed bundles were compared successfully by hash.

## 5. Functions Deployed

Functions explicitly redeployed from local source:
- `chat-ai-response`
- `public-chat`
- `close-conversation`
- `close-idle-conversations`

Reason:
- `chat-ai-response` is the primary booking flow function.
- The other three bundle shared files (`types.ts`, `context-manager.ts`, `constants.ts`, `logger.ts`, `lead-manager.ts`, `supabase-client.ts`) that are part of the same local source-of-truth area.

Functions not redeployed:
- `booking-v2`
- `check-availability`
- `external-actions`
- All other unrelated functions listed in `deploy-manifest.json`

Reason:
- No direct import dependency from `chat-ai-response` to those function folders.
- No evidence in the resolved local graph that they needed redeploy for this reconciliation pass.

## 6. CLI Audit Trail

### 6.1 Deploy `chat-ai-response`

```text
Deployed Functions on project szlwbqvqdvgjmnczfoaq: chat-ai-response
WARNING: Docker is not running
Uploading asset (chat-ai-response): supabase/functions/chat-ai-response/index.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/decision-engine.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/types.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/decision-types.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/action-types.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/logger.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/supabase-client.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/state-machine.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/constants.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/credit-manager.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/lead-manager.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/handoff-manager.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/response-directive.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/response-generator.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/llm-provider.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/knowledge-retriever.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/reschedule-handler.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/guardrails.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/availability-engine.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/booking-executor.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/booking-orchestrator.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/entity-extractor.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/validators.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/date-parser.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/service-resolver.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/error-handler.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/context-manager.ts
Uploading asset (chat-ai-response): supabase/functions/_shared/extraction-contract.ts
```

### 6.2 Deploy related shared-bundle functions

```text
Deployed Functions on project szlwbqvqdvgjmnczfoaq: public-chat, close-conversation, close-idle-conversations
WARNING: Docker is not running
Deploying Function: close-idle-conversations
Uploading asset (close-idle-conversations): supabase/functions/close-idle-conversations/index.ts
Uploading asset (close-idle-conversations): supabase/functions/_shared/constants.ts
Uploading asset (close-idle-conversations): supabase/functions/_shared/supabase-client.ts
Deploying Function: public-chat
Uploading asset (public-chat): supabase/functions/public-chat/index.ts
Uploading asset (public-chat): supabase/functions/_shared/logger.ts
Uploading asset (public-chat): supabase/functions/_shared/supabase-client.ts
Uploading asset (public-chat): supabase/functions/_shared/context-manager.ts
Uploading asset (public-chat): supabase/functions/_shared/constants.ts
Uploading asset (public-chat): supabase/functions/_shared/types.ts
Deploying Function: close-conversation
Uploading asset (close-conversation): supabase/functions/close-conversation/index.ts
Uploading asset (close-conversation): supabase/functions/_shared/context-manager.ts
Uploading asset (close-conversation): supabase/functions/_shared/constants.ts
Uploading asset (close-conversation): supabase/functions/_shared/types.ts
Uploading asset (close-conversation): supabase/functions/_shared/supabase-client.ts
Uploading asset (close-conversation): supabase/functions/_shared/lead-manager.ts
```

### 6.3 Post-deploy function list

```text
chat-ai-response         ACTIVE version 67 updated_at 2026-04-23 18:04:10 UTC
close-idle-conversations ACTIVE version 4  updated_at 2026-04-23 18:04:45 UTC
close-conversation       ACTIVE version 4  updated_at 2026-04-23 18:04:45 UTC
public-chat              ACTIVE version 8  updated_at 2026-04-23 18:04:45 UTC
```

Full list remains available from `npx supabase functions list --project-ref szlwbqvqdvgjmnczfoaq`.

## 7. Remote Verification Result

Verification method:
- Downloaded deployed source using `npx supabase functions download ... --use-api`
- Compared local vs downloaded files by SHA256

Temporary remote download workdirs used:
- `scripts/remote-function-download`
- `scripts/remote-download-public`
- `scripts/remote-download-close-conversation`
- `scripts/remote-download-close-idle`

Comparison result:
- Matching files: `38`
- Non-matching files: `5`

All 5 mismatches were:
- `supabase/functions/_shared/types.ts`
- `supabase/functions/_shared/action-types.ts`
- `supabase/functions/_shared/decision-types.ts`

Reason:
- Remote downloaded copies were zero-byte artifacts after server-side unbundling.
- These are type-only modules locally.
- No runtime-bearing file mismatch was found in the redeployed functions.

## 8. Files Changed Locally During Reconciliation

- `supabase/config.toml`
- `scripts/reconcile-edge-functions.mjs`
- `deploy-manifest.json`
- `DEPLOY_RECONCILIATION_REPORT.md`

## 9. Remaining Uncertainties

- Exact byte-for-byte remote verification is not fully guaranteed for type-only modules because `supabase functions download --use-api` returns them as empty files after unbundling.
- Functions outside the redeployed set were not source-compared in this pass.
- `booking-v2` was intentionally left untouched.

## 10. Final Conclusion

Conservative conclusion:

**not yet guaranteed**

Reason:
- The local deployment target is now reconciled and deterministic.
- The relevant booking-flow functions were redeployed from the verified local source.
- All runtime-bearing files in those deployed bundles matched by SHA256 after remote download.
- However, exact remote source parity for type-only files (`types.ts`, `action-types.ts`, `decision-types.ts`) cannot be proven byte-for-byte with the available Supabase API download method.

Operational conclusion:

- For the redeployed booking-flow functions, local source and deployed runtime are aligned as far as the available verification mechanism can prove.
- The repo now contains a reproducible manifest and audit trail for future checks.
