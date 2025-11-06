import SSignal from 'ssignal';
import {
  QueryClientErrorResponse,
  QueryClientSuccessFromCacheResponse,
  QueryClientSuccessResponse,
} from './query-client-response';
import type { QueryFn } from './query-fn';
import { QueryItem, type QueryItemConfig, type QueryItemWithData } from './query-item';
import { partialMatchKey } from './utils/utils';

const QUERY_CLIENT_INSTANCE = Symbol.for('global.query.client');

export const DEFAULT_STALE_TIME = 1000 * 60;
export const DEFAULT_RETRY = 3;
export const DEFAULT_GC_TIME = 1000 * 60 * 5;

export interface QueryConfig<T = unknown> extends QueryItemConfig {
  refetch?: boolean;
  queryKey: string[];
  queryFn: QueryFn<T>;
  exact?: boolean;
}

export class QueryClient {
  private queries = new SSignal(new Map<string, QueryItem>());
  private config: Required<Omit<QueryItemConfig, 'queryKey' | 'queryFn'>>;
  private gcInterval: number | undefined;

  constructor() {
    this.config = {
      staleTime: DEFAULT_STALE_TIME,
      retry: DEFAULT_RETRY,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30000),
      gcTime: DEFAULT_GC_TIME,
      ignoreCache: false,
    };
  }

  private startGarbageCollection(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }

    this.gcInterval = setInterval(
      () => this.runGarbageCollection(),
      this.config.gcTime,
    ) as any satisfies number;
  }

  private runGarbageCollection(): void {
    const now = Date.now();

    for (const [key, queryItem] of this.queries.value.entries()) {
      if (now - queryItem.getMetadata().dataUpdatedAt > this.config.gcTime) {
        this.queries.value.delete(key);
      }
    }

    this.queries.value = new Map(this.queries.value);
  }

  private isStored<T = unknown>({ queryKey }: Pick<QueryConfig<T>, 'queryKey'>): boolean {
    const key = QueryClient.getQueryKey(queryKey);
    return this.queries.value.has(key);
  }

  private isStale<T = unknown>({ queryKey }: Pick<QueryConfig<T>, 'queryKey'>): boolean {
    const queryItem = this.getQueryData<T>({ queryKey }) as QueryItem<T>;
    if (!queryItem) return true;
    return queryItem.isStale();
  }

  clear(): QueryClient {
    this.queries.value.clear();
    this.startGarbageCollection();
    return this;
  }

  destroy(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
  }

  getQueue<T = unknown>(): Map<string, QueryItem<T>> {
    // Return a shallow copy to avoid exposing internal Map reference
    return new Map(this.queries.value as Map<string, QueryItem<T>>);
  }

  getJsonQueue<T = unknown>(): unknown {
    try {
      const queue = Object.entries(Object.fromEntries(this.getQueue<T>()))
        .map(([queryKey, { data, queryFn, ...rest }]) => ({
          queryKey,
          queryKeyOriginal: QueryClient.parseQueryKey(queryKey),
          data,
          config: { ...rest },
        }));

      return queue;
    } catch {
      return [];
    }
  }

  subscribe(callback: (value: Map<string, QueryItem<unknown>>) => () => void) {
    return this.queries.subscribe(callback);
  }

  setConfig(config: Omit<QueryItemConfig, 'queryKey' | 'data' | 'queryFn'>): QueryClient {
    this.config = { ...this.config, ...config };
    return this;
  }

  setQueryData<T = unknown>({
    queryKey,
    data,
    queryFn,
    staleTime,
  }: QueryItemWithData<T>): void {
    const key = QueryClient.getQueryKey(queryKey);
    const queryItem = new QueryItem<T>(data, { queryFn, staleTime });

    queryItem.getMetadata().timeoutId = setTimeout(() => {
      this.removeQueries({ queryKey });
    }, staleTime);

    this.queries.value.set(key, queryItem);
  }

  updateQuery<T = unknown>(queryKey: string[], data: QueryItem<T>): void {
    const key = QueryClient.getQueryKey(queryKey);
    this.queries.value.set(key, data);
  }

  refreshQueryData<T = unknown>(
    { queryKey }: Pick<QueryConfig<T>, 'queryKey'>,
    newData: T,
  ): void {
    const key = QueryClient.getQueryKey(queryKey);
    const data = this.getQueryData({ queryKey });

    if (data) {
      this.queries.value.set(key, data.updateData(newData));
    }
  }

  getQueryData<T = unknown>({
    queryKey,
    exact,
  }: Pick<QueryConfig<T>, 'queryKey' | 'exact'>): QueryItem<T> | undefined {
    if (exact) {
      const key = QueryClient.getQueryKey(queryKey);
      return this.queries.value.get(key) as QueryItem<T>;
    }

    for (const [key, queryItem] of this.queries.value.entries()) {
      const parsedKey = QueryClient.parseQueryKey(key);
      if (partialMatchKey(queryKey, parsedKey)) {
        return queryItem as QueryItem<T>;
      }
    }

    return undefined;
  }

  removeQueries<T = unknown>({ queryKey }: Pick<QueryConfig<T>, 'queryKey'>) {
    // Support removing by exact key or by partial key
    const exactKey = QueryClient.getQueryKey(queryKey);

    // If an exact key exists, remove it directly
    if (this.queries.value.has(exactKey)) {
      this.queries.value.delete(exactKey);
      this.queries.value = new Map(this.queries.value);
      return;
    }

    // Otherwise, remove all partial matches
    const keysToRemove: string[] = [];
    for (const [key] of this.queries.value.entries()) {
      const parsedKey = QueryClient.parseQueryKey(key);
      if (partialMatchKey(queryKey, parsedKey)) {
        keysToRemove.push(key);
      }
    }

    for (const k of keysToRemove) this.queries.value.delete(k);
    if (keysToRemove.length > 0) this.queries.value = new Map(this.queries.value);
  }

  /** Return the number of queries currently stored in the client */
  getStoreSize(): number {
    return this.queries.value.size;
  }

  async refetchQueries<T = unknown>(
    { queryKey }: Omit<QueryConfig<T>, 'queryFn'>,
  ): Promise<any> {
    if (!this.isStored({ queryKey })) {
      throw new Error('No query in queries.');
    }

    const storedData = this.getQueryData<T>({ queryKey });
    if (!storedData) throw new Error('No query in queries.');

    if (storedData.getMetadata().timeoutId) {
      clearTimeout(storedData.getMetadata().timeoutId);
    }

    return this.fetchQuery<T>({
      queryKey,
      queryFn: storedData.queryFn,
      ignoreCache: true,
      staleTime: storedData.getMetadata().staleTime,
      refetch: true,
    });
  }

  async invalidateQueryData<T = unknown>(
    { queryKey, exact }: Omit<QueryConfig<T>, 'queryFn'>,
  ): Promise<void> {
    const data = this.getQueryData<T>({ queryKey, exact })?.invalidate();
    if (!data) throw new Error('No query in queries.');
    this.updateQuery<T>(queryKey, data);
  }

  async fetchQuery<T = unknown, E = unknown | Error>({
    queryFn,
    queryKey,
    retry = this.config.retry,
    retryDelay = this.config.retryDelay,
    ignoreCache = false,
    staleTime = 0,
    refetch,
  }: QueryConfig<T>): Promise<any> {
    const isStored = this.isStored({ queryKey });
    const isStale = this.isStale({ queryKey });
    const storedData = this.getQueryData<T>({ queryKey });

    if (!ignoreCache && isStored && !isStale && storedData && !storedData.getMetadata().isInvalidated) {
      return new QueryClientSuccessFromCacheResponse<T>(storedData);
    }

    let attempts = 0;

    while (attempts <= retry) {
      try {
        const { signal } = new AbortController();
        const data = await queryFn({ signal });

        if (refetch) {
          this.refreshQueryData({ queryKey }, data);
        } else {
          this.setQueryData({ queryKey, data, queryFn, staleTime });
        }

        const result = this.getQueryData<T>({ queryKey });
        if (result) {
          return new QueryClientSuccessResponse<T>(result);
        }

        throw new Error('Failed to retrieve query data after fetch.');
      } catch (error) {
        attempts++;
        if (attempts > retry) {
          throw new QueryClientErrorResponse({ error });
        }
        await waitFor(retryDelay(attempts));
      }
    }
  }

  static getQueryKey = (queryKey: string[]) => queryKey.join(':');
  static parseQueryKey = (queryKey: string) => queryKey.split(':');

  static getInstance(): QueryClient {
    if (!(globalThis as any)[QUERY_CLIENT_INSTANCE]) {
      (globalThis as any)[QUERY_CLIENT_INSTANCE] = new QueryClient();
    }
    return (globalThis as any)[QUERY_CLIENT_INSTANCE];
  }
}

const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
