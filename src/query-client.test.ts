import { QueryClient } from './query-client';

describe('QueryClient Singleton', () => {
  it('should return the same instance', () => {
    const instance1 = QueryClient.getInstance();
    const instance2 = QueryClient.getInstance();

    expect(instance1).toBe(instance2);
  });

  it('should allow setting and getting config', () => {
    const client = QueryClient.getInstance();
    client.setConfig({ retry: 3 });

    expect((client as any).config).toEqual(expect.objectContaining({ retry: 3, staleTime: 60000 }));
  });

  it('should get queue count', async () => {
    const client = QueryClient.getInstance();
    const queryFn = jest.fn().mockResolvedValue('fetched data');
    const suscriptor = jest.fn();
    const queryKey = ['test-query'];

    client.subscribe(suscriptor);
    await client.fetchQuery({ queryFn, queryKey });

    expect(client.getQueue().size).toBe(1);
    expect(client.getQueryData({ queryKey }).data).toBe('fetched data');
    expect(client.getQueryData({ queryKey }).dataCreatedAt).toBeDefined();
    expect(client.getQueryData({ queryKey }).dataUpdatedAt).toBeUndefined();

    await client.fetchQuery({ queryFn, queryKey });

    expect(client.getQueue().size).toBe(1);
    expect(client.getQueryData({ queryKey }).data).toBe('fetched data');
    expect(client.getQueryData({ queryKey }).dataCreatedAt).toBeDefined();
    expect(client.getQueryData({ queryKey }).dataUpdatedAt).toBeUndefined();

    queryFn.mockResolvedValue('refetched data');

    await client.refetchQueries({ queryKey });

    expect(client.getQueue().size).toBe(1);
    expect(client.getQueryData({ queryKey }).data).toBe('refetched data');
    expect(client.getQueryData({ queryKey }).dataCreatedAt).toBeDefined();
    expect(client.getQueryData({ queryKey }).dataUpdatedAt).toBeUndefined();

    expect(suscriptor).toHaveBeenCalledTimes(2);
  });

  it('should invalidate data', async () => {
    const client = QueryClient.getInstance();
    client.clear();
    const queryFn = jest.fn().mockResolvedValue('fetched data');
    const queryKey = ['test-query'];

    await client.fetchQuery({ queryFn, queryKey });

    expect(client.getQueryData({ queryKey }).data).toBe('fetched data');
    expect(client.getQueryData({ queryKey }).isInvalidated).toBe(false);

    client.invalidateQueryData({ queryKey });

    expect(client.getQueryData({ queryKey }).data).toBeUndefined();
    expect(client.getQueryData({ queryKey }).isInvalidated).toBe(true);
  });

  it('should throw error when call non-existent key valud', async () => {
    const client = QueryClient.getInstance();
    client.clear();

    await expect(() => client.refetchQueries({ queryKey: ['random'] })).rejects.toThrow(Error);
  });

  it('should remove query from queries', async () => {
    const queryFn = jest.fn();
    const client = QueryClient.getInstance();
    client.clear();
    const queryKey = ['test-query'];

    client.setQueryData({ queryKey, data: 'fetched data', queryFn })

    expect(client.getQueryData({ queryKey }).data).toBe('fetched data');

    client.removeQueries({ queryKey });

    expect(client.getQueryData({ queryKey })).toBeUndefined();
  });

  it('should invalidate query and re-execute query function when call fetchQUery', async () => {
    const client = QueryClient.getInstance();
    const queryFn = jest.fn().mockResolvedValue('fetched data');
    const queryKey = ['test-query'];

    await client.fetchQuery({ queryFn, queryKey });

    expect(client.getQueue().size).toBe(1);
    expect(client.getQueryData({ queryKey }).data).toBe('fetched data');
    expect(client.getQueryData({ queryKey }).isInvalidated).toBe(false);

    client.invalidateQueryData({ queryKey });

    expect(client.getQueryData({ queryKey }).data).toBeUndefined();
    expect(client.getQueryData({ queryKey }).isInvalidated).toBe(true);

    queryFn.mockResolvedValue('fetched data 2');
    await client.fetchQuery({ queryFn, queryKey });

    expect(client.getQueue().size).toBe(1);
    expect(client.getQueryData({ queryKey }).data).toBe('fetched data 2');
    expect(client.getQueryData({ queryKey }).dataCreatedAt).toBeDefined();
    expect(client.getQueryData({ queryKey }).dataUpdatedAt).toBeUndefined();

    queryFn.mockResolvedValue('refetched data');

    await client.refetchQueries({ queryKey });

    expect(client.getQueue().size).toBe(1);
    expect(client.getQueryData({ queryKey }).data).toBe('refetched data');
    expect(client.getQueryData({ queryKey }).dataCreatedAt).toBeDefined();
    expect(client.getQueryData({ queryKey }).dataUpdatedAt).toBeUndefined();
  });

  it('should return error message', async () => {
    const client = QueryClient.getInstance().setConfig({ retry: 0 }).clear();
    const queryFn = jest.fn().mockRejectedValue('error: custom error');
    const queryKey = ['test-query'];

    await expect(client.fetchQuery({ queryFn, queryKey })).rejects.toEqual({
      data: undefined,
      error: 'error: custom error',
      isCached: false,
      isError: true,
      isPending: false,
      isSuccess: false,
    });
  });
});