/**
 * Strategy for handling data retrieval from cache
 */
export type CacheDataStrategy = 'clone' | 'freeze' | 'reference';

/**
 * Persistence strategy for query cache
 */
export type PersistenceStrategy = 'memory' | 'file';

export interface QueryClientConfig {
  retry?: number;
  retryDelay?: (attempt: number) => number;
  staleTime?: number;
  gcTime?: number;
  ignoreCache?: boolean;
  /** 
   * How to handle data when retrieving from cache:
   * - 'clone': Deep clone data (safe but slower for large objects)
   * - 'freeze': Use Object.freeze (fast, prevents mutation but shallow)
   * - 'reference': Return direct reference (fastest, no protection)
   * @default 'clone'
   */
  dataStrategy?: CacheDataStrategy;
  /** 
   * Enable logging for query client operations (create, invalidate, remove, expire)
   * @default false
   */
  enableLogging?: boolean;
  /** 
   * Persistence strategy for storing query cache
   * - 'memory': Store in memory only (default)
   * - 'file': Persist to JSON file on disk
   * @default 'memory'
   */
  persistenceStrategy?: PersistenceStrategy;
  /** 
   * Path to directory where query cache JSON file will be stored (only for file persistence)
   * If not provided, defaults to current working directory
   * @default process.cwd()
   */
  persistencePath?: string;
}
