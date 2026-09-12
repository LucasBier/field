export type HostedConfig = {
  provider: 'deepseek' | 'ollama';
  key: string;
  model: string;
  endpoint: string;
  dailyMicros: number;
  inputRate: number;
  outputRate: number;
  visitorTurns: number;
  siteTurns: number;
  concurrency: number;
  maxOutput: number;
  timeoutMs: number;
  leaseMs: number;
};
export type SiteAccess = {
  provider?: 'deepseek' | 'ollama';
  enabled: boolean;
  model: string | null;
  remaining: number | null;
  resetAt: string | null;
};
export const HOSTED_LEASE_MS = 90000;
export const HOSTED_TIMEOUT_MS = 45000;
export const HOSTED_MESSAGES = {
  unavailable:
    'Shared conversations are not available yet. Room controls are available. Connect a model to start a conversation.',
  local_unavailable:
    'The local model is not ready. Start Ollama and check that the selected model is installed.',
  context_limit:
    'The selected context is too large for this local model. Shorten saved notes or recent conversation before trying again.',
  quota:
    'The conversation allowance has been reached. Please return after the daily reset.',
  busy: 'A response is already running, or Zuri is at capacity. Please try again shortly.',
  conflict: 'Your space changed. Refresh it before sending this message again.',
  context_changed:
    'Your understanding changed during this response. Send your message again with current memory.',
  permission:
    'An action was denied by your current permissions. No model actions were saved.',
  provider:
    'The model service could not complete this response. Please try again later.',
  invalid_response:
    'The response was incomplete or invalid. No model actions were saved.',
  cancelled: 'Response stopped. No pending model actions were saved.',
  timeout: 'The response took too long. No pending model actions were saved.',
  storage:
    'The result could not be confirmed. Refresh your space before retrying.',
} as const;
export type HostedCode = keyof typeof HOSTED_MESSAGES;
export class HostedError extends Error {
  constructor(
    public code: HostedCode,
    public status = 400,
  ) {
    super(HOSTED_MESSAGES[code]);
  }
}
function positive(value: string | undefined, fallback?: number, max = 100000) {
  const n = value?.trim() ? Number(value) : fallback;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max
    ? n
    : null;
}
/** No paid path is enabled until the operator explicitly configures its budget and rates. */
export function hostedConfig(
  env: Record<string, string | undefined>,
  development = false,
): HostedConfig | null {
  if (env.FIELD_AI_ENABLED !== 'true') return null;
  const provider = env.FIELD_AI_PROVIDER || 'deepseek';
  if (provider !== 'deepseek' && provider !== 'ollama') return null;
  const visitor = positive(env.FIELD_AI_VISITOR_TURNS, 20, 1000);
  const site = positive(env.FIELD_AI_SITE_TURNS, 1000, 100000);
  const concurrency = positive(
    env.FIELD_AI_CONCURRENCY,
    provider === 'ollama' ? 1 : 4,
    provider === 'ollama' ? 1 : 100,
  );
  const maxOutput = positive(env.FIELD_AI_MAX_OUTPUT, 1200, 3000);
  if (
    !visitor ||
    !site ||
    !concurrency ||
    !maxOutput ||
    ![visitor, site, concurrency, maxOutput].every(Number.isInteger)
  )
    return null;
  if (provider === 'ollama') {
    // Cloudflare production cannot reach a model on the developer's computer.
    if (!development) return null;
    const model = env.FIELD_AI_MODEL || '';
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/.test(model) ||
      /cloud/i.test(model)
    )
      return null;
    return {
      provider,
      key: '',
      model,
      endpoint: 'http://127.0.0.1:11434/api/chat',
      dailyMicros: 0,
      inputRate: 0,
      outputRate: 0,
      visitorTurns: visitor,
      siteTurns: site,
      concurrency,
      maxOutput,
      timeoutMs: 120000,
      leaseMs: 180000,
    };
  }
  const key = env.FIELD_AI_KEY?.trim() || '';
  const model = env.FIELD_AI_MODEL || 'deepseek-v4-flash';
  const daily = positive(env.FIELD_AI_DAILY_USD, undefined, 10000);
  const input = positive(env.FIELD_AI_INPUT_USD_PER_MILLION);
  const output = positive(env.FIELD_AI_OUTPUT_USD_PER_MILLION);
  if (
    !/^[-A-Za-z0-9_.]{10,256}$/.test(key) ||
    !['deepseek-v4-flash', 'deepseek-v4-pro'].includes(model) ||
    !daily ||
    !input ||
    !output ||
    !visitor ||
    !site ||
    !concurrency ||
    !maxOutput ||
    ![visitor, site, concurrency, maxOutput].every(Number.isInteger)
  )
    return null;
  let endpoint = 'https://api.deepseek.com/chat/completions';
  // A loopback-only fixture for offline integration tests; never honored in production.
  if (development && env.FIELD_AI_TEST_ENDPOINT) {
    try {
      const url = new URL(env.FIELD_AI_TEST_ENDPOINT);
      if (
        url.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username ||
        url.password
      )
        return null;
      endpoint = url.href;
    } catch {
      return null;
    }
  }
  return {
    provider,
    key,
    model,
    endpoint,
    dailyMicros: Math.floor(daily * 1e6),
    inputRate: Math.ceil(input * 1e6),
    outputRate: Math.ceil(output * 1e6),
    visitorTurns: visitor,
    siteTurns: site,
    concurrency,
    maxOutput,
    timeoutMs: HOSTED_TIMEOUT_MS,
    leaseMs: HOSTED_LEASE_MS,
  };
}
export function usageMicros(
  input: number,
  output: number,
  config: HostedConfig,
) {
  return Math.ceil(
    (input * config.inputRate + output * config.outputRate) / 1e6,
  );
}
export function reserveMicros(messages: unknown, config: HostedConfig) {
  const bytes = new TextEncoder().encode(JSON.stringify(messages)).byteLength;
  // A UTF-8 byte bound leaves room for every text token, framing and generation.
  // Refuse excess context before Ollama can silently truncate the beginning.
  if (config.provider === 'ollama' && bytes + config.maxOutput + 512 > 16384)
    throw new HostedError('context_limit');
  if (bytes > 65536) throw new HostedError('invalid_response');
  // UTF-8 bytes plus framing headroom deliberately overestimate ordinary text tokenization.
  return usageMicros(bytes + 4096, config.maxOutput, config);
}
export const utcDay = () => new Date().toISOString().slice(0, 10);
export const nextReset = () =>
  new Date(Date.parse(utcDay()) + 86400000).toISOString();
