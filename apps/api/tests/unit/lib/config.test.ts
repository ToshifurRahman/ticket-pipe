import { describe, expect, it, vi } from 'vitest';

import {
  collectIssues,
  ConfigError,
  getConfig,
  loadConfig,
  nodeEnv,
  parseEnv,
  scriptConfig,
  startupConfig,
} from '../../../src/lib/config.js';

const MINIMAL: Record<string, string> = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  SQS_QUEUE_NAME: 'tickets',
  SQS_ENDPOINT: 'http://localhost:4566',
  LLM_MODE: 'fake',
};

const REAL: Record<string, string> = {
  DATABASE_URL: MINIMAL.DATABASE_URL,
  REDIS_URL: MINIMAL.REDIS_URL,
  SQS_QUEUE_NAME: 'tickets',
  AWS_ACCESS_KEY_ID: 'AKIA',
  AWS_SECRET_ACCESS_KEY: 'secret',
  GOOGLE_API_KEY: 'g',
  PORTKEY_API_KEY: 'p',
};

function messages(env: Record<string, string | undefined>): string[] {
  const result = parseEnv(env);
  return result.success ? [] : result.issues.map((i) => `${i.variable}: ${i.message}`);
}

describe('parseEnv', () => {
  it('accepts a minimal valid environment and applies the documented defaults', () => {
    const result = parseEnv(MINIMAL);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      PORT: 3000,
      AWS_REGION: 'us-east-1',
      WORKER_CONCURRENCY: 10,
      AI_TIMEOUT_MS: 30000,
      LLM_FAKE_DELAY_MS: 1500,
      SNS_ALERT_MAX_PER_HOUR: 20,
      MAIL_DAILY_CAP: 250,
      MAIL_FROM_NAME: 'Relay',
      SMTP_URL: 'smtp://localhost:1025',
      LLM_MODE: 'fake',
      SQS_DLQ_NAME: 'tickets-dlq',
    });
  });

  it('accepts PORT=0 (an ephemeral port) and rejects a negative port', () => {
    const zero = parseEnv({ ...MINIMAL, PORT: '0' });
    expect(zero.success && zero.data.PORT).toBe(0);
    expect(messages({ ...MINIMAL, PORT: '-1' }).some((m) => m.startsWith('PORT:'))).toBe(true);
  });

  it('treats empty strings as unset', () => {
    expect(parseEnv({ ...MINIMAL, PORT: '', LLM_MODE: '' }).success).toBe(false);
    const result = parseEnv({ ...MINIMAL, PORT: '', MAIL_DRIVER: '' });
    expect(result.success && result.data.PORT).toBe(3000);
    expect(result.success && result.data.MAIL_DRIVER).toBeUndefined();
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'SQS_QUEUE_NAME'])(
    'rejects a missing %s by name',
    (key) => {
      const env = { ...MINIMAL };
      delete env[key];
      expect(messages(env)).toContain(`${key}: required`);
    }
  );

  it('lists every missing variable, not just the first', () => {
    const found = messages({});
    for (const key of ['DATABASE_URL', 'REDIS_URL', 'SQS_QUEUE_NAME']) {
      expect(found.some((m) => m.startsWith(`${key}:`))).toBe(true);
    }
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['WORKER_CONCURRENCY', '0'],
    ['AI_TIMEOUT_MS', 'soon'],
    ['LLM_FAKE_DELAY_MS', '-1'],
    ['SNS_ALERT_MAX_PER_HOUR', '1.5'],
    ['MAIL_DAILY_CAP', 'lots'],
  ])('rejects %s=%s by name', (key, value) => {
    expect(messages({ ...MINIMAL, [key]: value }).some((m) => m.startsWith(`${key}:`))).toBe(true);
  });

  it('rejects an unknown PRIMARY_GATEWAY and an unknown MAIL_DRIVER', () => {
    expect(messages({ ...MINIMAL, PRIMARY_GATEWAY: 'x' }).join()).toContain('PRIMARY_GATEWAY');
    expect(messages({ ...MINIMAL, BACKUP_GATEWAY: 'x' }).join()).toContain('BACKUP_GATEWAY');
    expect(messages({ ...MINIMAL, MAIL_DRIVER: 'pigeon' })).toContain(
      'MAIL_DRIVER: MAIL_DRIVER must be one of brevo, smtp, memory'
    );
  });

  describe('LLM mode rules', () => {
    it('keeps the typo message', () => {
      expect(messages({ ...MINIMAL, LLM_MODE: 'fak' })).toContain(
        'LLM_MODE: LLM_MODE must be "real" or "fake", got "fak"'
      );
    });
    it('refuses fake mode in production', () => {
      expect(messages({ ...MINIMAL, NODE_ENV: 'production' })).toContain(
        'LLM_MODE: LLM_MODE=fake is not allowed when NODE_ENV=production'
      );
    });
    it('requires GOOGLE_API_KEY and PORTKEY_API_KEY when the mode is real (also when unset)', () => {
      const found = messages({ ...REAL, GOOGLE_API_KEY: undefined, PORTKEY_API_KEY: undefined });
      expect(found).toContain('GOOGLE_API_KEY: required when LLM_MODE is real');
      expect(found).toContain('PORTKEY_API_KEY: required when LLM_MODE is real');
      expect(messages(REAL)).toEqual([]);
    });
  });

  describe('mail rules', () => {
    const mail = { ...MINIMAL, MAIL_DRIVER: 'brevo', PUBLIC_SITE_URL: 'https://x.test' };
    it('requires PUBLIC_SITE_URL when a driver is set', () => {
      expect(messages({ ...MINIMAL, MAIL_DRIVER: 'smtp' })).toContain(
        'PUBLIC_SITE_URL: PUBLIC_SITE_URL is required when MAIL_DRIVER is set'
      );
    });
    it('requires BREVO_API_KEY for the brevo driver', () => {
      expect(messages(mail)).toContain(
        'BREVO_API_KEY: BREVO_API_KEY is required for the brevo driver'
      );
      expect(messages({ ...mail, BREVO_API_KEY: 'k' })).toEqual([]);
    });
    it('allows only brevo in production', () => {
      const prod = {
        ...REAL,
        NODE_ENV: 'production',
        OPS_TOKEN: 'x'.repeat(32),
        MAIL_DRIVER: 'smtp',
        PUBLIC_SITE_URL: 'https://x.test',
      };
      expect(messages(prod)).toContain(
        'MAIL_DRIVER: MAIL_DRIVER must be brevo (or unset) in production'
      );
    });
  });

  describe('OPS_TOKEN rule', () => {
    it('needs 32 characters in production only', () => {
      const prod = { ...REAL, NODE_ENV: 'production' };
      const expected = 'OPS_TOKEN: OPS_TOKEN must be set to at least 32 characters in production';
      expect(messages(prod)).toContain(expected);
      expect(messages({ ...prod, OPS_TOKEN: 'short' })).toContain(expected);
      expect(messages({ ...prod, OPS_TOKEN: 'x'.repeat(32) })).toEqual([]);
      expect(messages({ ...REAL, NODE_ENV: 'test' })).toEqual([]);
    });
  });

  describe('AWS keys', () => {
    it('are required, by name, when SQS_ENDPOINT is unset', () => {
      const env = { ...REAL, AWS_ACCESS_KEY_ID: undefined, AWS_SECRET_ACCESS_KEY: undefined };
      const found = messages(env);
      expect(found).toContain('AWS_ACCESS_KEY_ID: required unless SQS_ENDPOINT is set');
      expect(found).toContain('AWS_SECRET_ACCESS_KEY: required unless SQS_ENDPOINT is set');
    });
    it('default to "test" when SQS_ENDPOINT is set', () => {
      const result = parseEnv(MINIMAL);
      expect(result.success && result.data.AWS_ACCESS_KEY_ID).toBe('test');
      expect(result.success && result.data.AWS_SECRET_ACCESS_KEY).toBe('test');
    });
    it('keep explicit values when SQS_ENDPOINT is set', () => {
      const result = parseEnv({ ...MINIMAL, AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' });
      expect(result.success && result.data.AWS_ACCESS_KEY_ID).toBe('a');
    });
  });

  it('runs the rules even when another variable is missing', () => {
    expect(messages({ LLM_MODE: 'fak' }).join('\n')).toContain('got "fak"');
  });
});

