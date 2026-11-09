import { z } from 'zod';

// The one place that reads process.env (tests/guards/env-access.test.ts). One schema describes
// every variable the API, the worker and the scripts use. Entry points call startupConfig()
// first, so a missing or invalid variable stops the process at once with a message that names
// it. Every other module calls getConfig(), which returns the object validated at startup.
// Importing this module, or any module that uses it, never throws.

export const MIN_PRODUCTION_OPS_TOKEN_LENGTH = 32;
// Cloudflare's published always-pass secret. Used outside production so dev and tests keep
// working without a key; production is refused without a real one (TURNSTILE_SECRET_KEY rule).
export const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
const MAIL_DRIVERS = ['brevo', 'smtp', 'memory'] as const;
const GATEWAYS = ['google', 'groq'] as const;

const required = () => z.string({ error: 'required' });
const optional = () => z.string().optional();
const integer = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce
    .number({ error: 'must be a number' })
    .int({ error: 'must be a whole number' })
    .min(min, { error: `must be at least ${min}` })
    .max(max, { error: `must be at most ${max}` });
const gateway = () =>
  z.enum(GATEWAYS, { error: `must be one of ${GATEWAYS.join(', ')}` }).optional();

const fields = z.object({
  PORT: integer(0, 65535).default(3000),
  DATABASE_URL: required(),
  // Neon's pooled endpoint cannot run migrations; migrate.ts prefers this direct one.
  DATABASE_DIRECT_URL: optional(),
  REDIS_URL: required(),
  SQS_ENDPOINT: optional(),
  SQS_QUEUE_NAME: required(),
  SQS_DLQ_NAME: optional(),
  WORKER_CONCURRENCY: integer(1).default(10),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: optional(),
  AWS_SECRET_ACCESS_KEY: optional(),
  PORTKEY_API_KEY: optional(),
  GOOGLE_API_KEY: optional(),
  GROQ_API_KEY: optional(),
  PRIMARY_GATEWAY: gateway(),
  PRIMARY_MODEL: optional(),
  BACKUP_GATEWAY: gateway(),
  BACKUP_API_KEY: optional(),
  BACKUP_MODEL: optional(),
  AI_TIMEOUT_MS: integer(1).default(30000),
  // Kept as a raw string so the typo message below can quote it.
  LLM_MODE: optional(),
  LLM_FAKE_DELAY_MS: integer(0).default(1500),
  OPS_TOKEN: optional(),
  SNS_ENDPOINT: optional(),
  SNS_TOPIC_ARN: optional(),
  SNS_ALERT_MAX_PER_HOUR: integer(0).default(20),
  MAIL_DRIVER: z
    .enum(MAIL_DRIVERS, { error: `MAIL_DRIVER must be one of ${MAIL_DRIVERS.join(', ')}` })
    .optional(),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: optional(),
  MAIL_FROM_NAME: z.string().default('Relay'),
  BREVO_API_KEY: optional(),
  MAIL_DAILY_CAP: integer(0).default(250),
  PUBLIC_SITE_URL: optional(),
  NODE_ENV: optional(),
  TURNSTILE_SECRET_KEY: optional(),
  TICKET_IP_HOURLY_LIMIT: integer(1).default(15),
  TICKET_DAILY_CAP: integer(0).default(100),
});

type Fields = z.output<typeof fields>;

// Each rule is its own refinement that always runs (`when`), so one bad variable never hides
// a rule about another. An entry is [variable, message, fails(env)].
const RULES: Array<[string, string | ((env: Fields) => string), (env: Fields) => boolean]> = [
  [
    'LLM_MODE',
    (env) => `LLM_MODE must be "real" or "fake", got "${env.LLM_MODE}"`,
    (env) => env.LLM_MODE !== undefined && env.LLM_MODE !== 'real' && env.LLM_MODE !== 'fake',
  ],
  [
    'LLM_MODE',
    'LLM_MODE=fake is not allowed when NODE_ENV=production',
    (env) => env.LLM_MODE === 'fake' && env.NODE_ENV === 'production',
  ],
  ['GOOGLE_API_KEY', 'required when LLM_MODE is real', (env) => isReal(env) && !env.GOOGLE_API_KEY],
  [
    'PORTKEY_API_KEY',
    'required when LLM_MODE is real',
    (env) => isReal(env) && !env.PORTKEY_API_KEY,
  ],
  [
    'MAIL_DRIVER',
    'MAIL_DRIVER must be brevo (or unset) in production',
    (env) => env.NODE_ENV === 'production' && !!env.MAIL_DRIVER && env.MAIL_DRIVER !== 'brevo',
  ],
  [
    'PUBLIC_SITE_URL',
    'PUBLIC_SITE_URL is required when MAIL_DRIVER is set',
    (env) => !!env.MAIL_DRIVER && !env.PUBLIC_SITE_URL,
  ],
  [
    'BREVO_API_KEY',
    'BREVO_API_KEY is required for the brevo driver',
    (env) => env.MAIL_DRIVER === 'brevo' && !env.BREVO_API_KEY,
  ],
  [
    'OPS_TOKEN',
    `OPS_TOKEN must be set to at least ${MIN_PRODUCTION_OPS_TOKEN_LENGTH} characters in production`,
    (env) =>
      env.NODE_ENV === 'production' &&
      (env.OPS_TOKEN?.length ?? 0) < MIN_PRODUCTION_OPS_TOKEN_LENGTH,
  ],
  // Story 7.5: production traffic must never be let through unverified.
  [
    'TURNSTILE_SECRET_KEY',
    'required when NODE_ENV=production',
    (env) => env.NODE_ENV === 'production' && !env.TURNSTILE_SECRET_KEY,
  ],
  // PA-7.3-02: real AWS needs real keys. Only a local endpoint (LocalStack) may use 'test'.
  [
    'AWS_ACCESS_KEY_ID',
    'required unless SQS_ENDPOINT is set',
    (env) => !env.SQS_ENDPOINT && !env.AWS_ACCESS_KEY_ID,
  ],
  [
    'AWS_SECRET_ACCESS_KEY',
    'required unless SQS_ENDPOINT is set',
    (env) => !env.SQS_ENDPOINT && !env.AWS_SECRET_ACCESS_KEY,
  ],
];

