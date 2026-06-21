import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { totkLookupHtml, totkLookupManifest } from './microapps/totkLookup';
import type { BrokerResponse, Capability, LlmProvider, MicroappManifest, SaveSettingsRequest, ShellSettings } from './types';

interface RuntimeMicroapp {
  manifest: MicroappManifest;
  html: string;
}

interface CapabilityMessage {
  type: 'microapp.capability.request';
  requestId: string;
  capability: Capability;
  payload: unknown;
}

interface DebugLogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'error';
  message: string;
}

const referenceApps: RuntimeMicroapp[] = [
  {
    manifest: totkLookupManifest,
    html: totkLookupHtml,
  },
];

function isCapabilityMessage(value: unknown): value is CapabilityMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CapabilityMessage>;
  return (
    candidate.type === 'microapp.capability.request' &&
    typeof candidate.requestId === 'string' &&
    (
      candidate.capability === 'web.search' ||
      candidate.capability === 'llm.complete' ||
      candidate.capability === 'browser.open' ||
      candidate.capability === 'reader.preview' ||
      candidate.capability === 'research.gather'
    )
  );
}

function App() {
  const [activeId, setActiveId] = useState(referenceApps[0].manifest.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<ShellSettings | null>(null);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [defaultLlmProvider, setDefaultLlmProvider] = useState<LlmProvider>('anthropic');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeApp = useMemo(
    () => referenceApps.find((app) => app.manifest.id === activeId) ?? referenceApps[0],
    [activeId],
  );

  const refreshSettings = useCallback(async () => {
    const nextSettings = await invoke<ShellSettings>('get_settings');
    setSettings(nextSettings);
    setDefaultLlmProvider(nextSettings.defaultLlmProvider);
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const addDebugLog = useCallback((level: DebugLogEntry['level'], message: string) => {
    setDebugLog((entries) => [
      {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
      },
      ...entries,
    ].slice(0, 24));
  }, []);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !isCapabilityMessage(event.data)) return;

      const message = event.data;
      const manifest = activeApp.manifest;
      addDebugLog('info', `${manifest.name} -> ${message.capability}`);
      if (!manifest.capabilities.includes(message.capability)) {
        addDebugLog('error', `${manifest.name} denied ${message.capability}`);
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: 'microapp.capability.response',
            requestId: message.requestId,
            ok: false,
            error: {
              code: 'capability_denied',
              message: `${manifest.name} has not declared ${message.capability}`,
            },
          },
          '*',
        );
        return;
      }

      try {
        const response = await invoke<BrokerResponse>('broker_request', {
          request: {
            microappId: manifest.id,
            capability: message.capability,
            payload: message.payload,
          },
        });

        addDebugLog(
          response.ok ? 'info' : 'error',
          response.ok
            ? `${message.capability} ok`
            : `${message.capability} failed: ${response.error?.message ?? response.error?.code ?? 'unknown error'}`,
        );

        iframeRef.current?.contentWindow?.postMessage(
          {
            type: 'microapp.capability.response',
            requestId: message.requestId,
            ok: response.ok,
            data: response.data,
            error: response.error,
          },
          '*',
        );
      } catch (error) {
        addDebugLog('error', `${message.capability} crashed: ${error instanceof Error ? error.message : String(error)}`);
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: 'microapp.capability.response',
            requestId: message.requestId,
            ok: false,
            error: {
              code: 'broker_error',
              message: error instanceof Error ? error.message : String(error),
            },
          },
          '*',
        );
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeApp, addDebugLog]);

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsMessage('Saving settings to the OS keychain...');
    try {
      const payload: SaveSettingsRequest = {
        defaultLlmProvider,
      };
      if (anthropicApiKey.trim()) payload.anthropicApiKey = anthropicApiKey.trim();
      if (openrouterApiKey.trim()) payload.openrouterApiKey = openrouterApiKey.trim();

      const nextSettings = await invoke<ShellSettings>('save_settings', { settings: payload });
      setSettings(nextSettings);
      setDefaultLlmProvider(nextSettings.defaultLlmProvider);
      setAnthropicApiKey('');
      setOpenrouterApiKey('');
      setSettingsMessage('Settings saved.');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingsSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="shell-title">
          <div>
            <p className="eyebrow">Microapp Shell v0</p>
            <h1>{settingsOpen ? 'Settings' : 'Registry'}</h1>
            <p className="subtle">
              {settingsOpen
                ? 'Shell-owned credentials and provider defaults.'
                : 'Reference fixtures live here for now. Generated microapps should become separate repos registered by path.'}
            </p>
          </div>
          <button
            className={settingsOpen ? 'icon-button active' : 'icon-button'}
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            title={settingsOpen ? 'Back to registry' : 'Open settings'}
            aria-label={settingsOpen ? 'Back to registry' : 'Open settings'}
          >
            {settingsOpen ? '←' : '⚙'}
          </button>
        </div>

        {settingsOpen ? (
          <section className="card settings-card">
            <h2>LLM Broker</h2>
            <p className={settings?.anthropicApiKeyStored ? 'status good' : 'status'}>
              Anthropic key: {settings === null ? 'checking...' : settings.anthropicApiKeyStored ? 'stored' : 'missing'}
            </p>
            <input
              value={anthropicApiKey}
              onChange={(event) => setAnthropicApiKey(event.target.value)}
              placeholder="sk-ant-..."
              type="password"
              autoComplete="off"
            />
            <p className={settings?.openrouterApiKeyStored ? 'status good' : 'status'}>
              OpenRouter key: {settings === null ? 'checking...' : settings.openrouterApiKeyStored ? 'stored' : 'missing'}
            </p>
            <input
              value={openrouterApiKey}
              onChange={(event) => setOpenrouterApiKey(event.target.value)}
              placeholder="sk-or-..."
              type="password"
              autoComplete="off"
            />
            <label className="field-label" htmlFor="default-provider">Default provider</label>
            <select
              id="default-provider"
              value={defaultLlmProvider}
              onChange={(event) => setDefaultLlmProvider(event.target.value as LlmProvider)}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            <button onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving ? 'Saving...' : 'Save Settings'}
            </button>
            {settingsMessage && <p className="subtle">{settingsMessage}</p>}
          </section>
        ) : (
          <>
            <section className="card">
              <h2>Installed Microapps</h2>
              {referenceApps.map((app) => (
                <button
                  className={app.manifest.id === activeId ? 'microapp active' : 'microapp'}
                  key={app.manifest.id}
                  onClick={() => setActiveId(app.manifest.id)}
                >
                  <span className="icon" aria-hidden="true">{app.manifest.icon}</span>
                  <span>
                    <strong>{app.manifest.name}</strong>
                    <small>{app.manifest.description}</small>
                  </span>
                </button>
              ))}
            </section>

            <section className="card muted-actions">
              <h2>Next Shell Actions</h2>
              <button disabled>Create New</button>
              <button disabled>Edit</button>
              <button disabled>Delete</button>
              <p className="subtle">These are placeholders until generator and git integration land.</p>
            </section>

            <section className="card debug-card">
              <div className="card-heading">
                <h2>Bridge Log</h2>
                <button onClick={() => setDebugLog([])} disabled={debugLog.length === 0}>Clear</button>
              </div>
              {debugLog.length === 0 ? (
                <p className="subtle">Capability requests will appear here.</p>
              ) : (
                <ol className="debug-log">
                  {debugLog.map((entry) => (
                    <li className={entry.level} key={entry.id}>
                      <time>{entry.timestamp}</time>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Sandboxed Runtime</p>
            <h2>{activeApp.manifest.name}</h2>
          </div>
          <div className="capabilities">
            {activeApp.manifest.capabilities.map((capability) => (
              <span key={capability}>{capability}</span>
            ))}
          </div>
        </header>

        <iframe
          ref={iframeRef}
          title={activeApp.manifest.name}
          className="microapp-frame"
          sandbox="allow-scripts"
          srcDoc={activeApp.html}
        />
      </main>
    </div>
  );
}

export default App;
