/**
 * Strategy for handling data retrieval from cache
 */
export type CacheDataStrategy = 'clone' | 'freeze' | 'reference';

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
}
