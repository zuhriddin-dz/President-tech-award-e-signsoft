import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@docflow/api', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@docflow/api');
  });
});
