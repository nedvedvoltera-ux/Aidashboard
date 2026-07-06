export type HealthCheckMode = "http" | "tcp";

export type HealthProbeOptions = {
  mode: HealthCheckMode;
  ignoreTlsErrors: boolean;
};

export function getProbeOptions(system: {
  checkMode?: HealthCheckMode;
  ignoreTlsErrors?: boolean;
}): HealthProbeOptions {
  return {
    mode: system.checkMode === "tcp" ? "tcp" : "http",
    ignoreTlsErrors: Boolean(system.ignoreTlsErrors),
  };
}
