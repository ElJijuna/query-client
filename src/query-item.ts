import type { QueryClientConfig } from './query-client-config';
import type { QueryFn } from './query-fn';

export interface QueryItemConfig<T = unknown> extends QueryClientConfig {
  queryKey: string[];
  queryFn: QueryFn<T>;
}

export interface QueryItemWithData<T = unknown> extends QueryItemConfig<T> {
  data: T;
}

/**
 * Contiene información temporal y de estado del query.
 */
export interface QueryItemMetadata {
  dataCreatedAt: number;
  dataUpdatedAt: number;
  errorUpdatedAt?: number;
  errorUpdateCount: number;
  isInvalidated: boolean;
  staleTime: number;
  timeoutId?: any;
}

const METADATA = Symbol('query.item.metadata');

export class QueryItem<T = unknown> {
  public data: T;
  public queryFn: QueryFn<T>;
  [METADATA]: QueryItemMetadata;

  constructor(
    data: T,
    { queryFn, staleTime = 0 }: Omit<QueryItemConfig<T>, 'queryKey'>
  ) {
    this.data = data;
    this.queryFn = queryFn;

    this[METADATA] = {
      dataCreatedAt: Date.now(),
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: undefined,
      errorUpdateCount: 0,
      isInvalidated: false,
      staleTime,
      timeoutId: undefined,
    };
  }

  public get timeLeftToStale(): number {
    return this[METADATA].dataUpdatedAt - this[METADATA].staleTime;
  }

  public getMetadata(): QueryItemMetadata {
    return this[METADATA];
  }

  public updateData(data: T): QueryItem<T> {
    this.data = data;
    this.getMetadata().dataUpdatedAt = Date.now();
    return this;
  }

  public updateError(): QueryItem<T> {
    this.getMetadata().errorUpdatedAt = Date.now();
    this.getMetadata().errorUpdateCount += 1;
    return this;
  }

  public invalidate(): QueryItem<T> {
    this.data = undefined as T;
    this.getMetadata().isInvalidated = true;
    return this;
  }

  public isStale(): boolean {
    return Date.now() - this.getMetadata().dataUpdatedAt > this.getMetadata().staleTime;
  }
}
