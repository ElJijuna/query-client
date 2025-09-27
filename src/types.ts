export type QueryStatus = 'pending' | 'error' | 'success';

export type FetchStatus = 'idle' | 'loading' | 'error' | 'success';

export type QueryBaseResult<TData = unknown, TError = unknown> = {
    data: TData | undefined;
    error: TError | null;
    isError: boolean;
    isCached: boolean;
    dataUpdatedAt?: number;
    refetchInterval?: number;
    cacheKey?: string;
    failureCount?: number;
    errorUpdatedAt?: number;
    errorUpdatedCount?: number;
    isFetched?: boolean;
    isPlaceholderData?: boolean;
    isRefetchError?: boolean;
    isRefetching?: boolean;
    isStale?: boolean;
    isSuccess?: boolean;
    status?: QueryStatus;
    fetchStatus?: FetchStatus;
    refetch?: () => Promise<QueryBaseResult<TData, TError>>;
    promise?: Promise<QueryBaseResult<TData, TError>>;
};

export interface QuerySuccessResult<TData = unknown, TError = unknown> extends QueryBaseResult<TData, TError> {
    data: TData
    error: null
    isError: false
    isPending: false
    isLoading: false
    isLoadingError: false
    isRefetchError: false
    isSuccess: true
    isPlaceholderData: false
    status: 'success'
}

export interface QueryPlaceholderResult<TData = unknown, TError = unknown> extends QueryBaseResult<TData, TError> {
    data: TData
    isError: false
    error: null
    isPending: false
    isLoading: false
    isLoadingError: false
    isRefetchError: false
    isSuccess: true
    isPlaceholderData: true
    status: 'success'
}

export interface QueryPendingResult<TData = unknown, TError = unknown> extends QueryBaseResult<TData, TError> {
    data: undefined
    error: null
    isError: false
    isPending: true
    isLoadingError: false
    isRefetchError: false
    isSuccess: false
    isPlaceholderData: false
    status: 'pending'
}

export interface QueryErrorResult<TData = unknown, TError = unknown> extends QueryBaseResult<TData, TError> {
    data: TData
    error: TError
    isError: true
    isPending: false
    isLoading: false
    isLoadingError: false
    isRefetchError: true
    isSuccess: false
    isPlaceholderData: false
    status: 'error'
}

export type QueryResult<TData = unknown, TError = unknown> = | QuerySuccessResult<TData, TError> | QueryErrorResult<TData, TError> | QueryPendingResult<TData, TError> | QueryPlaceholderResult<TData, TError>;