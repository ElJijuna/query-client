export class QueryClientBaseResponse<T = unknown, E = null | Error> {
  constructor(
    public data: T | undefined,
    public isPending: boolean,
    public isCached: boolean,
    public isSuccess: boolean,
    public isError: boolean,
    public error: E,
  ) {}
}

export class QueryClientSuccessResponse<T = unknown> extends QueryClientBaseResponse<T, null> {
  constructor(params: Omit<QueryClientBaseResponse<T, null>, 'error' | 'isError' | 'isPending' | 'isCached' | 'isSuccess'>) {
    super(params.data, false, true, true, false, null);
  }
}

export class QueryClientErrorResponse<E = unknown | Error> extends QueryClientBaseResponse<null, E> {
  constructor(params: Omit<QueryClientBaseResponse<null, E>, 'data' | 'isSuccess' | 'isPending' | 'isCached' | 'isError'>) {
    super(undefined, false, false, false, true, params.error);
  }
}

export class QueryClientSuccessFromCacheResponse<T = unknown> extends QueryClientBaseResponse<T, null> {
  constructor(params: Omit<QueryClientBaseResponse<T, null>, 'error' | 'isError' | 'isPending' | 'isCached' | 'isSuccess'>) {
    super(params.data, false, true, true, false, null);
  }
}