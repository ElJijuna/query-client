import type { QueryClientConfig } from './query-client-config';
import type { QueryFn } from './query-fn';

export interface QueryItemConfig<T = unknown> extends QueryClientConfig {
  queryKey: string[];
  queryFn: QueryFn<T>;
}

export interface QueryItemWithData<T = unknown> extends QueryItemConfig<T> {
  data: T;
}

export class QueryItem<T = unknown> {
  public data: T;
  public dataCreatedAt: number = Date.now();
  public dataUpdatedAt: number;
  public errorUpdatedAt?: number;
  public errorUpdateCount: number = 0;
  public isInvalidated: boolean = false;
  public staleTime: number;
  public timeoutId: any;
  public queryFn: QueryFn<T>;

  constructor(data: T, { queryFn, staleTime = 0 }: Omit<QueryItemConfig<T>, 'queryKey'>) {
    this.data = data;
    this.dataUpdatedAt = Date.now();
    this.queryFn = queryFn;
    this.isInvalidated = false;
    this.staleTime = staleTime;
  }

  public get timeLeftToStale(): number {
    return this.dataUpdatedAt - this.staleTime;
  }

  public updateData(data: T): QueryItem<T> {
    this.data = data;
    this.dataUpdatedAt = Date.now();

    return this;
  }

  public updateError(): QueryItem<T> {
    this.errorUpdatedAt = Date.now();
    this.errorUpdateCount += 1;

    return this;
  }

  public invalidate(): QueryItem<T> {
    this.data = undefined as T;
    this.isInvalidated = true;

    return this;
  }

  isStale() {
    return Date.now() - this.dataUpdatedAt > this.staleTime;
  }
}