import { QueryItem } from "./query-item";

describe('QueryItem', () => {
  it('Should instance QueryItem', () => {
    const queryFn = jest.fn();
    const queryItem = new QueryItem('fetched data', { queryFn });

    expect(queryItem).toBeInstanceOf(QueryItem);
  });

  it('Should execute updateData and handle edge cases', () => {
    const queryFn = jest.fn();
    const queryItem = new QueryItem<string>('fetched data', { queryFn });

    expect(queryItem.data).toBe('fetched data');
    expect(queryItem.getMetadata().dataUpdatedAt).toBeDefined();

    queryItem.updateData('fetched data 2');
    expect(queryItem.data).toBe('fetched data 2');
    expect(queryItem.getMetadata().dataUpdatedAt).toBeDefined();

    // Test null/undefined handling
    queryItem.updateData(null as any);
    expect(queryItem.data).toBeNull();
    
    queryItem.updateData(undefined as any);
    expect(queryItem.data).toBeUndefined();
  });

  it('Should handle data protection strategies correctly', () => {
    const queryFn = jest.fn();
    const complexData = { nested: { value: 42 } };
    const queryItem = new QueryItem(complexData, { queryFn });

    // Test clone strategy (default)
    const clonedData = queryItem.data;
    (clonedData as any).nested.value = 100;
    expect(queryItem.data.nested.value).toBe(42); // Original unchanged

    // Test freeze strategy
    queryItem.setDataStrategy('freeze');
    const frozenData = queryItem.data;
    expect(() => {
      (frozenData as any).nested.value = 200;
    }).toThrow(); // Should throw in strict mode

    // Test reference strategy
    queryItem.setDataStrategy('reference');
    const refData = queryItem.data;
    (refData as any).nested.value = 300;
    expect(queryItem.data.nested.value).toBe(300); // Original changed
  });

  it('Should execute updateError', () => {
    const queryFn = jest.fn();
    const queryItem = new QueryItem('fetched data', { queryFn });

    queryItem.updateError();
    expect(queryItem.getMetadata().errorUpdateCount).toBe(1);

    queryItem.updateError();
    expect(queryItem.getMetadata().errorUpdateCount).toBe(2);
  });

  it('Should execute invalidate', () => {
    const queryFn = jest.fn();
    const queryItem = new QueryItem('fetched data', { queryFn });

    expect(queryItem.getMetadata().isInvalidated).toBe(false);

    queryItem.invalidate();
    expect(queryItem.data).toBeUndefined();
    expect(queryItem.getMetadata().isInvalidated).toBe(true);
  });

  it('Should compute timeLeftToStale correctly', () => {
    jest.useFakeTimers();
    const queryFn = jest.fn();
    const staleTime = 2000;
    const queryItem = new QueryItem('fetched data', { queryFn, staleTime });

    // Immediately after creation, timeLeftToStale should be <= staleTime and > 0
    const tLeft1 = queryItem.timeLeftToStale;
    expect(tLeft1).toBeGreaterThanOrEqual(0);
    expect(tLeft1).toBeLessThanOrEqual(staleTime);

    // Advance half the time and ensure the left time decreased roughly as expected
    jest.advanceTimersByTime(1000);
    const tLeft2 = queryItem.timeLeftToStale;
    expect(tLeft2).toBeGreaterThanOrEqual(0);
    expect(tLeft2).toBeLessThanOrEqual(tLeft1);

    jest.useRealTimers();
  });
});