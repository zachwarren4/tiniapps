export type Capability = 'web.search' | 'llm.complete';

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
