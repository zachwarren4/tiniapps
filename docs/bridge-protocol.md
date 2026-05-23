# Bridge Protocol V0

Microapps run in a sandboxed iframe and communicate with the shell host via `postMessage`. The host forwards approved requests to the trusted Rust broker with Tauri `invoke`.

## Request

```json
{
  "type": "microapp.capability.request",
  "requestId": "uuid-or-random-id",
  "capability": "web.search",
  "payload": {
    "query": "site:example.com tears of the kingdom armor",
    "limit": 5
  }
}
```

The host supplies `microapp_id`; the microapp does not get to choose it.

## Response

```json
{
  "type": "microapp.capability.response",
  "requestId": "same-id",
  "ok": true,
  "data": {}
}
```

Error responses keep the same envelope:

```json
{
  "type": "microapp.capability.response",
  "requestId": "same-id",
  "ok": false,
  "error": {
    "code": "capability_denied",
    "message": "Capability not declared for this microapp"
  }
}
```

## Broker Rules

- The active microapp registry entry is the source of truth for allowed capabilities.
- The microapp cannot pass credentials, token names, filesystem paths, or another microapp ID.
- Every capability implementation returns normalized JSON that can be validated and logged by the shell.
- Approval of a regenerated description is not approval of new capabilities; manifest capability diffs need a separate confirmation step.