describe('loadConfig', () => {
  it('returns a frozen object', () => {
    const config = loadConfig(MINIMAL);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('throws a ConfigError that names each bad variable', () => {
    let error: unknown;
    try {
      loadConfig({});
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toMatch(/^Invalid environment:/);
    expect((error as Error).message).toContain('DATABASE_URL: required');
    expect((error as Error).message).toContain('REDIS_URL: required');
    expect((error as Error).message).not.toContain('at ');
  });

  it('does not repeat the variable name when the message already starts with it', () => {
    expect(() => loadConfig({ ...MINIMAL, LLM_MODE: 'x' })).toThrow(
      /\n {2}- LLM_MODE must be "real" or "fake", got "x"/
    );
  });
});

describe('getConfig', () => {
  const keys = Object.keys(MINIMAL);
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const restore = () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };

  it('validates process.env once and returns the same object while it is unchanged', () => {
    Object.assign(process.env, MINIMAL);
    try {
      expect(getConfig()).toBe(getConfig());
    } finally {
      restore();
    }
  });

  it('follows a later change of the environment (tests change variables between cases)', () => {
    Object.assign(process.env, MINIMAL, { PORT: '4001' });
    try {
      expect(getConfig().PORT).toBe(4001);
      process.env.PORT = '4002';
      expect(getConfig().PORT).toBe(4002);
    } finally {
      delete process.env.PORT;
      restore();
    }
  });

  it('throws when the environment is invalid', () => {
    delete process.env.DATABASE_URL;
    try {
      expect(() => getConfig()).toThrow(/DATABASE_URL: required/);
    } finally {
      restore();
    }
  });
});

describe('collectIssues and nodeEnv', () => {
  it('returns only the messages of the named variables', () => {
    expect(collectIssues(['LLM_MODE'], { LLM_MODE: 'x' })).toEqual([
      'LLM_MODE must be "real" or "fake", got "x"',
    ]);
    expect(collectIssues(['OPS_TOKEN'], { LLM_MODE: 'x' })).toEqual([]);
  });

  it('nodeEnv reads NODE_ENV without validating anything else', () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'staging';
    try {
      expect(nodeEnv()).toBe('staging');
    } finally {
      process.env.NODE_ENV = before;
    }
  });
});

describe('scriptConfig', () => {
  const exiting = () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    return { exit, error };
  };

  it('returns its own variables when the rest of the environment is empty', () => {
    const config = scriptConfig(['DATABASE_URL'], {}, { DATABASE_URL: 'postgres://x' });
    expect(config).toEqual({ DATABASE_URL: 'postgres://x' });
  });

  it('applies defaults and derived values to the variables it was asked for', () => {
    const config = scriptConfig(
      ['SQS_QUEUE_NAME', 'SQS_DLQ_NAME', 'AWS_ACCESS_KEY_ID', 'AWS_REGION'],
      {},
      { SQS_QUEUE_NAME: 'q', SQS_ENDPOINT: 'http://x' }
    );
    expect(config).toEqual({
      SQS_QUEUE_NAME: 'q',
      SQS_DLQ_NAME: 'q-dlq',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_REGION: 'us-east-1',
    });
  });

  it('exits naming only its own missing variables', () => {
    const { exit, error } = exiting();
    try {
      expect(() => scriptConfig(['DATABASE_URL'], {}, {})).toThrow('exit 1');
      const printed = error.mock.calls.join('');
      expect(printed).toContain('DATABASE_URL: required');
      expect(printed).not.toContain('REDIS_URL');
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });

  it('names an extra variable the script requires, together with the schema issues', () => {
    const { exit, error } = exiting();
    try {
      expect(() =>
        scriptConfig(['SQS_QUEUE_NAME', 'SQS_ENDPOINT'], { required: ['SQS_ENDPOINT'] }, {})
      ).toThrow('exit 1');
      const printed = error.mock.calls.join('');
      expect(printed).toContain('SQS_ENDPOINT: required by this script');
      expect(printed).toContain('SQS_QUEUE_NAME: required');
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });

  it('exits on an invalid variable it uses, not on one it does not', () => {
    const { exit, error } = exiting();
    try {
      expect(() => scriptConfig(['PORT'], {}, { PORT: 'x' })).toThrow('exit 1');
      expect(error.mock.calls.join('')).toContain('PORT: must be a number');
      expect(scriptConfig(['DATABASE_URL'], {}, { DATABASE_URL: 'd', PORT: 'x' })).toEqual({
        DATABASE_URL: 'd',
      });
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });
});

describe('startupConfig', () => {
  it('exits with status 1 and prints the message when the environment is invalid', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => startupConfig()).toThrow('exit 1');
      expect(error.mock.calls.join('')).toContain('DATABASE_URL: required');
    } finally {
      exit.mockRestore();
      error.mockRestore();
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it('returns the config when the environment is valid', () => {
    expect(startupConfig().DATABASE_URL).toBe(process.env.DATABASE_URL);
  });
});
