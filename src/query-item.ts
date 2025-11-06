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
const DATA = Symbol('query.item.data');

import type { CacheDataStrategy } from './query-client-config';

const protectData = <U>(value: U, strategy: CacheDataStrategy = 'clone'): U => {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  // Helper function for deep cloning
  const safeClone = (val: any): any => {
    try {
      const sc = (globalThis as any).structuredClone;
      if (typeof sc === 'function') return sc(val);
      return JSON.parse(JSON.stringify(val));
    } catch {
      return val;
    }
  };

  // Helper function for deep freezing
  const deepFreeze = (obj: any): any => {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(prop => {
      if (obj[prop] !== null && typeof obj[prop] === 'object') {
        deepFreeze(obj[prop]);
      }
    });
    return obj;
  };

  switch (strategy) {
    case 'clone':
      return safeClone(value);
    case 'freeze':
      return deepFreeze(safeClone(value));
    case 'reference':
      return value;
    default:
      return value;
  }
};

export class QueryItem<T = unknown> {
  public queryFn: QueryFn<T>;
  [METADATA]: QueryItemMetadata;
  [DATA]: T;

  constructor(
    data: T,
    { queryFn, staleTime = 0 }: Omit<QueryItemConfig<T>, 'queryKey'>
  ) {
    this[DATA] = data;
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

  /**
   * Public accessor for the data which returns a cloned copy to prevent
   * accidental external mutation of the cached value.
   */
  private dataStrategy: CacheDataStrategy = 'clone';

  public get data(): T {
    return protectData(this[DATA], this.dataStrategy);
  }

  public setDataStrategy(strategy: CacheDataStrategy): void {
    this.dataStrategy = strategy;
  }

  /**
   * Time left in milliseconds before the item becomes stale. Never negative.
   */
  public get timeLeftToStale(): number {
    const expiresAt = this[METADATA].dataUpdatedAt + this[METADATA].staleTime;
    return Math.max(0, expiresAt - Date.now());
  }

  public getMetadata(): QueryItemMetadata {
    return this[METADATA];
  }

  public updateData(data: T): QueryItem<T> {
    this[DATA] = data;
    this.getMetadata().dataUpdatedAt = Date.now();
    return this;
  }

  public updateError(): QueryItem<T> {
    this.getMetadata().errorUpdatedAt = Date.now();
    this.getMetadata().errorUpdateCount += 1;
    return this;
  }

  public invalidate(): QueryItem<T> {
    this[DATA] = undefined as T;
    this.getMetadata().isInvalidated = true;
    return this;
  }

  public isStale(): boolean {
    return Date.now() - this.getMetadata().dataUpdatedAt > this.getMetadata().staleTime;
  }
}
