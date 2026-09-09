# HTTP API

All endpoints are same-origin. Workspace routes resolve the visitor from an HTTP-only cookie and return private, non-cacheable responses. Open the workspace endpoint first to establish an anonymous session. The browser never supplies a credential for a different visitor.

## Workspace

### `GET /api/workspace`

Returns `{ workspace, revision, scope, access }`. `access` is `guest` or the explicitly enabled local-development workspace mode. The route recovers expired shared requests before reading state.

### `PUT /api/workspace`

```json
{ "workspace": {}, "revision": 12, "scope": "guest:…" }
```

The workspace above is abbreviated; callers must supply a complete valid snapshot. The server validates it, checks that scope matches the cookie, and writes only at the expected revision. Success returns the next revision. Invalid input returns 400, missing identity 401, foreign scope/origin 403, stale revision 409 and storage failure 503. The body is bounded to 1,000,000 bytes.

## Shared conversation

### `GET /api/companion`

Returns availability, configured model, remaining visitor attempts and the next UTC reset. It never returns model credentials. A disabled or unreachable local service reports `enabled: false`.

### `POST /api/companion`

```json
{
  "id": "58d24b71-7bd8-42d0-a81d-7c7b1f8c4259",
  "message": "Help me plan a quiet evening.",
  "revision": 12
}
```

Only these three fields are accepted. The ID must be a version-4 UUID. Messages are trimmed, nonempty and limited to 3,000 characters. The body limit is 16,000 bytes. Identity, context, permissions, provider and model are resolved on the server.

New requests return `text/event-stream`. Each frame contains JSON in a `data:` field:

```text
data: {"type":"start","id":"…","runId":"…"}

data: {"type":"text","text":"A provisional reply"}

data: {"type":"done","id":"…","status":"completed"}
```

Text events contain the accumulated provisional reply, not incremental deltas. The final event may include usage. An error event contains `{ type: "error", code, message }`. Provisional text does not confirm action execution; clients must wait for durable completion and reload workspace state.

An existing request returns JSON with `{ id, status, code, replay: true }` and does not repeat inference. The client must support this response as well as SSE. Reusing an ID for a different trimmed message returns 409.

Capacity or daily allowance exhaustion returns 429 before inference. Disabled configuration returns 503. Invalid input, origin, identity and revision errors are rejected before provider invocation.

### `DELETE /api/companion?id=<request-uuid>`

```text
DELETE /api/companion?id=58d24b71-7bd8-42d0-a81d-7c7b1f8c4259
```

Requests a durable stop scoped to the current visitor. It can create a cancellation tombstone before POST arrives. A result already committed remains completed. Reload the workspace after reconciling a stopped or uncertain stream.

## Personal connections

`POST /api/agent` supports the personal hosted-provider adapter, with a session-supplied key and validated context. It is a separate path from server-managed visitor conversations. The browser-local adapter calls Ollama directly and requires its own origin/network configuration. Prefer the shared conversation contract when serving visitors without personal keys.

## Error handling

Do not infer success from streamed text or automatically resend a failed stream. Reconcile the original request ID, reload authoritative state, and let the user retry deliberately. Never log cookie values, model credentials or full private context in error reports.
