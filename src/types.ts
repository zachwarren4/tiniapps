export type Capability =
  | 'web.search'
  | 'llm.complete'
  | 'browser.open'
  | 'reader.preview'
  | 'research.gather';

export interface MicroappManifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  capabilities: Capability[];
}

export interface BrokerRequest {
  microappId: string;
  capability: Capability;
  payload: unknown;
}

export interface BrokerResponse<T = unknown> {
  ok: boolean;
  microappId: string;
  capability: Capability;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export type LlmProvider = 'anthropic' | 'openrouter';

export interface ShellSettings {
  anthropicApiKeyStored: boolean;
  openrouterApiKeyStored: boolean;
  defaultLlmProvider: LlmProvider;
}

export interface SaveSettingsRequest {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  defaultLlmProvider: LlmProvider;
}
