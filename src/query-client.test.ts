import { QueryClient } from './query-client';
import { QueryClientErrorResponse, QueryClientSuccessFromCacheResponse, QueryClientSuccessResponse } from './query-client-response';

jest.mock('ssignal', () => {
  const mockSignal = {
    value: new Map(),
    subscribe: jest.fn(),
    update: (newValue: any) => mockSignal.value = newValue,
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
    (QueryClient as any).instance = undefined;
    queryClient = QueryClient.getInstance();
    queryClient.clear();
    queryClient.setConfig({
      retry: 0, staleTime: 0, gcTime: 5000,
    });
  });

  afterEach(() => {
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
      
      try {
        const promise = queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
        for (let i = 0; i <= 2; i++) {
          jest.advanceTimersByTime(10);
          await Promise.resolve();
        }
        await promise;
        fail('Should have thrown');
      } catch (error) {
        expect((error as QueryClientErrorResponse<Error>).error).toBe(errors[2]);
        expect(errorCount).toBe(3);
      }
      
      jest.useRealTimers();
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
      const staleTime = 2000;
      const gcTime = 1000;
      queryClient.setConfig({ gcTime });
      mockQueryFn.mockResolvedValue('test data');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime });

      jest.advanceTimersByTime(gcTime - 1);
      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(true);

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime });

      jest.advanceTimersByTime(gcTime);
      expect(queryClient.getQueue().has(QueryClient.getQueryKey(queryKey))).toBe(true);
    });
  });

  describe('Store utilities and subscriptions', () => {
    it('should notify subscribers of store changes', async () => {
      const unsubscribeSpy = jest.fn();
      const subscribeSpy = jest.fn(() => unsubscribeSpy);
      
      queryClient.subscribe(subscribeSpy);
      
      // Trigger a store change
      const queryKey = ['test'];
      mockQueryFn.mockResolvedValueOnce('data');
      
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      
      expect(subscribeSpy).toHaveBeenCalled();
      
      // Test unsubscribe
      queryClient.destroy();
      expect(unsubscribeSpy).toHaveBeenCalled();
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

    it('returned data is a clone and mutating it does not modify the store', async () => {
      const queryKey = ['immutable-test'];
      const original = { nested: { value: 1 } };
      mockQueryFn.mockResolvedValueOnce(original);

      const response = await queryClient.fetchQuery<typeof original>({ queryFn: mockQueryFn, queryKey });
      const returned = response.data;

      // mutate the returned object
      (returned as any).nested.value = 999;

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
});