# Bridge Protocol V0

Microapps run in a sandboxed iframe and communicate with the shell host via `postMessage`. The host forwards approved requests to the trusted Rust broker with Tauri `invoke`.

## Request

```json
{
  "type": "microapp.capability.request",
  "requestId": "uuid-or-random-id",
  "capability": "web.search",
  "payload": {
    "query": "gliding how to",
    "sources": ["web", "youtube", "reddit", "wiki"],
    "limit": 4
  }
}
```

The host supplies `microapp_id`; the microapp does not get to choose it.

## V0 Capabilities

### `web.search`

Searches through the shell and returns normalized results:

```json
{
  "query": "gliding how to",
  "sources": ["reddit", "web", "wiki", "youtube"],
  "results": [
    {
      "source": "wiki",
      "title": "Paraglider - Zelda Wiki",
      "url": "https://zeldawiki.wiki/wiki/Paraglider",
      "snippet": "..."
    }
  ]
}
```

The TOTK reference app uses source-specific query transforms for Web, YouTube, Reddit, and Wiki. This is an indexing/search convenience, not a grant of direct network access to the microapp.

The shell chooses the provider behind each source. Current order:

- Prefer Google Custom Search when `google-search-api-key` and `google-search-engine-id` are stored in the shell keychain.
- Allow source-specific search engine IDs like `google-search-engine-id-reddit` to override the generic engine.
- Use source-specific APIs where available, such as Zelda Wiki's MediaWiki API.
- Fall back to DDG Lite for no-key search.

### `browser.open`

Opens a selected result in a shell-owned Tauri webview window:

```json
{
  "url": "https://zeldawiki.wiki/wiki/Paraglider",
  "title": "Paraglider - Zelda Wiki"
}
```

This capability is primarily for context isolation: result pages stay in the microapp's research surface instead of the user's general browser. The shell still validates the URL scheme and owns the actual browser window.

### `research.gather`

Higher-level capability that turns a natural-language question into a topic-scoped research corpus. The shell expands the query into source-specific searches, runs `web.search`-style provider chains for each picked source, fetches readable previews for a capped number of results per source, deduplicates by URL, and returns the corpus.

Payload:

```json
{
  "query": "what do you get from the labyrinths",
  "sources": ["web", "youtube", "reddit", "wiki"],
  "limit": 3
}
```

`sources` defaults to `["web"]` if absent and is filtered to the supported set (`web`, `youtube`, `reddit`, `wiki`). `limit` is per-source and is clamped to `1..=6`.

Response:

```json
{
  "query": "what do you get from the labyrinths",
  "expandedQueries": [
    { "source": "wiki", "query": "(site:zeldawiki.wiki OR site:zelda.fandom.com) what do you get from the labyrinths Tears of the Kingdom" }
  ],
  "corpus": [
    {
      "source": "wiki",
      "title": "Labyrinth - Zelda Wiki",
      "url": "https://zeldawiki.wiki/wiki/Labyrinth",
      "snippet": "...",
      "preview": ["First paragraph...", "Second paragraph..."]
    }
  ]
}
```

`preview` is optional: it appears only when the shell could fetch a readable extract. The microapp does not get raw HTML or direct network access; only the normalized corpus crosses the bridge.

### `llm.complete`

Runs an explicit one-shot LLM completion through the shell-held Anthropic credential. Microapps do not receive the API key.

The TOTK reference app calls `llm.complete` with a prompt that wraps the gathered corpus, so the model answers from sources the user can see in the UI rather than from open-ended browsing.

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
