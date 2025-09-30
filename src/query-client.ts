import { QueryClientErrorResponse, QueryClientSuccessResponse } from './query-client-response';
import type { QueryFn } from './query-fn';
import { QueryItem } from './query-item';


export interface QueryClientConfig {
  retry?: number;
  staleTime?: number;
}

export interface QueryConfig<T = unknown> extends QueryClientConfig {
  queryKey: string[];
  queryFn: QueryFn<T>;
}

export class QueryClient {
  private static instance: QueryClient;
  private queries = new Map();
  private config: QueryClientConfig;

  constructor() {
    this.config = {};
  }

  public static getInstance(): QueryClient {
    if (!QueryClient.instance) {
      QueryClient.instance = new QueryClient();
    }
  
    return QueryClient.instance;
  }

  private isStored<T =unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>): boolean {
    const key = QueryClient.getQueryKey(queryKey);

    return this.queries.has(key);
  }

  clear(): void {
    this.queries = new Map();
  }

  setConfig(config: QueryClientConfig): void {
    this.config = { ...this.config, ...config };
  }

  setQueryData<T = unknown>({ queryKey, data, queryFn }: { queryKey: string[], data: T, queryFn: QueryFn<T> }): void {
    const key = QueryClient.getQueryKey(queryKey);

    this.queries.set(key, new QueryItem(data, queryFn));
  }

  updateQuery<T = unknown>(queryKey: string[], data: QueryItem<T>, queryFn?: QueryFn<T>): void {
    const key = QueryClient.getQueryKey(queryKey);

    this.queries.set(key, data);
  }

  getQueryData<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>): QueryItem<T> {
    const key = QueryClient.getQueryKey(queryKey);

    return this.queries.get(key);
  }

  removeQueries<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>) {
    const key = QueryClient.getQueryKey(queryKey);

    this.queries.delete(key);
  }

  async refetchQueries<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>) {
    if (!this.isStored({ queryKey })) {
      throw new Error('No query in queries.');
    }

    const { signal } = new AbortController();
    const storedData = this.getQueryData<T>({ queryKey });
    const newQueryResult = await storedData.queryFn({ signal });
    const { data } = storedData.updateData(newQueryResult);

    this.setQueryData<T>({ queryKey, data, queryFn: storedData.queryFn });

    return this.getQueryData({ queryKey });
  }

  async invalidateQueryData<T = unknown>({ queryKey }: Omit<QueryConfig<T>, 'queryFn'>) {
    const data = this.getQueryData<T>({ queryKey }).invalidate();

    this.updateQuery<T>(queryKey, data);
  }

  async fetchQuery<T = unknown, E = unknown | Error>({ queryFn, queryKey }: QueryConfig<T>) {
    if (this.isStored({ queryKey })) {
      const data = this.getQueryData({ queryKey });
      
      if (data.isInvalidated) {
        return this.refetchQueries({ queryKey });
      }

      return data;
    }

    try {
      const { signal } = new AbortController();
      const data = await queryFn({ signal });

      this.setQueryData({ queryKey, data, queryFn });
      const result = this.getQueryData({ queryKey });

      return result;
    } catch (error) {
      throw new QueryClientErrorResponse({
        error,
      });
    }
  }

  static getQueryKey = (queryKey: string[]) => {
    return queryKey.join(':');
  }

  public getQueue() {
    return this.queries;
  }
}