export type HubSettings = {
  save_history?: boolean;
  retention_mode?: string;
  retention_count?: number;
  retention_size_mb?: number;
  debug_mode?: boolean;
  log_level?: string;
  max_upload_size_mb?: number;
  max_log_size_mb?: number;
  host_status_ttl_seconds?: number;
};

export type HubStats = { count?: number; size_mb?: number };

export type SettingsResponse = {
  settings?: HubSettings;
  stats?: HubStats;
};
