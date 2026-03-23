import { partialMatchKey } from './utils/utils';

describe('partialMatchKey', () => {
  it('returns false when obj1 is not an array', () => {
    expect(partialMatchKey('string' as any, [])).toBe(false);
  });

  it('returns false when obj2 is not an array', () => {
    expect(partialMatchKey([], null as any)).toBe(false);
  });

  it('returns true for empty obj1 (empty is prefix of anything)', () => {
    expect(partialMatchKey([], ['a', 'b'])).toBe(true);
  });

  it('returns true for two empty arrays', () => {
    expect(partialMatchKey([], [])).toBe(true);
  });

  it('returns false when obj1 is longer than obj2', () => {
    expect(partialMatchKey(['a', 'b'], ['a'])).toBe(false);
  });

  it('returns true when obj1 is a prefix of obj2 with strings', () => {
    expect(partialMatchKey(['a'], ['a', 'b'])).toBe(true);
  });

  it('returns true for exact match arrays', () => {
    expect(partialMatchKey(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('returns false when string elements do not match', () => {
    expect(partialMatchKey(['a'], ['b'])).toBe(false);
  });

  it('returns false when elements have different types (string vs number)', () => {
    expect(partialMatchKey(['1'], [1 as any])).toBe(false);
  });

  it('returns true for equal object elements', () => {
    expect(partialMatchKey([{ id: 1 }], [{ id: 1 }, { id: 2 }])).toBe(true);
  });

  it('returns false when object elements have different values', () => {
    expect(partialMatchKey([{ id: 1 }], [{ id: 2 }])).toBe(false);
  });

  it('returns false when object elements have different key counts', () => {
    expect(partialMatchKey([{ a: 1 }], [{ a: 1, b: 2 }])).toBe(false);
  });

  it('returns true for equal nested objects', () => {
    expect(partialMatchKey([{ a: { b: 1 } }], [{ a: { b: 1 } }])).toBe(true);
  });

  it('returns false for nested objects with different values', () => {
    expect(partialMatchKey([{ a: { b: 1 } }], [{ a: { b: 2 } }])).toBe(false);
  });

  it('handles multiple matching elements in prefix', () => {
    expect(partialMatchKey(['users', '1'], ['users', '1', 'posts'])).toBe(true);
  });

  it('returns false when second element does not match', () => {
    expect(partialMatchKey(['users', '1'], ['users', '2'])).toBe(false);
  });
});
