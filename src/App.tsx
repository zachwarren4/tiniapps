import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { totkLookupHtml, totkLookupManifest } from './microapps/totkLookup';
import type { BrokerResponse, Capability, MicroappManifest } from './types';

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
    (candidate.capability === 'web.search' || candidate.capability === 'llm.complete')
  );
}

function App() {
  const [activeId, setActiveId] = useState(referenceApps[0].manifest.id);
  const [apiKey, setApiKey] = useState('');
  const [credentialReady, setCredentialReady] = useState<boolean | null>(null);
  const [credentialMessage, setCredentialMessage] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeApp = useMemo(
    () => referenceApps.find((app) => app.manifest.id === activeId) ?? referenceApps[0],
    [activeId],
  );

  const refreshCredentialStatus = useCallback(async () => {
    const ready = await invoke<boolean>('credential_status', { account: 'anthropic-api-key' });
    setCredentialReady(ready);
  }, []);

  useEffect(() => {
    void refreshCredentialStatus();
  }, [refreshCredentialStatus]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !isCapabilityMessage(event.data)) return;

      const message = event.data;
      const manifest = activeApp.manifest;
      if (!manifest.capabilities.includes(message.capability)) {
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
  }, [activeApp]);

  async function saveAnthropicKey() {
    if (!apiKey.trim()) return;
    setCredentialMessage('Saving key to OS keychain...');
    await invoke('save_credential', {
      account: 'anthropic-api-key',
      secret: apiKey.trim(),
    });
    setApiKey('');
    setCredentialMessage('Anthropic key saved in the OS keychain.');
    await refreshCredentialStatus();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Microapp Shell v0</p>
          <h1>Registry</h1>
          <p className="subtle">Reference fixtures live here for now. Generated microapps should become separate repos registered by path.</p>
        </div>

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

        <section className="card">
          <h2>Credentials</h2>
          <p className={credentialReady ? 'status good' : 'status'}>
            Anthropic key: {credentialReady === null ? 'checking...' : credentialReady ? 'stored' : 'missing'}
          </p>
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-ant-..."
            type="password"
          />
          <button onClick={saveAnthropicKey} disabled={!apiKey.trim()}>Save Anthropic Key</button>
          {credentialMessage && <p className="subtle">{credentialMessage}</p>}
        </section>

        <section className="card muted-actions">
          <h2>Next Shell Actions</h2>
          <button disabled>Create New</button>
          <button disabled>Edit</button>
          <button disabled>Delete</button>
          <p className="subtle">These are placeholders until generator and git integration land.</p>
        </section>
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
