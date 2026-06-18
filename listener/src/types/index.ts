export interface ContractConfig {
  address: string;
  events: string[];
}

export interface DiscordConfig {
  webhookUrl: string;
  webhookId: string;
  retryCount?: number;
  backoffBaseSeconds?: number;
}

export interface Config {
  stellarNetwork: string;
  stellarRpcUrl: string;
  contractAddresses: ContractConfig[];
  pollIntervalMs: number;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
  eventsApiPort: number;
  eventsApiCorsOrigin: string;
  discord?: DiscordConfig;
}
