import SSignal from 'ssignal';
import { QueryClientErrorResponse, QueryClientSuccessFromCacheResponse, QueryClientSuccessResponse } from './query-client-response';
import type { QueryFn } from './query-fn';
import { QueryItem } from './query-item';

export interface QueryClientConfig {
  retry?: number;
  retryDelay?: (attempt: number) => number;
  staleTime?: number;
  gcTime?: number;
  ignoreCache?: boolean;
}

export interface QueryConfig<T = unknown> extends QueryClientConfig {
  queryKey: string[];
  queryFn: QueryFn<T>;
}

export class QueryClient {
  private static instance: QueryClient;
  private queries = new SSignal(new Map<string, QueryItem>());
  private config: Required<QueryClientConfig>;
  private gcInterval: number | undefined;

  constructor() {
    this.config = {
      staleTime: 1000 * 60,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30000),
      gcTime: 1000 * 60 * 5,
      ignoreCache: false,
    };
  }

  private startGarbageCollection(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }

    this.gcInterval = setInterval(() => this.runGarbageCollection(), this.config.gcTime) as any satisfies number;
  }

  private runGarbageCollection(): void {
    const now = Date.now();

    for (const [key, queryItem] of this.queries.value.entries()) {
      if (now - queryItem.dataUpdatedAt > this.config.gcTime) {
        this.queries.value.delete(key);
      }
    }

    this.queries.value = new Map(this.queries.value);
  }

  public static getInstance(): QueryClient {
    if (!QueryClient.instance) {
      QueryClient.instance = new QueryClient();
    }

    return QueryClient.instance;
  }

  private isStored<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>): boolean {
    const key = QueryClient.getQueryKey(queryKey);

    return this.queries.value.has(key);
  }

  private isStale<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>): boolean {
    const queryItem = this.getQueryData({ queryKey }) as QueryItem<T>;

    if (!queryItem) {
      return true;
    }

    return Date.now() - queryItem.dataUpdatedAt > this.config.staleTime;
  }

  clear(): QueryClient {
    this.queries.value.clear();
    this.startGarbageCollection();

    return this;
  }

  public destroy(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
  }

  setConfig(config: QueryClientConfig): QueryClient {
    this.config = { ...this.config, ...config };

    return this;
  }

  setQueryData<T = unknown>({ queryKey, data, queryFn }: { queryKey: string[], data: T, queryFn: QueryFn<T> }): void {
    const key = QueryClient.getQueryKey(queryKey);

    this.queries.value.set(key, new QueryItem(data, queryFn));
  }

  updateQuery<T = unknown>(queryKey: string[], data: QueryItem<T>, queryFn?: QueryFn<T>): void {
    const key = QueryClient.getQueryKey(queryKey);

    this.queries.value.set(key, data);
  }

  getQueryData<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>): QueryItem<T> {
    const key = QueryClient.getQueryKey(queryKey);

    return this.queries.value.get(key) as QueryItem<T>;
  }

  removeQueries<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>) {
    const key = QueryClient.getQueryKey(queryKey);

    this.queries.value.delete(key);
  }

  async refetchQueries<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>): Promise<any> {
    if (!this.isStored({ queryKey })) {
      throw new Error('No query in queries.');
    }

    const storedData = this.getQueryData<T>({ queryKey });
  
    return this.fetchQuery<T>({ queryKey, queryFn: storedData.queryFn, ignoreCache: true });
  }

  async invalidateQueryData<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>) {
    const data = this.getQueryData<T>({ queryKey }).invalidate();

    this.updateQuery<T>(queryKey, data);
  }

  async fetchQuery<T = unknown, E = unknown | Error>({ queryFn, queryKey, retry = this.config.retry, retryDelay = this.config.retryDelay, ignoreCache = false }: QueryConfig<T>): Promise<any>
 {
    const isStored = this.isStored({ queryKey });
    const isStale = this.isStale({ queryKey });
    const storedData = this.getQueryData<T>({ queryKey });

    if (!ignoreCache && isStored && !isStale && storedData && !storedData.isInvalidated) {
      return new QueryClientSuccessFromCacheResponse<T>(storedData);
    }

    let attempts = 0;

    while (attempts <= retry) {
      try {
        const { signal } = new AbortController();
        const data = await queryFn({ signal });

        this.setQueryData({ queryKey, data, queryFn });
        const result = this.getQueryData<T>({ queryKey });

        if (result) {
          return new QueryClientSuccessResponse<T>(result);
        }

        throw new Error('Failed to retrieve query data after fetch.');
      } catch (error) {
        attempts++;
        if (attempts > retry) {
          throw new QueryClientErrorResponse({
            error,
          });
        }

        await waitFor(retryDelay(attempts));
      }
    }
  }

  static getQueryKey = (queryKey: string[]) => {
    return queryKey.join(':');
  }

  public getQueue() {
    return this.queries.value;
  }

  public subscribe(callback: (value: Map<string, QueryItem<unknown>>) => () => void) {
    return this.queries.subscribe(callback)
  }
}

const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
