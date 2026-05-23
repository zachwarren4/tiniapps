import type { MicroappManifest } from '../types';

export const totkLookupManifest: MicroappManifest = {
  id: 'totk-lookup-reference',
  name: 'TOTK Lookup',
  description: 'Reference microapp that searches the web for Tears of the Kingdom info and asks Claude to summarize results.',
  icon: '🗡️',
  version: '0.1.0',
  capabilities: ['web.search', 'llm.complete'],
};

export const totkLookupHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none';"
    />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #111827; color: #f9fafb; }
      main { max-width: 860px; margin: 0 auto; padding: 32px; }
      h1 { margin: 0 0 8px; font-size: 32px; }
      p { color: #cbd5e1; line-height: 1.5; }
      form { display: flex; gap: 12px; margin: 24px 0; }
      input { flex: 1; border: 1px solid #334155; border-radius: 12px; background: #0f172a; color: #f8fafc; padding: 12px 14px; font-size: 16px; }
      button { border: 0; border-radius: 12px; background: #38bdf8; color: #082f49; font-weight: 700; padding: 12px 16px; cursor: pointer; }
      button.secondary { background: #a78bfa; color: #2e1065; }
      button:disabled { cursor: not-allowed; opacity: 0.55; }
      .panel { border: 1px solid #1f2937; border-radius: 16px; background: #020617; padding: 18px; margin-top: 16px; }
      .result { border-top: 1px solid #1f2937; padding: 14px 0; }
      .result:first-child { border-top: 0; padding-top: 0; }
      a { color: #7dd3fc; }
      pre { white-space: pre-wrap; color: #e5e7eb; font-family: inherit; }
      .muted { color: #94a3b8; font-size: 14px; }
      .error { color: #fecaca; }
    </style>
  </head>
  <body>
    <main>
      <h1>TOTK Lookup</h1>
      <p>Search for Tears of the Kingdom info through the shell broker, then ask Claude for an explicit summary of the returned results.</p>
      <form id="search-form">
        <input id="query" autocomplete="off" placeholder="armor upgrade materials, shrine clue, quest name..." />
        <button id="search-button" type="submit">Search</button>
      </form>
      <div class="muted">This iframe has no direct network access. It can only ask the shell for declared capabilities.</div>
      <section class="panel">
        <strong>Results</strong>
        <div id="results" class="muted">No search yet.</div>
      </section>
      <section class="panel">
        <button id="summarize-button" class="secondary" disabled>Summarize With Claude</button>
        <div id="summary" class="muted">Run a search first.</div>
      </section>
    </main>
    <script>
      const pending = new Map();
      let latestResults = [];
      const resultsEl = document.getElementById('results');
      const summaryEl = document.getElementById('summary');
      const searchButton = document.getElementById('search-button');
      const summarizeButton = document.getElementById('summarize-button');

      function requestCapability(capability, payload) {
        const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
        parent.postMessage({ type: 'microapp.capability.request', requestId, capability, payload }, '*');
        return new Promise((resolve, reject) => {
          pending.set(requestId, { resolve, reject });
          setTimeout(() => {
            if (pending.has(requestId)) {
              pending.delete(requestId);
              reject(new Error('Capability request timed out'));
            }
          }, 45000);
        });
      }

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.type !== 'microapp.capability.response') return;
        const entry = pending.get(message.requestId);
        if (!entry) return;
        pending.delete(message.requestId);
        if (message.ok) entry.resolve(message.data);
        else entry.reject(new Error(message.error?.message || 'Capability request failed'));
      });

      function renderResults(results) {
        if (!results.length) {
          resultsEl.className = 'muted';
          resultsEl.textContent = 'No results returned.';
          return;
        }
        resultsEl.className = '';
        resultsEl.innerHTML = results.map((result) => (
          '<article class="result">' +
            '<a href="' + escapeHtml(result.url) + '" target="_blank" rel="noreferrer">' + escapeHtml(result.title) + '</a>' +
            '<p>' + escapeHtml(result.snippet || '') + '</p>' +
            '<div class="muted">' + escapeHtml(result.url) + '</div>' +
          '</article>'
        )).join('');
      }

      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
      }

      document.getElementById('search-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const rawQuery = document.getElementById('query').value.trim();
        if (!rawQuery) return;
        latestResults = [];
        summarizeButton.disabled = true;
        summaryEl.className = 'muted';
        summaryEl.textContent = 'Run a search first.';
        searchButton.disabled = true;
        resultsEl.className = 'muted';
        resultsEl.textContent = 'Searching through shell broker...';
        try {
          const data = await requestCapability('web.search', {
            query: 'Tears of the Kingdom ' + rawQuery,
            limit: 5,
          });
          latestResults = data.results || [];
          renderResults(latestResults);
          summarizeButton.disabled = latestResults.length === 0;
        } catch (error) {
          resultsEl.className = 'error';
          resultsEl.textContent = error.message;
        } finally {
          searchButton.disabled = false;
        }
      });

      summarizeButton.addEventListener('click', async () => {
        summarizeButton.disabled = true;
        summaryEl.className = 'muted';
        summaryEl.textContent = 'Asking Claude through shell broker...';
        try {
          const prompt = 'You are helping with The Legend of Zelda: Tears of the Kingdom. Summarize these search results for a player. Be concise, cite uncertainty, and do not invent facts.\n\n' + JSON.stringify(latestResults, null, 2);
          const data = await requestCapability('llm.complete', { prompt, maxTokens: 700 });
          summaryEl.className = '';
          summaryEl.innerHTML = '<pre>' + escapeHtml(data.text) + '</pre><div class="muted">Model: ' + escapeHtml(data.model) + '</div>';
        } catch (error) {
          summaryEl.className = 'error';
          summaryEl.textContent = error.message;
        } finally {
          summarizeButton.disabled = latestResults.length === 0;
        }
      });
    </script>
  </body>
</html>`;
