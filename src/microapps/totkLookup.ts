import type { MicroappManifest } from '../types';

export const totkLookupManifest: MicroappManifest = {
  id: 'totk-lookup-reference',
  name: 'TOTK Lookup',
  description: 'Reference microapp for researching Tears of the Kingdom through topic-scoped sources.',
  icon: '🗡️',
  version: '0.2.0',
  capabilities: ['web.search', 'llm.complete', 'browser.open', 'reader.preview', 'research.gather'],
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
      :root {
        color-scheme: dark;
        --bg: #24283b;
        --bg-dark: #1f2335;
        --bg-darker: #1a1b26;
        --panel: #24283b;
        --panel-alt: #292e42;
        --border: #414868;
        --border-muted: #343b58;
        --text: #c0caf5;
        --text-bright: #d5d6f3;
        --muted: #565f89;
        --blue: #7aa2f7;
        --purple: #bb9af7;
        --green: #9ece6a;
        --yellow: #e0af68;
        --red: #f7768e;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
      }
      body { margin: 0; background: var(--bg); color: var(--text); }
      main { max-width: 1180px; margin: 0 auto; padding: 24px; }
      h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: -0.02em; color: var(--text-bright); }
      h2, h3 { margin: 0; color: var(--text-bright); letter-spacing: -0.01em; }
      h2 { font-size: 14px; }
      h3 { font-size: 13px; }
      p { color: var(--text); line-height: 1.5; margin: 8px 0; }
      form { display: flex; gap: 8px; margin: 14px 0 6px; }
      input { flex: 1; border: 1px solid var(--border-muted); border-radius: 8px; background: var(--bg-darker); color: var(--text); padding: 9px 10px; font-size: 13px; }
      input:focus { outline: 1px solid var(--blue); border-color: var(--blue); }
      button { border: 1px solid var(--border); border-radius: 8px; background: var(--panel-alt); color: var(--text); font-weight: 600; padding: 7px 10px; cursor: pointer; font-size: 12px; }
      button.primary { background: var(--blue); border-color: var(--blue); color: var(--bg-darker); }
      button.secondary { background: var(--bg-dark); color: var(--purple); border-color: var(--border); }
      button.ghost { background: var(--bg-dark); color: var(--text); }
      button:disabled { cursor: not-allowed; opacity: 0.55; }
      .tabs { display: inline-flex; gap: 4px; border: 1px solid var(--border-muted); border-radius: 999px; background: var(--bg-dark); padding: 3px; margin: 4px 0 6px; }
      .tabs button { border: 0; background: transparent; color: var(--muted); padding: 5px 11px; border-radius: 999px; font-size: 12px; }
      .tabs button.active { background: var(--panel-alt); color: var(--text-bright); }
      [data-mode-panel] { display: none; }
      [data-mode-panel].visible { display: block; }
      .panel { border: 1px solid var(--border-muted); border-radius: 10px; background: var(--bg-dark); padding: 14px; margin-top: 12px; }
      .panel + .panel { margin-top: 12px; }
      .panel h2 { margin-bottom: 8px; }
      .layout { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr); gap: 12px; align-items: start; }
      .side-stack { display: grid; gap: 12px; }
      .source-picker { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 12px; }
      .source-picker label { border: 1px solid var(--border-muted); border-radius: 999px; background: var(--bg-dark); color: var(--text); padding: 5px 9px; cursor: pointer; font-size: 12px; }
      .source-picker input { width: auto; margin-right: 5px; accent-color: var(--blue); flex: 0 0 auto; padding: 0; }
      .expanded-queries { display: grid; gap: 6px; }
      .expanded-queries .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .expanded-queries code { font-family: inherit; color: var(--text); background: var(--bg-darker); border: 1px solid var(--border-muted); border-radius: 6px; padding: 3px 7px; font-size: 11px; overflow-wrap: anywhere; }
      .corpus-grid { display: grid; gap: 10px; }
      .corpus-card { border: 1px solid var(--border-muted); border-radius: 10px; background: var(--bg-darker); padding: 12px; display: grid; gap: 6px; }
      .corpus-card .result-title { color: var(--blue); font-size: 13px; font-weight: 700; }
      .corpus-card details { margin-top: 6px; }
      .corpus-card summary { cursor: pointer; color: var(--purple); font-size: 11px; }
      .corpus-card .preview-body { margin-top: 8px; display: grid; gap: 6px; }
      .corpus-card .preview-body p { margin: 0; font-size: 12px; line-height: 1.55; }
      .corpus-card .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
      .result { border-top: 1px solid var(--border-muted); padding: 11px 0; display: grid; gap: 6px; }
      .result:first-child { border-top: 0; padding-top: 0; }
      .result-title { color: var(--blue); font-size: 13px; font-weight: 700; }
      .result-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .source { display: inline-flex; width: fit-content; border-radius: 999px; background: var(--panel-alt); color: var(--purple); padding: 2px 7px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
      .url { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
      .preview-title { margin-bottom: 8px; }
      .preview-content p { color: var(--text); font-size: 12px; line-height: 1.55; margin: 0 0 10px; }
      pre { white-space: pre-wrap; color: var(--text); font-family: inherit; font-size: 12px; line-height: 1.55; margin: 0; }
      .muted { color: var(--muted); font-size: 12px; }
      .error { color: var(--red); }
      .answer-panel { display: grid; gap: 10px; }
      .notes-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .notes-list li { display: grid; grid-template-columns: auto auto 1fr; gap: 8px; align-items: baseline; border: 1px solid var(--border-muted); border-radius: 8px; padding: 7px 9px; background: var(--bg-darker); font-size: 11px; line-height: 1.45; }
      .notes-list .badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
      .notes-list .source-badge { color: var(--purple); }
      .notes-list .level-error { border-color: rgba(247, 118, 142, 0.45); }
      .notes-list .level-error .badge.level { color: var(--red); }
      .notes-list .level-warn .badge.level { color: var(--yellow); }
      .notes-list .level-info .badge.level { color: var(--blue); }
      .notes-list .message { color: var(--text); overflow-wrap: anywhere; }
      .notes-list code { font-family: inherit; color: var(--muted); }
      @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>TOTK Research</h1>
      <p>Ask a natural-language question. The shell expands it into Tears of the Kingdom searches across the web, YouTube, Reddit, and the Zelda wiki, gathers a small corpus of source-scoped previews, and lets the shell broker answer from that corpus on an explicit press.</p>

      <nav class="tabs" role="tablist">
        <button type="button" data-mode="research" class="active" role="tab">Research</button>
        <button type="button" data-mode="search" role="tab">Search</button>
      </nav>

      <section data-mode-panel="research" class="visible">
        <form id="research-form">
          <input id="research-query" autocomplete="off" placeholder="what do you get from the labyrinths..." />
          <button id="research-button" class="primary" type="submit">Gather</button>
        </form>
        <div class="source-picker" aria-label="Research sources">
          <label><input type="checkbox" name="research-source" value="web" checked /> Web</label>
          <label><input type="checkbox" name="research-source" value="youtube" checked /> YouTube</label>
          <label><input type="checkbox" name="research-source" value="reddit" checked /> Reddit</label>
          <label><input type="checkbox" name="research-source" value="wiki" checked /> Wiki</label>
        </div>
        <div class="muted">Corpus links open in a Tauri browser window owned by this TOTK context, not your general browser.</div>

        <section class="panel">
          <h2>Expanded Queries</h2>
          <div id="expanded-queries" class="muted">Run research to see how the shell scopes your question per source.</div>
        </section>

        <section class="panel" id="research-notes-panel" hidden>
          <h2>Provider Notes</h2>
          <ul id="research-notes" class="notes-list"></ul>
        </section>

        <div class="layout">
          <section class="panel">
            <h2>Corpus</h2>
            <div id="corpus" class="muted">No research gathered yet.</div>
          </section>
          <div class="side-stack">
            <section class="panel answer-panel">
              <div>
                <h2>Answer From Corpus</h2>
                <p class="muted">Synthesizes the gathered corpus through the shell LLM broker. Explicit button press, no ambient calls.</p>
              </div>
              <button id="answer-button" class="secondary" disabled>Answer From Corpus</button>
              <div id="answer" class="muted">Gather a corpus first.</div>
            </section>
          </div>
        </div>
      </section>

      <section data-mode-panel="search">
        <form id="search-form">
          <input id="search-query" autocomplete="off" placeholder="armor upgrade materials, shrine clue, quest name..." />
          <button id="search-button" class="primary" type="submit">Search</button>
        </form>
        <div class="source-picker" aria-label="Search sources">
          <label><input type="checkbox" name="search-source" value="web" checked /> Web</label>
          <label><input type="checkbox" name="search-source" value="youtube" checked /> YouTube</label>
          <label><input type="checkbox" name="search-source" value="reddit" checked /> Reddit</label>
          <label><input type="checkbox" name="search-source" value="wiki" checked /> Wiki</label>
        </div>
        <div class="muted">Raw search surface kept for direct lookup. Results pages open in this TOTK-owned Tauri browser.</div>

        <section class="panel" id="search-notes-panel" hidden>
          <h2>Provider Notes</h2>
          <ul id="search-notes" class="notes-list"></ul>
        </section>

        <div class="layout">
          <section class="panel results-panel">
            <h2>Indexed Results</h2>
            <div id="results" class="muted">No search yet.</div>
          </section>
          <div class="side-stack">
            <section class="panel">
              <h2>Preview</h2>
              <div id="preview" class="muted">Select Preview on a result to render readable content here.</div>
            </section>
            <section class="panel">
              <button id="summarize-button" class="secondary" disabled>Quick Summary</button>
              <div id="summary" class="muted">Run a search first.</div>
            </section>
          </div>
        </div>
      </section>
    </main>
    <script>
      const pending = new Map();
      const tabButtons = document.querySelectorAll('[data-mode]');
      const tabPanels = document.querySelectorAll('[data-mode-panel]');

      // Research-mode state
      let latestCorpus = [];
      let latestResearchQuery = '';
      const researchForm = document.getElementById('research-form');
      const researchQueryEl = document.getElementById('research-query');
      const researchButton = document.getElementById('research-button');
      const expandedQueriesEl = document.getElementById('expanded-queries');
      const researchNotesPanel = document.getElementById('research-notes-panel');
      const researchNotesEl = document.getElementById('research-notes');
      const corpusEl = document.getElementById('corpus');
      const answerButton = document.getElementById('answer-button');
      const answerEl = document.getElementById('answer');

      // Legacy search-mode state
      let latestResults = [];
      let latestSearchQuery = '';
      const searchForm = document.getElementById('search-form');
      const searchQueryEl = document.getElementById('search-query');
      const searchButton = document.getElementById('search-button');
      const searchNotesPanel = document.getElementById('search-notes-panel');
      const searchNotesEl = document.getElementById('search-notes');
      const resultsEl = document.getElementById('results');
      const previewEl = document.getElementById('preview');
      const summaryEl = document.getElementById('summary');
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
          }, 90000);
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

      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
      }

      function activateTab(mode) {
        tabButtons.forEach((button) => {
          button.classList.toggle('active', button.dataset.mode === mode);
        });
        tabPanels.forEach((panel) => {
          panel.classList.toggle('visible', panel.dataset.modePanel === mode);
        });
      }

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => activateTab(button.dataset.mode));
      });

      function renderExpandedQueries(expanded) {
        if (!expanded || !expanded.length) {
          expandedQueriesEl.className = 'muted';
          expandedQueriesEl.textContent = 'No expanded queries returned.';
          return;
        }
        expandedQueriesEl.className = 'expanded-queries';
        expandedQueriesEl.innerHTML = expanded.map((item) => (
          '<div class="row">' +
            '<span class="source">' + escapeHtml(item.source || 'web') + '</span>' +
            '<code>' + escapeHtml(item.query || '') + '</code>' +
          '</div>'
        )).join('');
      }

      function renderNotes(panel, list, notes) {
        if (!notes || !notes.length) {
          panel.hidden = true;
          list.innerHTML = '';
          return;
        }
        panel.hidden = false;
        list.innerHTML = notes.map((note) => {
          const level = note.level || 'info';
          return (
            '<li class="level-' + escapeHtml(level) + '">' +
              '<span class="badge source-badge">' + escapeHtml(note.source || '?') + '</span>' +
              '<span class="badge level">' + escapeHtml(level) + '</span>' +
              '<span class="message">' +
                escapeHtml(note.message || '') +
                ' <code>(' + escapeHtml(note.provider || '?') + ' / ' + escapeHtml(note.code || '?') + ')</code>' +
              '</span>' +
            '</li>'
          );
        }).join('');
      }

      function renderCorpus(corpus) {
        if (!corpus.length) {
          corpusEl.className = 'muted';
          corpusEl.textContent = 'No corpus returned. Check Provider Notes above for the actual upstream response.';
          return;
        }
        corpusEl.className = 'corpus-grid';
        corpusEl.innerHTML = corpus.map((entry, index) => {
          const previewParagraphs = Array.isArray(entry.preview) ? entry.preview.slice(0, 4) : [];
          const previewBlock = previewParagraphs.length
            ? '<details>' +
                '<summary>Preview (' + previewParagraphs.length + ' paragraph' + (previewParagraphs.length === 1 ? '' : 's') + ')</summary>' +
                '<div class="preview-body">' +
                  previewParagraphs.map((paragraph) => '<p>' + escapeHtml(paragraph) + '</p>').join('') +
                '</div>' +
              '</details>'
            : '<div class="muted">No readable preview captured for this source.</div>';
          return (
            '<article class="corpus-card">' +
              '<span class="source">' + escapeHtml(entry.source || 'web') + '</span>' +
              '<div class="result-title">' + escapeHtml(entry.title || '') + '</div>' +
              '<div class="url">' + escapeHtml(entry.url || '') + '</div>' +
              '<p>' + escapeHtml(entry.snippet || '') + '</p>' +
              previewBlock +
              '<div class="actions">' +
                '<button class="ghost" data-open-corpus="' + index + '">Open in TOTK Browser</button>' +
              '</div>' +
            '</article>'
          );
        }).join('');
      }

      function buildCorpusPrompt(query, corpus) {
        const trimmed = corpus.map((entry) => ({
          source: entry.source,
          title: entry.title,
          url: entry.url,
          snippet: entry.snippet,
          preview: Array.isArray(entry.preview) ? entry.preview.slice(0, 4) : undefined,
        }));
        return (
          'You are a Tears of the Kingdom research assistant. The user asked: ' + query + '\n\n' +
          'Answer the question using ONLY the corpus below, which was gathered through the shell broker from web, reddit, youtube, and the Zelda wiki. ' +
          'Cite sources by mentioning their source label and title. If the corpus is insufficient, say so explicitly. Do not invent facts.\n\n' +
          'CORPUS (JSON):\n' + JSON.stringify(trimmed, null, 2)
        );
      }

      researchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const rawQuery = researchQueryEl.value.trim();
        if (!rawQuery) return;
        const sources = Array.from(document.querySelectorAll('input[name="research-source"]:checked')).map((input) => input.value);
        if (!sources.length) {
          corpusEl.className = 'error';
          corpusEl.textContent = 'Pick at least one source.';
          return;
        }
        latestResearchQuery = rawQuery;
        latestCorpus = [];
        answerButton.disabled = true;
        answerEl.className = 'muted';
        answerEl.textContent = 'Gather a corpus first.';
        researchButton.disabled = true;
        expandedQueriesEl.className = 'muted';
        expandedQueriesEl.textContent = 'Expanding queries through shell broker...';
        renderNotes(researchNotesPanel, researchNotesEl, []);
        corpusEl.className = 'muted';
        corpusEl.textContent = 'Gathering corpus through shell broker...';
        try {
          const data = await requestCapability('research.gather', {
            query: rawQuery,
            sources,
            limit: 3,
          });
          renderExpandedQueries(data?.expandedQueries || []);
          renderNotes(researchNotesPanel, researchNotesEl, data?.notes || []);
          latestCorpus = Array.isArray(data?.corpus) ? data.corpus : [];
          renderCorpus(latestCorpus);
          answerButton.disabled = latestCorpus.length === 0;
        } catch (error) {
          expandedQueriesEl.className = 'error';
          expandedQueriesEl.textContent = error.message;
          corpusEl.className = 'error';
          corpusEl.textContent = error.message;
        } finally {
          researchButton.disabled = false;
        }
      });

      corpusEl.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-open-corpus]');
        if (!button) return;
        const entry = latestCorpus[Number(button.dataset.openCorpus)];
        if (!entry) return;
        button.disabled = true;
        try {
          await requestCapability('browser.open', { url: entry.url, title: entry.title });
        } catch (error) {
          corpusEl.className = 'error';
          corpusEl.textContent = 'Could not open result: ' + error.message;
        } finally {
          button.disabled = false;
        }
      });

      answerButton.addEventListener('click', async () => {
        if (!latestCorpus.length) return;
        answerButton.disabled = true;
        answerEl.className = 'muted';
        answerEl.textContent = 'Asking the configured LLM through shell broker...';
        try {
          const prompt = buildCorpusPrompt(latestResearchQuery, latestCorpus);
          const data = await requestCapability('llm.complete', { prompt, maxTokens: 1200 });
          answerEl.className = '';
          answerEl.innerHTML = '<pre>' + escapeHtml(data.text) + '</pre><div class="muted">Model: ' + escapeHtml(data.model) + '</div>';
        } catch (error) {
          answerEl.className = 'error';
          answerEl.textContent = error.message;
        } finally {
          answerButton.disabled = latestCorpus.length === 0;
        }
      });

      function renderResults(results) {
        if (!results.length) {
          resultsEl.className = 'muted';
          resultsEl.textContent = 'No results returned.';
          return;
        }
        resultsEl.className = '';
        resultsEl.innerHTML = results.map((result, index) => (
          '<article class="result">' +
            '<span class="source">' + escapeHtml(result.source || 'web') + '</span>' +
            '<div class="result-title">' + escapeHtml(result.title) + '</div>' +
            '<p>' + escapeHtml(result.snippet || '') + '</p>' +
            '<div class="url">' + escapeHtml(result.url) + '</div>' +
            '<div class="result-actions">' +
              '<button class="ghost" data-preview-index="' + index + '">Preview</button>' +
              '<button class="ghost" data-open-index="' + index + '">Open in TOTK Browser</button>' +
            '</div>' +
          '</article>'
        )).join('');
      }

      function renderPreview(data) {
        const content = Array.isArray(data.content) ? data.content : [];
        previewEl.className = '';
        previewEl.innerHTML =
          '<div class="preview-title">' +
            '<span class="source">' + escapeHtml(data.source || 'preview') + '</span>' +
            '<h3>' + escapeHtml(data.title || 'Preview') + '</h3>' +
            '<div class="url">' + escapeHtml(data.url || '') + '</div>' +
          '</div>' +
          '<div class="preview-content">' +
            (content.length ? content.map((paragraph) => '<p>' + escapeHtml(paragraph) + '</p>').join('') : '<p>No readable preview content found. Open the full page instead.</p>') +
          '</div>';
      }

      searchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const rawQuery = searchQueryEl.value.trim();
        if (!rawQuery) return;
        const sources = Array.from(document.querySelectorAll('input[name="search-source"]:checked')).map((input) => input.value);
        if (!sources.length) {
          resultsEl.className = 'error';
          resultsEl.textContent = 'Pick at least one source.';
          return;
        }
        latestSearchQuery = rawQuery;
        latestResults = [];
        summarizeButton.disabled = true;
        summaryEl.className = 'muted';
        summaryEl.textContent = 'Run a search first.';
        searchButton.disabled = true;
        renderNotes(searchNotesPanel, searchNotesEl, []);
        resultsEl.className = 'muted';
        resultsEl.textContent = 'Searching through shell broker...';
        try {
          const data = await requestCapability('web.search', {
            query: rawQuery,
            sources,
            limit: 4,
          });
          latestResults = data.results || [];
          renderResults(latestResults);
          renderNotes(searchNotesPanel, searchNotesEl, data?.notes || []);
          summarizeButton.disabled = latestResults.length === 0;
        } catch (error) {
          resultsEl.className = 'error';
          resultsEl.textContent = error.message;
        } finally {
          searchButton.disabled = false;
        }
      });

      resultsEl.addEventListener('click', async (event) => {
        const previewButton = event.target.closest('button[data-preview-index]');
        const openButton = event.target.closest('button[data-open-index]');
        const button = previewButton || openButton;
        if (!button) return;
        const result = latestResults[Number(button.dataset.previewIndex || button.dataset.openIndex)];
        if (!result) return;
        button.disabled = true;
        try {
          if (previewButton) {
            previewEl.className = 'muted';
            previewEl.textContent = 'Rendering preview...';
            const data = await requestCapability('reader.preview', { url: result.url });
            renderPreview(data);
          } else {
            await requestCapability('browser.open', { url: result.url, title: result.title });
          }
        } catch (error) {
          previewEl.className = 'error';
          previewEl.textContent = 'Could not render result: ' + error.message;
        } finally {
          button.disabled = false;
        }
      });

      summarizeButton.addEventListener('click', async () => {
        summarizeButton.disabled = true;
        summaryEl.className = 'muted';
        summaryEl.textContent = 'Asking the configured LLM through shell broker...';
        try {
          const prompt = 'You are helping with The Legend of Zelda: Tears of the Kingdom. The user searched for: ' + latestSearchQuery + '. Summarize the indexed search results for a player. Group useful findings by source where helpful, cite uncertainty, and do not invent facts. Keep it concise and actionable.\n\n' + JSON.stringify(latestResults, null, 2);
          const data = await requestCapability('llm.complete', { prompt, maxTokens: 900 });
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
