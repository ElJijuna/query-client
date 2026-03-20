import { QueryClient } from './query-client';
import {
  QueryClientErrorResponse,
  QueryClientSuccessFromCacheResponse,
  QueryClientSuccessResponse,
} from './query-client-response';

// Mock ssignal before importing QueryClient
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

describe('QueryClient Singleton', () => {
  let queryClient: QueryClient;
  const mockQueryFn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (QueryClient as any).instance = undefined;
    queryClient = QueryClient.getInstance();
    queryClient.clear();
    queryClient.setConfig({
      retry: 0,
      staleTime: 0,
      gcTime: 5000,
    });
  });

  afterEach(() => {
    queryClient.destroy();
    jest.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = QueryClient.getInstance();
      const instance2 = QueryClient.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should maintain singleton across destroy and reinit', () => {
      const instance1 = QueryClient.getInstance();
      instance1.destroy();
      const instance2 = QueryClient.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Configuration Management', () => {
    it('should allow setting and merging config', () => {
      const customConfig = { retry: 5, staleTime: 30000 };
      queryClient.setConfig(customConfig);
      expect((queryClient as any).config).toEqual(expect.objectContaining(customConfig));
    });

    it('should preserve unmodified config values when setting partial config', () => {
      queryClient.setConfig({ retry: 5 });
      queryClient.setConfig({ staleTime: 10000 });
      expect((queryClient as any).config.retry).toBe(5);
      expect((queryClient as any).config.staleTime).toBe(10000);
    });

    it('should apply default config on initialization', () => {
      const newClient = QueryClient.getInstance();
      const config = (newClient as any).config;
      expect(config.retry).toBeDefined();
      expect(config.staleTime).toBeDefined();
      expect(config.gcTime).toBeDefined();
    });

    it('should return this for method chaining', () => {
      const result = queryClient.setConfig({ retry: 2 });
      expect(result).toBe(queryClient);
    });
  });

  describe('fetchQuery - Basic Operations', () => {
    it('should fetch data and return success response on first request', async () => {
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

    it('should pass abort signal to query function', async () => {
      const queryKey = ['signal-test'];
      let receivedSignal: AbortSignal | undefined;
      mockQueryFn.mockImplementation(({ signal }) => {
        receivedSignal = signal;
        return Promise.resolve('data');
      });

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal instanceof AbortSignal).toBe(true);
    });

    it('should fetch with custom staleTime', async () => {
      const queryKey = ['stale-time-test'];
      mockQueryFn.mockResolvedValue('data');

      await queryClient.fetchQuery({
        queryFn: mockQueryFn,
        queryKey,
        staleTime: 5000,
      });

      const queryItem = queryClient.getQueryData({ queryKey });
      expect(queryItem?.getMetadata().staleTime).toBe(5000);
    });

    it('should fetch with ignoreCache flag to bypass cached data', async () => {
      const queryKey = ['ignore-cache-test'];
      mockQueryFn.mockResolvedValueOnce('first data');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 10000 });
      mockQueryFn.mockClear();

      const response = await queryClient.fetchQuery({
        queryFn: mockQueryFn,
        queryKey,
        ignoreCache: true,
      });

      expect(mockQueryFn).toHaveBeenCalledTimes(1);
      expect(response).toBeInstanceOf(QueryClientSuccessResponse);
    });
  });

  describe('Caching Behavior', () => {
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

    it('should cache multiple different queries independently', async () => {
      const queryKey1 = ['query-1'];
      const queryKey2 = ['query-2'];
      mockQueryFn.mockResolvedValueOnce('data-1');
      mockQueryFn.mockResolvedValueOnce('data-2');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: queryKey1, staleTime: 5000 });
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: queryKey2, staleTime: 5000 });

      expect(queryClient.getQueryData({ queryKey: queryKey1 })?.data).toBe('data-1');
      expect(queryClient.getQueryData({ queryKey: queryKey2 })?.data).toBe('data-2');
    });

    it('should apply data protection strategy (clone by default)', async () => {
      const queryKey = ['protection-test'];
      const originalData = { message: 'test' };
      mockQueryFn.mockResolvedValue(originalData);

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      const cachedData = queryClient.getQueryData({ queryKey });

      expect(cachedData?.data).toEqual(originalData);
      expect(cachedData?.data).not.toBe(originalData);
    });

    it('should update cache with new data on refetch', async () => {
      const queryKey = ['refetch-test'];
      mockQueryFn.mockResolvedValueOnce('initial data');

      const firstFetch = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(firstFetch.data).toBe('initial data');

      mockQueryFn.mockResolvedValueOnce('updated data');
      const refetch = await queryClient.refetchQueries({ queryKey });

      expect(queryClient.getQueryData({ queryKey })?.data).toBe('updated data');
    });

    it('should handle nested object data caching', async () => {
      const queryKey = ['nested-data'];
      const nestedData = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };
      mockQueryFn.mockResolvedValue(nestedData);

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      const cached = queryClient.getQueryData({ queryKey });

      expect(cached?.data).toEqual(nestedData);
      expect((cached?.data as any).user).toEqual(nestedData.user);
    });
  });

  describe('Staleness Management', () => {
    it('should refetch a query if it is stale', async () => {
      jest.useFakeTimers();
      const queryKey = ['stale-test'];
      const staleTime = 500;
      mockQueryFn.mockResolvedValueOnce('initial');

      await queryClient.fetchQuery({
        queryFn: mockQueryFn,
        queryKey,
        staleTime,
      });

      mockQueryFn.mockClear();
      jest.advanceTimersByTime(staleTime + 100);

      mockQueryFn.mockResolvedValueOnce('refetched');
      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(mockQueryFn).toHaveBeenCalled();
      expect(response.data).toBe('refetched');
    });

    it('should mark query as stale after staleTime', async () => {
      jest.useFakeTimers();
      const queryKey = ['stale-flag'];
      mockQueryFn.mockResolvedValue('data');

      await queryClient.fetchQuery({
        queryFn: mockQueryFn,
        queryKey,
        staleTime: 1000,
      });

      const queryItem = queryClient.getQueryData({ queryKey });
      expect(queryItem?.isStale()).toBe(false);

      jest.advanceTimersByTime(1100);
      expect(queryItem?.isStale()).toBe(true);
    });

    it('should calculate timeLeftToStale correctly', async () => {
      jest.useFakeTimers();
      const queryKey = ['time-left'];
      mockQueryFn.mockResolvedValue('data');

      await queryClient.fetchQuery({
        queryFn: mockQueryFn,
        queryKey,
        staleTime: 1000,
      });

      const queryItem = queryClient.getQueryData({ queryKey });
      const timeLeft = queryItem?.timeLeftToStale;

      expect(timeLeft).toBeGreaterThan(0);
      expect(timeLeft).toBeLessThanOrEqual(1000);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed queries with default retry count', async () => {
      const queryKey = ['retry-test'];
      const retryCount = 3;
      queryClient.setConfig({ retry: retryCount, retryDelay: () => 0 });

      mockQueryFn.mockRejectedValue(new Error('Network error'));

      await expect(
        queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey })
      ).rejects.toThrow();

      expect(mockQueryFn).toHaveBeenCalledTimes(retryCount + 1);
    });

    it('should not retry when retry is set to 0', async () => {
      const queryKey = ['no-retry'];
      queryClient.setConfig({ retry: 0 });
      mockQueryFn.mockRejectedValue(new Error('Error'));

      await expect(
        queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey })
      ).rejects.toThrow();

      expect(mockQueryFn).toHaveBeenCalledTimes(1);
    });

    it('should use custom retry value when provided', async () => {
      const queryKey = ['custom-retry'];
      mockQueryFn.mockRejectedValue(new Error('Error'));

      await expect(
        queryClient.fetchQuery({
          queryFn: mockQueryFn,
          queryKey,
          retry: 2,
          retryDelay: () => 0,
        })
      ).rejects.toThrow();

      expect(mockQueryFn).toHaveBeenCalledTimes(3);
    });

    it('should succeed on later attempt during retry', async () => {
      const queryKey = ['succeed-on-retry'];
      queryClient.setConfig({ retry: 3, retryDelay: () => 0 });

      mockQueryFn
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce('success data');

      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(response.data).toBe('success data');
      expect(mockQueryFn).toHaveBeenCalledTimes(3);
    });

    it('should throw QueryClientErrorResponse on final retry failure', async () => {
      const queryKey = ['final-error'];
      mockQueryFn.mockRejectedValue(new Error('Persistent error'));

      try {
        await queryClient.fetchQuery({
          queryFn: mockQueryFn,
          queryKey,
          retry: 1,
          retryDelay: () => 0,
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryClientErrorResponse);
      }
    });
  });

  describe('Garbage Collection', () => {
    it('should remove expired queries after gcTime', async () => {
      jest.useFakeTimers();
      const queryKey = ['gc-test'];
      const gcTime = 1000;
      queryClient.setConfig({ gcTime });

      mockQueryFn.mockResolvedValue('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(queryClient.getQueryData({ queryKey })).toBeDefined();

      jest.advanceTimersByTime(gcTime + 100);

      expect(queryClient.getQueryData({ queryKey })).toBeUndefined();
    });

    it('should remove multiple expired queries', async () => {
      jest.useFakeTimers();
      const queryKey1 = ['gc-1'];
      const queryKey2 = ['gc-2'];
      const gcTime = 1000;
      queryClient.setConfig({ gcTime });

      mockQueryFn.mockResolvedValue('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: queryKey1 });
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: queryKey2 });

      expect(queryClient.getStoreSize()).toBe(2);

      jest.advanceTimersByTime(gcTime + 100);

      expect(queryClient.getStoreSize()).toBe(0);
    });

    it('should not remove queries that are still fresh', async () => {
      jest.useFakeTimers();
      const queryKey = ['fresh-gc-test'];
      const gcTime = 5000;
      queryClient.setConfig({ gcTime });

      mockQueryFn.mockResolvedValue('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      jest.advanceTimersByTime(gcTime - 100);

      expect(queryClient.getQueryData({ queryKey })).toBeDefined();
    });
  });

  describe('Query Invalidation', () => {
    it('should mark query as invalidated', async () => {
      const queryKey = ['invalidate-test'];
      mockQueryFn.mockResolvedValue('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      await queryClient.invalidateQueryData({ queryKey });

      const queryItem = queryClient.getQueryData({ queryKey });
      expect(queryItem?.getMetadata().isInvalidated).toBe(true);
    });

    it('should require refetch after invalidation', async () => {
      const queryKey = ['refetch-after-invalidate'];
      mockQueryFn.mockResolvedValueOnce('initial data');

      await queryClient.fetchQuery({
        queryFn: mockQueryFn,
        queryKey,
        staleTime: 10000,
      });

      mockQueryFn.mockClear();
      await queryClient.invalidateQueryData({ queryKey });

      mockQueryFn.mockResolvedValueOnce('new data');
      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(mockQueryFn).toHaveBeenCalled();
      expect(response.data).toBe('new data');
    });

    it('should throw error when invalidating non-existent query', async () => {
      const queryKey = ['non-existent'];

      await expect(
        queryClient.invalidateQueryData({ queryKey })
      ).rejects.toThrow('No query in queries.');
    });

    it('should support exact flag in invalidation', async () => {
      const queryKey = ['exact-invalidate'];
      mockQueryFn.mockResolvedValue('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      await queryClient.invalidateQueryData({ queryKey, exact: true });

      const queryItem = queryClient.getQueryData({ queryKey, exact: true });
      expect(queryItem?.getMetadata().isInvalidated).toBe(true);
    });
  });

  describe('Refetch Operations', () => {
    it('should refetch stored query', async () => {
      const queryKey = ['refetch-query'];
      mockQueryFn.mockResolvedValueOnce('initial data');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      mockQueryFn.mockClear();

      mockQueryFn.mockResolvedValueOnce('refetched data');
      const response = await queryClient.refetchQueries({ queryKey });

      expect(mockQueryFn).toHaveBeenCalledTimes(1);
      expect(response.data).toBe('refetched data');
    });

    it('should throw error when refetching non-existent query', async () => {
      const queryKey = ['non-existent-refetch'];

      await expect(
        queryClient.refetchQueries({ queryKey })
      ).rejects.toThrow('No query in queries.');
    });

    it('should preserve staleTime during refetch', async () => {
      const queryKey = ['preserve-staletime'];
      const staleTime = 5000;
      mockQueryFn.mockResolvedValue('data');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime });
      await queryClient.refetchQueries({ queryKey });

      const queryItem = queryClient.getQueryData({ queryKey });
      expect(queryItem?.getMetadata().staleTime).toBe(staleTime);
    });
  });

  describe('Remove and Clear Queries', () => {
    it('should remove single query by exact key', () => {
      const queryKey = ['remove-exact'];
      mockQueryFn.mockResolvedValue('data');

      queryClient.setQueryData({ queryKey, data: 'test', queryFn: mockQueryFn });
      expect(queryClient.getQueryData({ queryKey })).toBeDefined();

      queryClient.removeQueries({ queryKey });
      expect(queryClient.getQueryData({ queryKey })).toBeUndefined();
    });

    it('should remove multiple queries with partial match', () => {
      const queryKey1 = ['users', '1'];
      const queryKey2 = ['users', '2'];
      const queryKey3 = ['posts', '1'];

      mockQueryFn.mockResolvedValue('data');
      queryClient.setQueryData({ queryKey: queryKey1, data: 'd1', queryFn: mockQueryFn });
      queryClient.setQueryData({ queryKey: queryKey2, data: 'd2', queryFn: mockQueryFn });
      queryClient.setQueryData({ queryKey: queryKey3, data: 'd3', queryFn: mockQueryFn });

      queryClient.removeQueries({ queryKey: ['users'] });

      expect(queryClient.getQueryData({ queryKey: queryKey1 })).toBeUndefined();
      expect(queryClient.getQueryData({ queryKey: queryKey2 })).toBeUndefined();
      expect(queryClient.getQueryData({ queryKey: queryKey3 })).toBeDefined();
    });

    it('should clear all queries', () => {
      const queryKey1 = ['clear-1'];
      const queryKey2 = ['clear-2'];

      mockQueryFn.mockResolvedValue('data');
      queryClient.setQueryData({ queryKey: queryKey1, data: 'd1', queryFn: mockQueryFn });
      queryClient.setQueryData({ queryKey: queryKey2, data: 'd2', queryFn: mockQueryFn });

      expect(queryClient.getStoreSize()).toBe(2);
      queryClient.clear();
      expect(queryClient.getStoreSize()).toBe(0);
    });
  });

  describe('Subscriptions', () => {
    it('should subscribe to query changes', (done) => {
      const queryKey = ['subscribe-test'];
      mockQueryFn.mockResolvedValue('data');

      let callCount = 0;
      const unsubscribe = queryClient.subscribe((queries) => {
        callCount++;
        if (callCount === 2) {
          expect(queries.size).toBeGreaterThan(0);
          unsubscribe();
          done();
        }
        return () => {};
      });

      queryClient.setQueryData({ queryKey, data: 'test', queryFn: mockQueryFn });
    });

    it('should unsubscribe from query changes', (done) => {
      const queryKey = ['unsubscribe-test'];
      mockQueryFn.mockResolvedValue('data');

      let callCount = 0;
      const unsubscribe = queryClient.subscribe(() => {
        callCount++;
        unsubscribe();
        return () => {};
      });

      queryClient.setQueryData({ queryKey, data: 'test', queryFn: mockQueryFn });
      queryClient.setQueryData({ queryKey: ['another'], data: 'test2', queryFn: mockQueryFn });

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 50);
    });
  });

  describe('Data Protection Strategies', () => {
    it('should clone data by default', async () => {
      const queryKey = ['clone-strategy'];
      const originalData = { count: 1 };
      mockQueryFn.mockResolvedValue(originalData);

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 5000 });

      const retrieved = queryClient.getQueryData({ queryKey })?.data as any;
      retrieved.count = 99;

      const retrieved2 = queryClient.getQueryData({ queryKey })?.data as any;
      expect(retrieved2.count).toBe(1);
    });

    it('should freeze data when freeze strategy is configured', async () => {
      const queryKey = ['freeze-strategy'];
      const originalData = { count: 1 };
      queryClient.setConfig({ dataStrategy: 'freeze' });
      mockQueryFn.mockResolvedValue(originalData);

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 5000 });

      const retrieved = queryClient.getQueryData({ queryKey })?.data as any;
      expect(() => {
        retrieved.count = 99;
      }).toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw error for failed queries', async () => {
      const queryKey = ['error-test'];
      mockQueryFn.mockRejectedValue(new Error('Fetch failed'));
      queryClient.setConfig({ retry: 0 });

      try {
        await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryClientErrorResponse);
      }
    });

    it('should handle different error types', async () => {
      const queryKey = ['error-type-test'];
      const customError = new Error('Custom error message');
      mockQueryFn.mockRejectedValue(customError);
      queryClient.setConfig({ retry: 0 });

      try {
        await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryClientErrorResponse);
      }
    });
  });

  describe('Queue Operations', () => {
    it('should return queue as Map', () => {
      const queryKey1 = ['queue-1'];
      const queryKey2 = ['queue-2'];

      mockQueryFn.mockResolvedValue('data');
      queryClient.setQueryData({ queryKey: queryKey1, data: 'd1', queryFn: mockQueryFn });
      queryClient.setQueryData({ queryKey: queryKey2, data: 'd2', queryFn: mockQueryFn });

      const queue = queryClient.getQueue();
      expect(queue instanceof Map).toBe(true);
      expect(queue.size).toBe(2);
    });

    it('should return queue as array with metadata', () => {
      const queryKey = ['queue-array'];
      mockQueryFn.mockResolvedValue('data');
      queryClient.setQueryData({ queryKey, data: 'test', queryFn: mockQueryFn, staleTime: 5000 });

      const queueArray = queryClient.getQueueAsArray();
      expect(Array.isArray(queueArray)).toBe(true);
      expect(queueArray.length).toBe(1);
      expect(queueArray[0].queryKey).toEqual(queryKey);
      expect(queueArray[0].status).toBeDefined();
      expect(queueArray[0].timeLeftToExpire).toBeDefined();
    });

    it('should return correct store size', () => {
      mockQueryFn.mockResolvedValue('data');
      expect(queryClient.getStoreSize()).toBe(0);

      queryClient.setQueryData({ queryKey: ['q1'], data: 'd1', queryFn: mockQueryFn });
      expect(queryClient.getStoreSize()).toBe(1);

      queryClient.setQueryData({ queryKey: ['q2'], data: 'd2', queryFn: mockQueryFn });
      expect(queryClient.getStoreSize()).toBe(2);

      queryClient.removeQueries({ queryKey: ['q1'] });
      expect(queryClient.getStoreSize()).toBe(1);
    });

    it('should get queue as JSON', () => {
      const queryKey = ['json-queue'];
      mockQueryFn.mockResolvedValue('data');
      queryClient.setQueryData({ queryKey, data: 'test', queryFn: mockQueryFn });

      const jsonQueue = queryClient.getJsonQueue();
      expect(Array.isArray(jsonQueue)).toBe(true);
    });
  });

  describe('Query Key Management', () => {
    it('should correctly join and parse query keys', () => {
      const queryKey = ['users', '123', 'posts'];
      const joined = QueryClient.getQueryKey(queryKey);
      expect(joined).toBe('users:123:posts');

      const parsed = QueryClient.parseQueryKey(joined);
      expect(parsed).toEqual(queryKey);
    });

    it('should handle single element query key', () => {
      const queryKey = ['users'];
      const joined = QueryClient.getQueryKey(queryKey);
      const parsed = QueryClient.parseQueryKey(joined);
      expect(parsed).toEqual(queryKey);
    });

    it('should support partial key matching', async () => {
      mockQueryFn.mockResolvedValue('data');
      const queryKey = ['users', 'active', '123'];
      queryClient.setQueryData({ queryKey, data: 'test', queryFn: mockQueryFn });

      const partial = queryClient.getQueryData({ queryKey: ['users'] });
      expect(partial).toBeDefined();
    });

    it('should support exact key matching', async () => {
      mockQueryFn.mockResolvedValue('data');
      const queryKey1 = ['users', '1'];
      const queryKey2 = ['users', '2'];

      queryClient.setQueryData({ queryKey: queryKey1, data: 'd1', queryFn: mockQueryFn });
      queryClient.setQueryData({ queryKey: queryKey2, data: 'd2', queryFn: mockQueryFn });

      const exact1 = queryClient.getQueryData({ queryKey: queryKey1, exact: true });
      const exact2 = queryClient.getQueryData({ queryKey: queryKey2, exact: true });

      expect(exact1?.data).toBe('d1');
      expect(exact2?.data).toBe('d2');
    });
  });

  describe('Utility Methods', () => {
    it('should update query data directly', async () => {
      const queryKey = ['update-test'];
      mockQueryFn.mockResolvedValue('initial');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      queryClient.refreshQueryData({ queryKey }, 'updated');

      expect(queryClient.getQueryData({ queryKey })?.data).toBe('updated');
    });

    it('should return fresh copy of queue on each call', () => {
      mockQueryFn.mockResolvedValue('data');
      queryClient.setQueryData({ queryKey: ['q1'], data: 'd1', queryFn: mockQueryFn });

      const queue1 = queryClient.getQueue();
      const queue2 = queryClient.getQueue();

      expect(queue1).not.toBe(queue2);
      expect(queue1.size).toBe(queue2.size);
    });

    it('should handle destroy gracefully', () => {
      queryClient.destroy();
      expect(queryClient.getStoreSize()).toBe(0);
    });

    it('should setConfig return this for chaining', () => {
      const result = queryClient.setConfig({ retry: 5 }).setConfig({ staleTime: 1000 });
      expect(result).toBe(queryClient);
    });

    it('should clear return this for chaining', () => {
      const result = queryClient.clear();
      expect(result).toBe(queryClient);
    });
  });

  describe('Metadata Management', () => {
    it('should track data creation time', async () => {
      const queryKey = ['metadata-created'];
      mockQueryFn.mockResolvedValue('data');

      const beforeFetch = Date.now();
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      const afterFetch = Date.now();

      const metadata = queryClient.getQueryData({ queryKey })?.getMetadata();
      expect(metadata?.dataCreatedAt).toBeGreaterThanOrEqual(beforeFetch);
      expect(metadata?.dataCreatedAt).toBeLessThanOrEqual(afterFetch);
    });

    it('should track data update time', async () => {
      jest.useFakeTimers();
      const queryKey = ['metadata-updated'];
      mockQueryFn.mockResolvedValue('data');

      const beforeFetch = Date.now();
      jest.setSystemTime(beforeFetch);
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      const initialUpdate = queryClient.getQueryData({ queryKey })?.getMetadata().dataUpdatedAt;

      jest.advanceTimersByTime(1000);
      queryClient.refreshQueryData({ queryKey }, 'new data');
      const updatedUpdate = queryClient.getQueryData({ queryKey })?.getMetadata().dataUpdatedAt;

      expect(updatedUpdate).toBeGreaterThan(initialUpdate!);
    });

    it('should track error update count', async () => {
      const queryKey = ['error-count'];
      mockQueryFn.mockResolvedValue('data');
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      const queryItem = queryClient.getQueryData({ queryKey });
      const initialCount = queryItem?.getMetadata().errorUpdateCount;

      queryItem?.updateError();
      const afterUpdate = queryItem?.getMetadata().errorUpdateCount;

      expect(afterUpdate).toBe((initialCount || 0) + 1);
    });
  });

  describe('Response Types', () => {
    it('should return QueryClientSuccessResponse for successful fetch', async () => {
      const queryKey = ['success-response'];
      mockQueryFn.mockResolvedValue('data');

      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(response).toBeInstanceOf(QueryClientSuccessResponse);
      expect(response.data).toBe('data');
    });

    it('should return QueryClientSuccessFromCacheResponse for cached data', async () => {
      const queryKey = ['cache-response'];
      mockQueryFn.mockResolvedValue('data');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 5000 });
      const cachedResponse = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });

      expect(cachedResponse).toBeInstanceOf(QueryClientSuccessFromCacheResponse);
    });

    it('should return QueryClientErrorResponse on error', async () => {
      const queryKey = ['error-response'];
      mockQueryFn.mockRejectedValue(new Error('Test error'));
      queryClient.setConfig({ retry: 0 });

      try {
        await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryClientErrorResponse);
      }
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple concurrent fetches for different keys', async () => {
      mockQueryFn.mockResolvedValue('data');

      const results = await Promise.all([
        queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: ['concurrent-1'] }),
        queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: ['concurrent-2'] }),
        queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: ['concurrent-3'] }),
      ]);

      expect(results).toHaveLength(3);
      expect(queryClient.getStoreSize()).toBe(3);
    });

    it('should handle invalidate and refetch cycle', async () => {
      const queryKey = ['cycle-test'];
      mockQueryFn.mockResolvedValueOnce('v1');

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey, staleTime: 10000 });
      expect(queryClient.getQueryData({ queryKey })?.data).toBe('v1');

      await queryClient.invalidateQueryData({ queryKey });

      mockQueryFn.mockResolvedValueOnce('v2');
      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(response.data).toBe('v2');
    });

    it('should manage queries with different staleTime and gcTime', async () => {
      jest.useFakeTimers();
      const queryKey1 = ['different-times-1'];
      const queryKey2 = ['different-times-2'];

      mockQueryFn.mockResolvedValue('data');
      queryClient.setConfig({ gcTime: 5000 });

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: queryKey1, staleTime: 1000 });
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: queryKey2, staleTime: 2000 });

      jest.advanceTimersByTime(1500);
      const q1Item = queryClient.getQueryData({ queryKey: queryKey1 });
      const q2Item = queryClient.getQueryData({ queryKey: queryKey2 });

      expect(q1Item?.isStale()).toBe(true);
      expect(q2Item?.isStale()).toBe(false);
    });

    it('should handle edge cases with null and falsy values', async () => {
      const queryKeys = [
        ['null-value'],
        ['zero-value'],
        ['false-value'],
        ['empty-string'],
      ];
      const values = [null, 0, false, ''];

      mockQueryFn.mockResolvedValue(null);
      for (let i = 0; i < queryKeys.length; i++) {
        mockQueryFn.mockResolvedValueOnce(values[i]);
        const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: queryKeys[i] });
        expect(response.data).toBe(values[i]);
      }
    });

    it('should handle large data structures', async () => {
      const queryKey = ['large-data'];
      const largeArray = Array.from({ length: 500 }, (_, i) => ({
        id: i,
        data: `item-${i}`,
        nested: { value: i * 2 },
      }));
      mockQueryFn.mockResolvedValue(largeArray);

      const response = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(response.data).toHaveLength(500);
      expect(queryClient.getQueryData({ queryKey })?.data).toHaveLength(500);
    });

    it('should handle very deep query key paths', async () => {
      const deepKey = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      mockQueryFn.mockResolvedValue({ deep: 'data' });

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: deepKey });
      const retrieved = queryClient.getQueryData({ queryKey: deepKey });

      expect(retrieved?.data).toEqual({ deep: 'data' });
    });

    it('should handle sequential invalidate-refetch cycles', async () => {
      const queryKey = ['cycles'];
      let callCount = 0;
      mockQueryFn.mockImplementation(async () => `data-${++callCount}`);

      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(callCount).toBe(1);

      await queryClient.invalidateQueryData({ queryKey });
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(callCount).toBe(2);

      await queryClient.invalidateQueryData({ queryKey });
      await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(callCount).toBe(3);
    });
  });

  describe('Integration Tests', () => {
    it('should manage complete query lifecycle', async () => {
      jest.useFakeTimers();
      const queryKey = ['lifecycle'];
      const staleTime = 2000;
      const gcTime = 5000;

      queryClient.setConfig({ staleTime, gcTime, retry: 1 });

      // 1. Initial fetch
      mockQueryFn.mockResolvedValueOnce('v1');
      const initial = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(initial.data).toBe('v1');

      // 2. Use cache while fresh
      const cached = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(cached).toBeInstanceOf(QueryClientSuccessFromCacheResponse);

      // 3. Wait for stale
      jest.advanceTimersByTime(staleTime + 100);
      mockQueryFn.mockResolvedValueOnce('v2');
      const stale = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(stale.data).toBe('v2');

      // 4. Invalidate and refetch
      await queryClient.invalidateQueryData({ queryKey });
      mockQueryFn.mockResolvedValueOnce('v3');
      const invalidated = await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey });
      expect(invalidated.data).toBe('v3');

      jest.useRealTimers();
    });

    it('should handle complex key hierarchies with partial removals', () => {
      mockQueryFn.mockResolvedValue('data');
      const keys = [
        ['users'],
        ['users', 'profile'],
        ['users', 'profile', '123'],
        ['users', 'posts'],
        ['posts'],
        ['posts', '456'],
      ];

      keys.forEach(key => queryClient.setQueryData({ queryKey: key, data: key.join('-'), queryFn: mockQueryFn }));
      expect(queryClient.getStoreSize()).toBe(6);

      queryClient.removeQueries({ queryKey: ['users', 'profile'] });
      expect(queryClient.getStoreSize()).toBe(4);

      queryClient.removeQueries({ queryKey: ['posts'] });
      expect(queryClient.getStoreSize()).toBe(1);
    });
  });
});
