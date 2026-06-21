# Microapp Shell

A personal desktop shell for small, isolated, single-purpose microapps. The shell is trusted; microapps are generated or bundled UI surfaces that can only talk to the shell through explicit capabilities.

## V0 Scope

- Tauri desktop app with a React/TypeScript frontend.
- Rust capability broker in the trusted Tauri core.
- End-to-end capabilities: `web.search`, `reader.preview`, `research.gather`, `browser.open`, and `llm.complete`.
- A hand-coded Tears of the Kingdom research microapp loaded in a sandboxed iframe, with a natural-language Research Mode that expands queries, gathers a small corpus, and lets Claude answer from it on an explicit button press.
- OS keychain-backed storage for the Anthropic API key.

Mobile, generator-backed regeneration, Git history management, and per-microapp SQLite stores are intentionally left for the next passes.

## Repo Layout

```text
.
├── DESIGN.md                 # Project brief and early decisions
├── src/                      # Shell frontend
│   ├── App.tsx               # Registry, microapp host, bridge wiring
│   └── microapps/            # Built-in/reference microapp fixtures only
├── src-tauri/                # Trusted Rust shell core
│   └── src/lib.rs            # Capability broker and credential access
└── docs/
    └── bridge-protocol.md    # Request/response protocol sketch
```

Long term, generated microapps should live as separate repos, not as packages in this shell repo. This repo may keep fixtures or templates, but the isolation model is cleaner if each microapp has its own git history and the shell has only a registry entry pointing at its repo path.

## Run

```bash
npm install
npm run tauri dev
```

`llm.complete` reads the Anthropic API key from the macOS keychain service `microapp-shell`, account `anthropic-api-key`. The app includes a small settings form to save it. For local debugging only, `ANTHROPIC_API_KEY` is also accepted by the Rust core.
