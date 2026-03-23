import { QueryClient } from './query-client';
import { QueryClientErrorResponse, QueryClientSuccessFromCacheResponse, QueryClientSuccessResponse } from './query-client-response';
import { QueryItem } from './query-item';

jest.mock('ssignal', () => {
  let subscribers: Function[] = [];

  const mockSignal = {
    value: new Map(),
    subscribe: jest.fn((cb: Function) => {
      subscribers.push(cb);
      cb(mockSignal.value);
      return () => {
        subscribers = subscribers.filter(sub => sub !== cb);
      };
    }),
    update: function(newValue: any) {
      this.value = newValue;
      subscribers.forEach(cb => cb(newValue));
    },
  };

  return {
    __esModule: true,
    default: jest.fn(() => mockSignal),
  };
});

jest.mock('./query-client', () => {
  const originalModule = jest.requireActual('./query-client');
  return {
    ...originalModule,
    waitFor: jest.fn(() => Promise.resolve()),
  };
});

describe('QueryClient Singleton', () => {
  let queryClient: QueryClient;
  const mockQueryFn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (QueryClient as any).instance = undefined;
    queryClient = QueryClient.getInstance();
    queryClient.clear();
    queryClient.setConfig({
      retry: 0, staleTime: 0, gcTime: 5000,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    queryClient.destroy();
    jest.useRealTimers();
  });

  it('should return the same instance', () => {
    const instance1 = QueryClient.getInstance();
    const instance2 = QueryClient.getInstance();

    expect(instance1).toBe(instance2);
  });

  it('should allow setting and overriding config', () => {
    const customConfig = { retry: 5, staleTime: 30000 };
    queryClient.setConfig(customConfig);

    expect((queryClient as any).config).toEqual(expect.objectContaining(customConfig));
  });

  describe('fetchQuery', () => {
    jest.setTimeout(10000); // Aumentar timeout para todos los tests en este bloque
    
    it('should fetch data and return a success response on first request', async () => {
      const queryKey = ['test-query'];
      const fetchedData = 'fetched data';
      mockQueryFn.mockResolvedValue(fetchedData);

      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      const storedQuery = queryClient.getQueryData({ queryKey });

      expect(mockQueryFn).toHaveBeenCalledTimes(1);
      expect(response).toBeInstanceOf(QueryClientSuccessResponse);
      expect(response.data).toBe(fetchedData);
      expect(storedQuery?.data).toBe(fetchedData);
    });

    it('should return cached data if query is not stale', async () => {
      const queryKey = ['cached-query'];
      const cachedData = 'cached data';
      mockQueryFn.mockResolvedValueOnce(cachedData);

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 1000 });
      mockQueryFn.mockClear();

      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(mockQueryFn).not.toHaveBeenCalled();
      expect(response).toBeInstanceOf(QueryClientSuccessFromCacheResponse);
      expect(response.data).toBe(cachedData);
    });

    it('should refetch a query if it is stale', async () => {
      jest.useFakeTimers();
      const queryKey = ['stale-test'];
      const staleTime = 500;
      queryClient.setConfig({ staleTime });
      mockQueryFn.mockResolvedValueOnce('initial data');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      jest.advanceTimersByTime(staleTime + 1);

      mockQueryFn.mockResolvedValueOnce('refetched data');
      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(mockQueryFn).toHaveBeenCalledTimes(2);
      expect(response.data).toBe('refetched data');
    });

    it('should throw an error on fetch failure without retries', async () => {
      const queryKey = ['error-query'];
      const mockError = new Error('Custom error');
      mockQueryFn.mockRejectedValue(mockError);

      queryClient.setConfig({ retry: 0 });

      await expect(queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey }))
        .rejects.toBeInstanceOf(QueryClientErrorResponse);

      expect(mockQueryFn).toHaveBeenCalledTimes(1);
    });

    it('should throw error after max retries are exceeded', async () => {
      const queryKey = ['max-retry-query'];
      const mockError = new Error('Final failure');
      const maxRetries = 2;
      queryClient.setConfig({ retry: maxRetries, retryDelay: () => 10 });

      jest.useFakeTimers();

      mockQueryFn.mockRejectedValue(mockError);

      const fetchPromise = queryClient.fetchQuery({ queryKey, queryFn: mockQueryFn });

      for (let i = 0; i <= 1 + maxRetries; i++) {
        jest.advanceTimersByTime(10);

        await Promise.resolve();
      }

      await expect(fetchPromise).rejects.toBeInstanceOf(QueryClientErrorResponse);
      expect(mockQueryFn).toHaveBeenCalledTimes(maxRetries + 1);
    });

    it('should handle query lifecycle with custom config', async () => {
      jest.useFakeTimers();
      const queryKey = ['lifecycle-test'];
      const customConfig = {
        retry: 1,
        staleTime: 100,
        gcTime: 200,
        dataStrategy: 'freeze' as const
      };

      queryClient.setConfig(customConfig);
      mockQueryFn.mockResolvedValueOnce('initial');

      // Initial fetch
      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(response.data).toBe('initial');

      // Wait for stale
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush promises
      expect(queryClient.getQueryData({ queryKey })?.isStale()).toBe(true);

      // Wait for GC
      jest.advanceTimersByTime(200); // Full gcTime
      await Promise.resolve(); // Flush promises
      expect(queryClient.getQueryData({ queryKey })).toBeUndefined();

      jest.useRealTimers();
    });

    it('should handle complex error scenarios', async () => {
      jest.useFakeTimers();
      const queryKey = ['error-handling'];
      const errors = [
        new Error('Network error'),
        new TypeError('Parse error'),
        new Error('Final error')
      ];

      let errorCount = 0;
      mockQueryFn.mockImplementation(() => {
        const error = errors[errorCount++];
        return Promise.reject(error);
      });

      queryClient.setConfig({ retry: 2, retryDelay: () => 10 });

      const promise = queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      
      // Advance timers for each retry attempt
      for (let i = 0; i <= 2; i++) {
        await Promise.resolve(); // Let the current promise settle
        jest.advanceTimersByTime(10);
      }

      try {
        await promise;
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryClientErrorResponse);
        expect((error as QueryClientErrorResponse<unknown>).error).toBe(errors[2]);
        expect(errorCount).toBe(3);
      }
    });

    it('should fetch successfully after retrying failed requests', async () => {
      const queryKey = ['retry-query'];
      const mockError = new Error('Network error');
      const maxRetries = 2;
      queryClient.setConfig({ retry: maxRetries, retryDelay: () => 10 });

      jest.useFakeTimers();

      mockQueryFn.mockRejectedValueOnce(mockError);
      mockQueryFn.mockRejectedValueOnce(mockError);
      mockQueryFn.mockResolvedValueOnce('success after retry');

      const fetchPromise = queryClient.fetchQuery({ queryKey, queryFn: mockQueryFn });

      for (let i = 0; i <= 1 + maxRetries; i++) {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      }

      await expect(fetchPromise).resolves.toBeInstanceOf(QueryClientSuccessResponse);
      expect(mockQueryFn).toHaveBeenCalledTimes(maxRetries + 1);
    });
  });

  describe('refetchQueries and invalidateQueryData', () => {
    it('should refetch a query and update data when refetchQueries is called', async () => {
      const queryKey = ['refetch-query'];
      mockQueryFn.mockResolvedValueOnce('initial data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      mockQueryFn.mockResolvedValueOnce('refetched data');
      const response = await queryClient.refetchQueries({ queryKey });
      const storedQuery = queryClient.getQueryData({ queryKey });

      expect(mockQueryFn).toHaveBeenCalledTimes(2);
      expect(response.data).toBe('refetched data');
      expect(storedQuery?.data).toBe('refetched data');
    });

    it('should throw an error when refetching a non-existent key', async () => {
      const nonExistentKey = ['non-existent'];
      await expect(queryClient.refetchQueries({ queryKey: nonExistentKey })).rejects.toThrow('No query in queries.');
    });

    it('should invalidate query and re-execute on next fetch', async () => {
      const queryKey = ['invalidate-refetch-query'];
      mockQueryFn.mockResolvedValueOnce('initial data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      queryClient.invalidateQueryData({ queryKey });
      expect(queryClient.getQueryData({ queryKey })?.getMetadata()?.isInvalidated).toBe(true);

      mockQueryFn.mockResolvedValueOnce('fetched data 2');
      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      const storedQuery = queryClient.getQueryData({ queryKey });
      expect(response.data).toBe('fetched data 2');
      expect(storedQuery?.getMetadata()?.isInvalidated).toBe(false);
      expect(mockQueryFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Garbage Collection', () => {
    it('should remove queries after gcTime has passed', async () => {
      jest.useFakeTimers();
      const queryKey = ['gc-query'];
      const gcTime = 1000;
      queryClient.setConfig({ gcTime }).clear();
      mockQueryFn.mockResolvedValue('test data');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(true);

      jest.advanceTimersByTime(1 + 30000);

      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(false);
    });

    it('should not remove a query that is still active', async () => {
      jest.useFakeTimers();
      const queryKey = ['active-query'];
      const staleTime = 500;
      const gcTime = 1000;
      
      // Set up config
      queryClient.setConfig({ 
        gcTime,
        staleTime,
        dataStrategy: 'clone'  // Ensure we're using clone strategy
      });
      
      mockQueryFn.mockResolvedValue('test data');

      // Initial fetch
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(true);

      // Advance time to just before GC
      jest.advanceTimersByTime(gcTime - 100);
      await Promise.resolve();

      // Verify query is still there
      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(true);

      // Refresh data to reset GC timer
      await queryClient.refetchQueries({ queryKey });

      // Even after original GC time passes, query should still be there
      jest.advanceTimersByTime(gcTime);
      await Promise.resolve();

      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(true);

      // Cleanup
      jest.useRealTimers();
    });
  });

  describe('Store utilities and subscriptions', () => {
    it('should notify subscribers of store changes', async () => {
      const subscribeSpy = jest.fn();
      const unsubscribe = queryClient.subscribe(subscribeSpy);

      // Initial subscription should receive current value
      expect(subscribeSpy).toHaveBeenCalledWith(expect.any(Map));

      // Make a change to the store
      const queryKey = ['test'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      // Should have received the updated value
      expect(subscribeSpy).toHaveBeenLastCalledWith(
        expect.any(Map)
      );

      // Cleanup should work
      unsubscribe();
      queryClient.destroy();
    });

    it('should handle query key conflicts and updates correctly', async () => {
      const queryKey = ['conflict-test'];
      mockQueryFn.mockResolvedValueOnce('data1');

      // First fetch
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      // Update with new data
      mockQueryFn.mockResolvedValueOnce('data2');
      await queryClient.refetchQueries({ queryKey });

      const data = queryClient.getQueryData({ queryKey });
      expect(data?.data).toBe('data2');
    });

    it('should remove queries by partial key', async () => {
      const user1 = ['user', '1'];
      const user2 = ['user', '2'];

      mockQueryFn.mockResolvedValue('a');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: user1 });
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: user2 });

      expect(queryClient.getStoreSize()).toBe(2);

      queryClient.removeQueries({ queryKey: ['user'] });

      expect(queryClient.getStoreSize()).toBe(0);
    });

    it('getQueue returns a shallow copy (not the internal Map reference)', async () => {
      const queryKey = ['copy-test'];
      mockQueryFn.mockResolvedValue('value');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      const keyStr = QueryClient.getQueryKey(queryKey);
      const externalQueue = queryClient.getQueue();

      // Remove from the external copy
      externalQueue.delete(keyStr);

      // Internal store should remain untouched
      expect(queryClient.getStoreSize()).toBe(1);
      expect(queryClient.getQueue().has(keyStr)).toBe(true);
    });

    it('returned data is protected and original store data remains unchanged', async () => {
      const queryKey = ['immutable-test'];
      const original = { nested: { value: 1 } };
      mockQueryFn.mockResolvedValueOnce(original);

      // Configure to use clone strategy instead of freeze
      queryClient.setConfig({ dataStrategy: 'clone' });

      const response = await queryClient.fetchQuery<typeof original>({ queryFn: mockQueryFn, queryKey });
      const returned = response.data;

      // Attempt to mutate the returned object (should not affect original)
      try {
        (returned as any).nested.value = 999;
      } catch (e) {
        // Ignore error if object is frozen
      }

      // internal stored query should still have the original value
      const stored = queryClient.getQueryData<typeof original>({ queryKey });
      expect((stored?.data as typeof original).nested.value).toBe(1);
    });

    it('should remove queries after gcTime has passed (eviction)', async () => {
      jest.useFakeTimers();
      const queryKey = ['gc-evict-test'];
      const gcTime = 1000;
      queryClient.setConfig({ gcTime });
      mockQueryFn.mockResolvedValue('test data');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      // initially present
      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(true);

      // advance timers past gcTime
      jest.advanceTimersByTime(gcTime + 1);
      // flush microtasks
      await Promise.resolve();

      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('getQueryData with exact option', () => {
    it('should return data when exact: true matches the key', async () => {
      const queryKey = ['exact-test'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      const result = queryClient.getQueryData({ queryKey, exact: true });
      expect(result?.data).toBe('data');
    });

    it('should return undefined when exact: true and key does not exist', async () => {
      const queryKey = ['exact-test'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      const result = queryClient.getQueryData({ queryKey: ['nonexistent'], exact: true });
      expect(result).toBeUndefined();
    });
  });

  describe('getQueueAsArray', () => {
    it('should return empty array when no queries cached', () => {
      expect(queryClient.getQueueAsArray()).toHaveLength(0);
    });

    it('should return fresh status for non-stale query', async () => {
      const queryKey = ['fresh-queue'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 10000 });

      const queue = queryClient.getQueueAsArray();
      expect(queue).toHaveLength(1);
      const item = queue[0]!;
      expect(item.status).toBe('fresh');
      expect(item.isStale).toBe(false);
      expect(item.isInvalidated).toBe(false);
      expect(item.key).toBe('fresh-queue');
      expect(item.queryKey).toEqual(['fresh-queue']);
      expect(item.staleTime).toBe(10000);
      expect(item.gcTime).toBeGreaterThan(0);
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
      expect(item.expiresAt).toBeGreaterThan(Date.now());
      expect(item.timeLeftToExpire).toBeGreaterThan(0);
    });

    it('should return stale status after staleTime has passed', async () => {
      jest.useFakeTimers();
      const queryKey = ['stale-queue'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 100 });

      jest.advanceTimersByTime(200);

      const queue = queryClient.getQueueAsArray();
      const item = queue[0]!;
      expect(item.status).toBe('stale');
      expect(item.isStale).toBe(true);
    });

    it('should return invalidated status for invalidated query', async () => {
      const queryKey = ['invalidated-queue'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 10000 });

      await queryClient.invalidateQueryData({ queryKey });

      const queue = queryClient.getQueueAsArray();
      const item = queue[0]!;
      expect(item.status).toBe('invalidated');
      expect(item.isInvalidated).toBe(true);
    });

    it('should return expired status when gcTime has elapsed', async () => {
      const queryKey = ['expired-queue'];
      const gcTime = 5000;
      queryClient.setConfig({ gcTime });
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 0 });

      const cachedItem = queryClient.getQueryData({ queryKey, exact: true });
      if (cachedItem) {
        clearTimeout(cachedItem.getMetadata().timeoutId);
        cachedItem.getMetadata().timeoutId = undefined;
        // Backdate the item so it appears expired
        cachedItem.getMetadata().dataUpdatedAt = Date.now() - gcTime - 1;
      }

      const queue = queryClient.getQueueAsArray();
      const item = queue[0]!;
      expect(item.status).toBe('expired');
      expect(item.timeLeftToExpire).toBe(0);
    });
  });

  describe('getJsonQueue', () => {
    it('should return empty array when no queries', () => {
      const json = queryClient.getJsonQueue();
      expect(Array.isArray(json)).toBe(true);
      expect((json as any[]).length).toBe(0);
    });

    it('should return JSON-serializable representation of cached queries', async () => {
      const queryKey = ['json-queue'];
      mockQueryFn.mockResolvedValueOnce({ value: 42 });
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      const json = queryClient.getJsonQueue() as any[];
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(1);
      expect(json[0].queryKey).toBe('json-queue');
      expect(json[0].queryKeyOriginal).toEqual(['json-queue']);
      expect(json[0].data).toEqual({ value: 42 });
    });
  });

  describe('setQueryData direct usage', () => {
    it('should set query data directly without fetching', () => {
      const queryKey = ['direct-set'];
      const queryFn = jest.fn().mockResolvedValue('data');
      queryClient.setQueryData({ queryKey, data: 'manual data', queryFn, staleTime: 5000 });

      const result = queryClient.getQueryData({ queryKey });
      expect(result?.data).toBe('manual data');
    });
  });

  describe('invalidateQueryData edge cases', () => {
    it('should throw when key does not exist', async () => {
      await expect(
        queryClient.invalidateQueryData({ queryKey: ['nonexistent-invalidate'] })
      ).rejects.toThrow('No query in queries.');
    });

    it('should invalidate with exact: true', async () => {
      const queryKey = ['exact-invalidate'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 10000 });

      await queryClient.invalidateQueryData({ queryKey, exact: true });

      const item = queryClient.getQueryData({ queryKey });
      expect(item?.getMetadata().isInvalidated).toBe(true);
    });
  });

  describe('removeQueries via updateQuery (exact path)', () => {
    it('should remove a query added directly via updateQuery', () => {
      const queryKey = ['unindexed-key'];
      const queryFn = jest.fn().mockResolvedValue('data');
      const queryItem = new QueryItem('direct data', { queryFn });

      // updateQuery bypasses key indexing
      queryClient.updateQuery(queryKey, queryItem);
      expect(queryClient.getQueryData({ queryKey, exact: true })).toBeDefined();

      queryClient.removeQueries({ queryKey });
      expect(queryClient.getQueryData({ queryKey, exact: true })).toBeUndefined();
    });
  });

  describe('Logging behavior', () => {
    it('should call console.log when enableLogging is true', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      queryClient.setConfig({ enableLogging: true });

      const queryKey = ['log-test'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(logSpy).toHaveBeenCalled();
    });

    it('should not call console.log when enableLogging is false', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      queryClient.setConfig({ enableLogging: false });

      const queryKey = ['no-log-test'];
      mockQueryFn.mockResolvedValueOnce('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('Default retryDelay (exponential backoff)', () => {
    it('default retryDelay function computes exponential backoff', () => {
      // Use a fresh instance to access unmodified default config (not polluted by other tests)
      const freshClient = new QueryClient();
      const retryDelay = (freshClient as any).config.retryDelay as (attempt: number) => number;
      expect(retryDelay(0)).toBe(1000);        // min(1000 * 2^0, 30000) = 1000
      expect(retryDelay(1)).toBe(2000);        // min(1000 * 2^1, 30000) = 2000
      expect(retryDelay(2)).toBe(4000);        // min(1000 * 2^2, 30000) = 4000
      expect(retryDelay(10)).toBe(30000);      // capped at 30000
      freshClient.destroy();
    });

    it('should retry using default exponential backoff when retryDelay is not overridden', async () => {
      jest.useFakeTimers();
      const queryKey = ['default-delay-query'];

      // Only override retry count, not retryDelay — default exponential backoff remains
      queryClient.setConfig({ retry: 1 });

      mockQueryFn.mockRejectedValueOnce(new Error('Transient error'));
      mockQueryFn.mockResolvedValueOnce('success after retry');

      const promise = queryClient.fetchQuery({ queryKey, queryFn: mockQueryFn });

      // Flush rejection + waitFor setup, advance past retryDelay(1)=2000ms, flush resolution
      for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        jest.advanceTimersByTime(701);
      }

      await expect(promise).resolves.toBeInstanceOf(QueryClientSuccessResponse);
    });
  });

  describe('Garbage Collection interval', () => {
    it('should remove expired items when GC interval fires', async () => {
      // Must call useFakeTimers BEFORE clear() so setInterval is captured by fake timers
      jest.useFakeTimers();

      queryClient.setConfig({ gcTime: 100 });
      queryClient.clear(); // Re-initializes GC interval under fake timers

      const queryKey = ['gc-interval-test'];
      const queryFn = jest.fn().mockResolvedValue('data');
      queryClient.setQueryData({ queryKey, data: 'data', queryFn, staleTime: 0 });

      // Clear individual timeout so only the GC interval removes the item
      const item = queryClient.getQueryData({ queryKey, exact: true });
      if (item) {
        clearTimeout(item.getMetadata().timeoutId);
        item.getMetadata().timeoutId = undefined;
        // Backdate so item appears past gcTime=100
        item.getMetadata().dataUpdatedAt = Date.now() - 200;
      }

      expect(queryClient.getStoreSize()).toBe(1);

      // Advance past the GC interval (gcTime=100ms)
      jest.advanceTimersByTime(101);

      expect(queryClient.getStoreSize()).toBe(0);
    });

    it('should not remove items that are still fresh when GC runs', async () => {
      jest.useFakeTimers();
      const queryKey = ['gc-fresh-test'];
      const queryFn = jest.fn().mockResolvedValue('data');

      queryClient.setConfig({ gcTime: 5000 });
      queryClient.setQueryData({ queryKey, data: 'data', queryFn, staleTime: 10000 });

      // Clear individual timeout to isolate GC interval behavior
      const item = queryClient.getQueryData({ queryKey, exact: true });
      if (item) {
        clearTimeout(item.getMetadata().timeoutId);
        item.getMetadata().timeoutId = undefined;
      }

      expect(queryClient.getStoreSize()).toBe(1);

      // Advance less than gcTime — item should survive GC
      jest.advanceTimersByTime(3000);

      expect(queryClient.getStoreSize()).toBe(1);
    });
  });

  describe('File persistence', () => {
    const os = require('os');
    const fsModule = require('fs');
    const pathModule = require('path');
    const tempDir = pathModule.join(os.tmpdir(), 'query-client-test-' + Date.now());
    const cacheFile = pathModule.join(tempDir, 'query-cache.json');

    beforeAll(() => {
      fsModule.mkdirSync(tempDir, { recursive: true });
    });

    afterAll(() => {
      try { fsModule.unlinkSync(cacheFile); } catch {}
      try { fsModule.rmdirSync(tempDir); } catch {}
    });

    it('should save cache to file when persistenceStrategy is file', async () => {
      queryClient.setConfig({ persistenceStrategy: 'file', persistencePath: tempDir });

      const queryKey = ['file-persistence-test'];
      mockQueryFn.mockResolvedValueOnce({ id: 1, name: 'test' });
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(fsModule.existsSync(cacheFile)).toBe(true);

      const content = JSON.parse(fsModule.readFileSync(cacheFile, 'utf-8'));
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0].data).toEqual({ id: 1, name: 'test' });

      // Restore memory strategy for other tests
      queryClient.setConfig({ persistenceStrategy: 'memory' });
    });

    it('should load cache from file via loadCacheFromFile', () => {
      // Write a known cache file
      const cacheData = [{
        queryKey: ['loaded-key'],
        key: 'loaded-key',
        data: 'loaded value',
        metadata: {
          dataCreatedAt: Date.now(),
          dataUpdatedAt: Date.now(),
          staleTime: 10000,
          isInvalidated: false,
        },
      }];
      fsModule.writeFileSync(cacheFile, JSON.stringify(cacheData), 'utf-8');

      queryClient.setConfig({ persistenceStrategy: 'file', persistencePath: tempDir });

      // Call private method directly to test loading
      (queryClient as any).loadCacheFromFile();

      const item = queryClient.getQueryData({ queryKey: ['loaded-key'] });
      expect(item?.data).toBe('loaded value');

      queryClient.setConfig({ persistenceStrategy: 'memory' });
    });

    it('should skip loading when cache file does not exist', () => {
      const nonExistentDir = pathModule.join(os.tmpdir(), 'nonexistent-' + Date.now());
      queryClient.setConfig({ persistenceStrategy: 'file', persistencePath: nonExistentDir });

      // Should not throw even if file doesn't exist
      expect(() => (queryClient as any).loadCacheFromFile()).not.toThrow();

      queryClient.setConfig({ persistenceStrategy: 'memory' });
    });

    it('should skip expired entries when loading from file', () => {
      const expiredCacheData = [{
        queryKey: ['expired-loaded-key'],
        key: 'expired-loaded-key',
        data: 'stale value',
        metadata: {
          dataCreatedAt: Date.now() - 100000,
          dataUpdatedAt: Date.now() - 100000, // far in the past
          staleTime: 1000,
          isInvalidated: false,
        },
      }];
      fsModule.writeFileSync(cacheFile, JSON.stringify(expiredCacheData), 'utf-8');

      queryClient.setConfig({ persistenceStrategy: 'file', persistencePath: tempDir, gcTime: 5000 });
      (queryClient as any).loadCacheFromFile();

      // Item should not be loaded since it's expired
      const item = queryClient.getQueryData({ queryKey: ['expired-loaded-key'] });
      expect(item).toBeUndefined();

      queryClient.setConfig({ persistenceStrategy: 'memory' });
    });
  });

  describe('Static utility methods', () => {
    it('getQueryKey joins array with colon', () => {
      expect(QueryClient.getQueryKey(['users', '1', 'posts'])).toBe('users:1:posts');
    });

    it('parseQueryKey splits string by colon', () => {
      expect(QueryClient.parseQueryKey('users:1:posts')).toEqual(['users', '1', 'posts']);
    });

    it('getQueryKey and parseQueryKey are inverse operations', () => {
      const original = ['users', '42', 'profile'];
      expect(QueryClient.parseQueryKey(QueryClient.getQueryKey(original))).toEqual(original);
    });
  });
});