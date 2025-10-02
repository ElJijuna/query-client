import type { QueryFn } from './query-fn';

export class QueryItem<T = unknown> {
  public data: T;
  public dataCreatedAt: number = Date.now();
  public dataUpdatedAt: number;
  public errorUpdatedAt?: number;
  public errorUpdateCount: number = 0;
  public isInvalidated: boolean = false;
  public queryFn: QueryFn<T>;

  constructor(data: T, queryFn: QueryFn<T>) {
    this.data = data;
    this.dataUpdatedAt = Date.now();
    this.queryFn = queryFn;
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
}