const isReal = (env: Fields) => env.LLM_MODE === undefined || env.LLM_MODE === 'real';

const checked = RULES.reduce(
  (schema, [variable, message, fails]) =>
    schema.refine((env) => !fails(env), {
      path: [variable],
      error: (issue) => (typeof message === 'string' ? message : message(issue.input as Fields)),
      when: () => true,
    }),
  fields as z.ZodType<Fields>
);

// Values filled in from other values. Also applied to the few variables a script asks for.
const derive = (env: Fields) => ({
  ...env,
  LLM_MODE: env.LLM_MODE === 'fake' ? ('fake' as const) : ('real' as const),
  AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID ?? 'test',
  AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY ?? 'test',
  SQS_DLQ_NAME: env.SQS_DLQ_NAME ?? `${env.SQS_QUEUE_NAME}-dlq`,
  TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET,
});

const envSchema = checked.transform(derive);

export type Config = Readonly<z.output<typeof envSchema>>;
export type RawEnv = Record<string, string | undefined>;
export interface ConfigIssue {
  variable: string;
  message: string;
}
export type ParseResult =
  { success: true; data: Config } | { success: false; issues: ConfigIssue[] };

// An empty value (`KEY=` in a .env file) counts as unset.
function normalize(env: RawEnv): RawEnv {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
}

export function parseEnv(env: RawEnv): ParseResult {
  const result = envSchema.safeParse(normalize(env));
  if (result.success) return { success: true, data: Object.freeze(result.data) };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      variable: String(issue.path[0] ?? 'environment'),
      message: issue.message,
    })),
  };
}

export class ConfigError extends Error {
  constructor(readonly issues: ConfigIssue[]) {
    super(
      'Invalid environment:\n' +
        issues
          .map(({ variable, message }) =>
            message.startsWith(variable) ? `  - ${message}` : `  - ${variable}: ${message}`
          )
          .join('\n')
    );
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: RawEnv = process.env): Config {
  const result = parseEnv(env);
  if (!result.success) throw new ConfigError(result.issues);
  return result.data;
}

export const ENV_KEYS = Object.keys(fields.shape);
const snapshot = (env: RawEnv) => ENV_KEYS.map((key) => env[key]);

let cache: { values: (string | undefined)[]; config: Config } | undefined;

/**
 * The validated configuration. process.env is parsed once and the result reused until one of
 * the schema's variables changes, which only tests do. The check walks the values and builds
 * no string, since this runs on every LLM call and ops-token check.
 */
export function getConfig(): Config {
  const values = snapshot(process.env);
  if (!cache || cache.values.some((value, index) => value !== values[index])) {
    cache = { values, config: loadConfig() };
  }
  return cache.config;
}

/** Validates the environment as the first step of a process. Exits at once when it is invalid. */
export function startupConfig(): Config {
  try {
    return getConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(err.message);
    return process.exit(1);
  }
}

/**
 * Startup check for a script that needs only some variables (migrate needs DATABASE_URL, not the
 * LLM or queue settings). The whole environment is judged by the one schema, but only the issues
 * of the named variables count, and only those variables are returned. `required` names variables
 * that are optional in the schema but that this script cannot run without.
 */
export function scriptConfig<K extends keyof Config>(
  keys: readonly K[],
  options: { required?: readonly (keyof Config)[] } = {},
  env: RawEnv = process.env
): Pick<Config, K> {
  try {
    return pickConfig(keys, options, env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(err.message);
    return process.exit(1);
  }
}

/**
 * Like scriptConfig() but throws a ConfigError instead of exiting. For lazy builders (the
 * database pool) that a script reaches without the rest of the environment being set.
 */
export function pickConfig<K extends keyof Config>(
  keys: readonly K[],
  options: { required?: readonly (keyof Config)[] } = {},
  env: RawEnv = process.env
): Pick<Config, K> {
  const clean = normalize(env);
  const result = parseEnv(env);
  const issues = result.success
    ? []
    : result.issues.filter((issue) => (keys as readonly string[]).includes(issue.variable));
  for (const variable of options.required ?? []) {
    if (clean[variable] === undefined) {
      issues.push({ variable, message: 'required by this script' });
    }
  }
  if (issues.length > 0) throw new ConfigError(issues);
  if (result.success) return pick(result.data, keys);
  // The rest of the environment is invalid, but the variables asked for are not: read them alone.
  const own = Object.fromEntries(
    Object.entries(fields.shape).map(([key, type]) => [key, type.safeParse(clean[key]).data])
  ) as Fields;
  return pick(derive(own), keys);
}

function pick<K extends keyof Config>(config: Config, keys: readonly K[]): Pick<Config, K> {
  return Object.fromEntries(keys.map((key) => [key, config[key]])) as Pick<Config, K>;
}

/**
 * Messages of the schema rules that concern the named variables, judged on the current
 * environment alone. The three assert* functions use this and keep their error texts.
 */
export function collectIssues(variables: string[], env: RawEnv = process.env): string[] {
  const result = parseEnv(env);
  if (result.success) return [];
  return result.issues.filter((i) => variables.includes(i.variable)).map((i) => i.message);
}

/** NODE_ENV for code that runs at import time (the logger), before anything is validated. */
export const nodeEnv = (): string | undefined => process.env.NODE_ENV;
