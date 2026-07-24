import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('env contract', () => {
  it('applies defaults', () => {
    const env = parseEnv({});
    expect(env.PORT).toBe(5000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('refuses to boot on a bad value, naming the key but not the value', () => {
    expect(() => parseEnv({ PORT: 'not-a-port' })).toThrow(/PORT/);
    expect(() => parseEnv({ PORT: 'not-a-port' })).not.toThrow(/not-a-port/);
  });
});
