import { describe, expect, it } from 'vitest';
import { strings } from '../src/ui/strings';

describe('scaffold', () => {
  it('loads the shared strings module', () => {
    expect(strings.siteTitle).toBe('Circuit Practice');
  });
});
