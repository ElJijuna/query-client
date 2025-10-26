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
});