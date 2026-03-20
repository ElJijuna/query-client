/**
 * Query Client - A lightweight and efficient query client for managing server state
 * 
 * Features:
 * - Automatic caching with configurable stale time
 * - Garbage collection for memory management
 * - Retry logic with exponential backoff
 * - Subscription-based reactive updates
 * - Data protection strategies (clone, freeze, reference)
 * - File persistence support
 * - Comprehensive logging
 * 
 * @packageDocumentation
 */

export { QueryClient } from './query-client';
export type { QueryConfig } from './query-client';
export { DEFAULT_STALE_TIME, DEFAULT_RETRY, DEFAULT_GC_TIME } from './query-client';

export { QueryItem } from './query-item';
export type { QueryItemConfig, QueryItemWithData, QueryItemMetadata } from './query-item';

export type { 
  QueryClientConfig, 
  CacheDataStrategy, 
  PersistenceStrategy 
} from './query-client-config';

export type { QueryFn } from './query-fn';

export {
  QueryClientBaseResponse,
  QueryClientSuccessResponse,
  QueryClientErrorResponse,
  QueryClientSuccessFromCacheResponse
} from './query-client-response';

export type {
  QueryStatus,
  FetchStatus,
  QueryBaseResult,
  QuerySuccessResult,
  QueryPlaceholderResult,
  QueryPendingResult,
  QueryErrorResult,
  QueryResult
} from './types';
