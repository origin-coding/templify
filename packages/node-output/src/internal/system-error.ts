export interface SystemErrorDetail {
  readonly systemCode?: string;
}

export function systemErrorDetail(cause: unknown): SystemErrorDetail {
  return typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    typeof cause.code === 'string'
    ? { systemCode: cause.code }
    : {};
}
