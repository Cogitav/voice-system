# Runtime Proof

Generated on: 2026-04-23
Project: `szlwbqvqdvgjmnczfoaq`
Function: `chat-ai-response`

## 1. Local file changed

Temporary proof change was added to:

- `supabase/functions/chat-ai-response/index.ts`

The temporary branch was inserted near the start of the request handler and activated only when:

- header `x-runtime-proof: 2026-04-23-A`

It returned:

```json
{
  "ok": true,
  "runtime_marker": "chat-ai-response build 2026-04-23-A",
  "function": "chat-ai-response"
}
```

## 2. Exact deploy command used for proof

```powershell
npx supabase functions deploy chat-ai-response --project-ref szlwbqvqdvgjmnczfoaq
```

## 3. Exact request used for proof

```powershell
curl.exe -sS -D - -X POST "https://szlwbqvqdvgjmnczfoaq.supabase.co/functions/v1/chat-ai-response" -H "x-runtime-proof: 2026-04-23-A" -H "content-type: application/json" --data "{}"
```

## 4. Exact HTTP response captured

Full response:

```http
HTTP/1.1 200 OK
Date: Thu, 23 Apr 2026 18:43:53 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive
CF-Ray: 9f0f04348a50691d-LIS
CF-Cache-Status: DYNAMIC
Access-Control-Allow-Origin: *
set-cookie: __cf_bm=oqV2Zpu3hnx7lc_j1Ten5jRH54AWG9mk_A0A5s.IHgE-1776969833.6871262-1.0.1.1-q5R.JXvKMhcOjs2VZHca2KHuOoIzEsQuX0TOBQ0OmPnq9brSmToWQYas_84CmtPE3DsRij7I.N0darkTGRN9WyI2BZzg92jH.YzJokL5_BfVVE7f19Ewfy3lQIuOgroA; HttpOnly; Secure; Path=/; Domain=supabase.co; Expires=Thu, 23 Apr 2026 19:13:53 GMT
Server: cloudflare
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Vary: Accept-Encoding
access-control-allow-headers: authorization, x-client-info, apikey, content-type
endpoint-load-metrics: application_utilization:7,named_metrics.queue_depth:7
sb-gateway-version: 1
sb-project-ref: szlwbqvqdvgjmnczfoaq
sb-request-id: 019dbba7-dcde-787d-b92a-0602555a9f29
x-deno-execution-id: 254e8f35-f2de-474a-bb29-8382253ab1f6
x-sb-edge-region: eu-west-3
x-served-by: supabase-edge-runtime
alt-svc: h3=":443"; ma=86400

{"ok":true,"runtime_marker":"chat-ai-response build 2026-04-23-A","function":"chat-ai-response"}
```

Exact response body received:

```json
{"ok":true,"runtime_marker":"chat-ai-response build 2026-04-23-A","function":"chat-ai-response"}
```

## 5. Conclusion

The deployed runtime matched the temporary local source exactly at proof time.

Reason:

- the runtime-only gated branch existed in local source
- the function was redeployed from that local source
- a real remote HTTP request returned the exact marker payload expected from that branch

This is deterministic runtime proof without relying on Supabase logs.

## 6. Observed failure during proof capture

An initial attempt using PowerShell `Invoke-WebRequest` failed locally with a `NullReferenceException` before returning a usable response object.

Attempted command:

```powershell
$uri = 'https://szlwbqvqdvgjmnczfoaq.supabase.co/functions/v1/chat-ai-response'; $headers = @{ 'x-runtime-proof' = '2026-04-23-A' }; $response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -ContentType 'application/json' -Body '{}'; [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Body = $response.Content } | ConvertTo-Json -Depth 4
```

Observed local failure:

```text
Invoke-WebRequest : A referência de objecto não foi definida como uma instância de um objecto.
```

The proof was then successfully captured with `curl.exe`.

## 7. Cleanup completed

After proof capture, the temporary runtime-proof branch was removed from:

- `supabase/functions/chat-ai-response/index.ts`

Cleanup deploy command:

```powershell
npx supabase functions deploy chat-ai-response --project-ref szlwbqvqdvgjmnczfoaq
```

Cleanup verification request:

```powershell
curl.exe -sS -D - -X POST "https://szlwbqvqdvgjmnczfoaq.supabase.co/functions/v1/chat-ai-response" -H "x-runtime-proof: 2026-04-23-A" -H "content-type: application/json" --data "{}"
```

Cleanup verification response:

```http
HTTP/1.1 400 Bad Request
Date: Thu, 23 Apr 2026 18:44:21 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive
CF-Ray: 9f0f04da6be54893-LIS
CF-Cache-Status: DYNAMIC
Access-Control-Allow-Origin: *
set-cookie: __cf_bm=P_jp.QsYN4qeuG4pnw_OqH6i3YoPaQkJAYvm5ddxgRI-1776969860.2311676-1.0.1.1-YDLGjtykceLDdB15Nk9vKcHHnqtjqqLPJ_H4fKYaCs1am8ySSAsUqxJW6uUzVYt_Zk8j_efcqgu7BSzvv4hZx9_Hf08D.TZBfNHD.DlJq96h89tPO29JGWJtXdlH8IdA; HttpOnly; Secure; Path=/; Domain=supabase.co; Expires=Thu, 23 Apr 2026 19:14:21 GMT
Server: cloudflare
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Vary: Accept-Encoding
access-control-allow-headers: authorization, x-client-info, apikey, content-type
endpoint-load-metrics: application_utilization:7,named_metrics.queue_depth:7
sb-gateway-version: 1
sb-project-ref: szlwbqvqdvgjmnczfoaq
sb-request-id: 019dbba8-4490-7ede-9648-5ce76a8fc807
x-deno-execution-id: dbafe90b-f25c-48de-9c8f-74ee34aada98
x-sb-edge-region: eu-west-3
x-served-by: supabase-edge-runtime
alt-svc: h3=":443"; ma=86400

{"error":"Missing conversation_id or message"}
```

Final cleanup conclusion:

- the temporary proof branch is no longer active in the deployed runtime
- the same proof header no longer returns the proof payload
- cleanup was completed successfully
