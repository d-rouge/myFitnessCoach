export type ProviderCapability =
  | "activities"
  | "sleep"
  | "hrv"
  | "weight"
  | "nutrition"
  | "workouts"
  | "write_routines"
  | "write_workouts";

export interface ProviderConnection {
  provider: string;
  status: "connected" | "expired" | "error" | "disconnected";
  expiresAt?: string;
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface ProviderAdapter<TConfig, TRaw, TCanonical> {
  readonly provider: string;
  readonly capabilities: ProviderCapability[];

  connect(config: TConfig): Promise<ProviderConnection>;
  refresh(connection: ProviderConnection): Promise<ProviderConnection>;
  healthCheck(connection: ProviderConnection): Promise<ProviderHealth>;
  pull(
    connection: ProviderConnection,
    cursor?: string,
  ): Promise<{ items: TCanonical[]; nextCursor?: string; raw?: TRaw[] }>;
}
