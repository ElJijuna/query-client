import SSignal from 'ssignal';
import {
  QueryClientErrorResponse,
  QueryClientSuccessFromCacheResponse,
  QueryClientSuccessResponse,
} from './query-client-response';
import type { QueryFn } from './query-fn';
import { QueryItem, type QueryItemConfig, type QueryItemWithData } from './query-item';
import { partialMatchKey } from './utils/utils';

// Import file system utilities (only used in Node.js environment)
let fs: any = null;
let path: any = null;
try {
  fs = require('fs');
  path = require('path');
} catch {
  // File system not available (browser environment)
}const QUERY_CLIENT_INSTANCE = Symbol.for('global.query.client');

export const DEFAULT_STALE_TIME = 1000 * 60;
export const DEFAULT_RETRY = 3;
export const DEFAULT_GC_TIME = 1000 * 60 * 5;

export interface QueryConfig<T = unknown> extends QueryItemConfig {
  refetch?: boolean;
  queryKey: string[];
  queryFn: QueryFn<T>;
  exact?: boolean;
}

export class QueryClient {
  private queries = new SSignal(new Map<string, QueryItem>());
  private config: Required<Omit<QueryItemConfig, 'queryKey' | 'queryFn'>>;
  private gcInterval: number | undefined;

  // Index for partial key lookup optimization
  private keyIndex = new Map<string, Set<string>>();

  private indexKey(key: string[]): void {
    const fullKey = QueryClient.getQueryKey(key);
    // Index each prefix
    for (let i = 0; i < key.length; i++) {
      const prefix = QueryClient.getQueryKey(key.slice(0, i + 1));
      if (!this.keyIndex.has(prefix)) {
        this.keyIndex.set(prefix, new Set());
      }
      this.keyIndex.get(prefix)?.add(fullKey);
    }
  }

  private unindexKey(key: string[]): void {
    const fullKey = QueryClient.getQueryKey(key);
    for (let i = 0; i < key.length; i++) {
      const prefix = QueryClient.getQueryKey(key.slice(0, i + 1));
      this.keyIndex.get(prefix)?.delete(fullKey);
      if (this.keyIndex.get(prefix)?.size === 0) {
        this.keyIndex.delete(prefix);
      }
    }
  }

  constructor() {
    this.config = {
      staleTime: DEFAULT_STALE_TIME,
      retry: DEFAULT_RETRY,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30000),
      gcTime: DEFAULT_GC_TIME,
      ignoreCache: false,
      dataStrategy: 'clone',
      enableLogging: false,
      persistenceStrategy: 'memory',
      persistencePath: this.getDefaultPersistencePath(),
    };

    // Load cached data from file if file persistence is enabled
    this.loadCacheFromFile();
  }

  private getDefaultPersistencePath(): string {
    try {
      return process.cwd ? process.cwd() : '.';
    } catch {
      return '.';
    }
  }

  private getPersistenceFilePath(): string {
    if (!this.config.persistencePath) {
      this.config.persistencePath = this.getDefaultPersistencePath();
    }
    const fileName = 'query-cache.json';
    if (path) {
      return path.join(this.config.persistencePath, fileName);
    }
    return `${this.config.persistencePath}/${fileName}`;
  }

  private saveCacheToFile(): void {
    if (this.config.persistenceStrategy !== 'file' || !fs || !path) {
      return;
    }

    try {
      const cacheData = this.serializeCacheForFile();
      const filePath = this.getPersistenceFilePath();
      
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2), 'utf-8');
      this.log(`Cache saved to file`, { filePath });
    } catch (error) {
      this.error('Failed to save cache to file', error);
    }
  }

  private loadCacheFromFile(): void {
    if (this.config.persistenceStrategy !== 'file' || !fs) {
      return;
    }

    try {
      const filePath = this.getPersistenceFilePath();
      if (!fs.existsSync(filePath)) {
        this.log(`Cache file not found`, { filePath });
        return;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const cacheData = JSON.parse(fileContent);
      this.deserializeCacheFromFile(cacheData);
      this.log(`Cache loaded from file`, { filePath });
    } catch (error) {
      this.error('Failed to load cache from file', error);
    }
  }

  private serializeCacheForFile(): any {
    const result: any = [];

    for (const [key, queryItem] of this.queries.value.entries()) {
      try {
        const metadata = queryItem.getMetadata();
        result.push({
          queryKey: QueryClient.parseQueryKey(key),
          key,
          data: queryItem.data,
          metadata: {
            dataCreatedAt: metadata.dataCreatedAt,
            dataUpdatedAt: metadata.dataUpdatedAt,
            staleTime: metadata.staleTime,
            isInvalidated: metadata.isInvalidated,
          },
        });
      } catch (error) {
        this.error(`Error serializing cache entry for key ${key}`, error);
      }
    }

    return result;
  }

  private deserializeCacheFromFile(cacheData: any): void {
    if (!Array.isArray(cacheData)) {
      return;
    }

    for (const entry of cacheData) {
      try {
        const { queryKey, data, metadata } = entry;
        if (!queryKey || !Array.isArray(queryKey)) {
          continue;
        }

        const now = Date.now();
        // Check if data is not expired
        if (metadata && (now - metadata.dataUpdatedAt) <= this.config.gcTime) {
          this.setQueryData({
            queryKey,
            data,
            queryFn: async () => data,
            staleTime: metadata.staleTime,
          });
        }
      } catch (error) {
        this.error('Error deserializing cache entry', error);
      }
    }
  }

  private log(message: string, data?: any): void {
    if (this.config.enableLogging) {
      const timestamp = new Date().toISOString();
      console.log(`[QueryClient ${timestamp}] ${message}`, data ? data : '');
    }
  }

  private error(message: string, error?: any): void {
    const timestamp = new Date().toISOString();
    console.error(`[QueryClient ERROR ${timestamp}] ${message}`, error ? error : '');
  }

  private startGarbageCollection(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }

    this.gcInterval = setInterval(
      () => this.runGarbageCollection(),
      this.config.gcTime,
    ) as any satisfies number;
  }

  private runGarbageCollection(): void {
    const now = Date.now();
    let hasRemovals = false;

    for (const [key, queryItem] of this.queries.value.entries()) {
      if (now - queryItem.getMetadata().dataUpdatedAt > this.config.gcTime) {
        if (queryItem.getMetadata().timeoutId) {
          clearTimeout(queryItem.getMetadata().timeoutId);
        }
        const parsedKey = QueryClient.parseQueryKey(key);
        this.log(`Query key expired and removed from cache: ${key}`, { queryKey: parsedKey });
        this.unindexKey(parsedKey);
        this.queries.value.delete(key);
        hasRemovals = true;
      }
    }

    if (hasRemovals) {
      this.queries.value = new Map(this.queries.value);
    }
  }

  private isStored<T = unknown>({ queryKey }: Pick<QueryConfig<T>, 'queryKey'>): boolean {
    const key = QueryClient.getQueryKey(queryKey);
    return this.queries.value.has(key);
  }

  private isStale<T = unknown>({ queryKey }: Pick<QueryConfig<T>, 'queryKey'>): boolean {
    const queryItem = this.getQueryData<T>({ queryKey }) as QueryItem<T>;
    if (!queryItem) return true;
    return queryItem.isStale();
  }

  clear(): QueryClient {
    this.queries.value.clear();
    this.keyIndex.clear();
    this.startGarbageCollection();
    return this;
  }

  destroy(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
  }

  getQueue<T = unknown>(): Map<string, QueryItem<T>> {
    // Return a shallow copy to avoid exposing internal Map reference
    return new Map(this.queries.value as Map<string, QueryItem<T>>);
  }

  getQueueAsArray<T = unknown>(): Array<{
    queryKey: string[];
    key: string;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    timeLeftToExpire: number;
    isStale: boolean;
    isInvalidated: boolean;
    staleTime: number;
    gcTime: number;
    status: 'fresh' | 'stale' | 'expired' | 'invalidated';
  }> {
    const now = Date.now();
    const result: Array<{
      queryKey: string[];
      key: string;
      createdAt: number;
      updatedAt: number;
      expiresAt: number;
      timeLeftToExpire: number;
      isStale: boolean;
      isInvalidated: boolean;
      staleTime: number;
      gcTime: number;
      status: 'fresh' | 'stale' | 'expired' | 'invalidated';
    }> = [];

    for (const [key, queryItem] of this.queries.value.entries()) {
      try {
        const metadata = queryItem.getMetadata();
        const expiresAt = metadata.dataUpdatedAt + this.config.gcTime;
        const timeLeftToExpire = Math.max(0, expiresAt - now);
        const isStale = queryItem.isStale();
        const isInvalidated = metadata.isInvalidated;

        // Determine status
        let status: 'fresh' | 'stale' | 'expired' | 'invalidated' = 'fresh';
        if (isInvalidated) {
          status = 'invalidated';
        } else if (timeLeftToExpire === 0) {
          status = 'expired';
        } else if (isStale) {
          status = 'stale';
        }

        result.push({
          queryKey: QueryClient.parseQueryKey(key),
          key,
          createdAt: metadata.dataCreatedAt,
          updatedAt: metadata.dataUpdatedAt,
          expiresAt,
          timeLeftToExpire,
          isStale,
          isInvalidated,
          staleTime: metadata.staleTime,
          gcTime: this.config.gcTime,
          status,
        });
      } catch (error) {
        this.error(`Error building queue array entry for key ${key}`, error);
      }
    }

    return result;
  }

  getJsonQueue<T = unknown>(): unknown {
    try {
      const queue = Object.entries(Object.fromEntries(this.getQueue<T>()))
        .map(([queryKey, { data, queryFn, ...rest }]) => ({
          queryKey,
          queryKeyOriginal: QueryClient.parseQueryKey(queryKey),
          data,
          config: { ...rest },
        }));

      return queue;
    } catch {
      return [];
    }
  }

  subscribe(callback: (value: Map<string, QueryItem<unknown>>) => () => void) {
    return this.queries.subscribe(callback);
  }

  setConfig(config: Omit<QueryItemConfig, 'queryKey' | 'data' | 'queryFn'>): QueryClient {
    this.config = { ...this.config, ...config };
    return this;
  }

  setQueryData<T = unknown>({
    queryKey,
    data,
    queryFn,
    staleTime,
  }: QueryItemWithData<T>): void {
    const key = QueryClient.getQueryKey(queryKey);
    const queryItem = new QueryItem<T>(data, { queryFn, staleTime });
    queryItem.setDataStrategy(this.config.dataStrategy);

    // Schedule removal using gcTime (cache eviction), not staleTime.
    // staleTime indicates freshness; gcTime indicates when to evict from cache.
    queryItem.getMetadata().timeoutId = setTimeout(() => {
      this.removeQueries({ queryKey });
    }, this.config.gcTime);

    this.indexKey(queryKey);
    this.queries.value.set(key, queryItem);
    this.log(`Query key created and cached`, { queryKey, key, staleTime, gcTime: this.config.gcTime });
    
    // Auto-save to file if file persistence is enabled
    this.saveCacheToFile();
  }

  updateQuery<T = unknown>(queryKey: string[], data: QueryItem<T>): void {
    const key = QueryClient.getQueryKey(queryKey);
    this.queries.value.set(key, data);
  }

  refreshQueryData<T = unknown>(
    { queryKey }: Pick<QueryConfig<T>, 'queryKey'>,
    newData: T,
  ): void {
    const key = QueryClient.getQueryKey(queryKey);
    const data = this.getQueryData({ queryKey });

    if (data) {
      this.queries.value.set(key, data.updateData(newData));
      this.log(`Query data refreshed`, { queryKey, key, newDataUpdatedAt: Date.now() });
      
      // Auto-save to file if file persistence is enabled
      this.saveCacheToFile();
    }
  }

  getQueryData<T = unknown>({
    queryKey,
    exact,
  }: Pick<QueryConfig<T>, 'queryKey' | 'exact'>): QueryItem<T> | undefined {
    if (exact) {
      const key = QueryClient.getQueryKey(queryKey);
      return this.queries.value.get(key) as QueryItem<T>;
    }

    for (const [key, queryItem] of this.queries.value.entries()) {
      const parsedKey = QueryClient.parseQueryKey(key);
      if (partialMatchKey(queryKey, parsedKey)) {
        return queryItem as QueryItem<T>;
      }
    }

    return undefined;
  }

  private clearQueryTimeout(queryItem: QueryItem | undefined): void {
    if (queryItem?.getMetadata().timeoutId) {
      clearTimeout(queryItem.getMetadata().timeoutId);
    }
  }

  removeQueries<T = unknown>({ queryKey }: Pick<QueryConfig<T>, 'queryKey'>) {
    const prefix = QueryClient.getQueryKey(queryKey);
    const matchingKeys = Array.from(this.keyIndex.get(prefix) ?? []);

    if (matchingKeys.length === 0 && this.queries.value.has(prefix)) {
      // If no indexed matches but exact key exists, remove it
      const item = this.queries.value.get(prefix);
      this.clearQueryTimeout(item);
      this.unindexKey(queryKey);
      this.queries.value.delete(prefix);
      this.queries.value = new Map(this.queries.value);
      this.log(`Query key removed from cache`, { queryKey, key: prefix });
      return;
    }

    let removed = false;
    for (const key of matchingKeys) {
      const item = this.queries.value.get(key);
      this.clearQueryTimeout(item);
      this.unindexKey(QueryClient.parseQueryKey(key));
      this.queries.value.delete(key);
      this.log(`Query key removed from cache`, { queryKey: QueryClient.parseQueryKey(key), key });
      removed = true;
    }

    if (removed) {
      this.queries.value = new Map(this.queries.value);
    }
  }  /** Return the number of queries currently stored in the client */
  getStoreSize(): number {
    return this.queries.value.size;
  }

  async refetchQueries<T = unknown>(
    { queryKey }: Omit<QueryConfig<T>, 'queryFn'>,
  ): Promise<any> {
    if (!this.isStored({ queryKey })) {
      const err = new Error('No query in queries.');
      this.error('Failed to refetch query - not found', { queryKey, error: err });
      throw err;
    }

    const storedData = this.getQueryData<T>({ queryKey });
    if (!storedData) {
      const err = new Error('No query in queries.');
      this.error('Failed to retrieve query data for refetch', { queryKey, error: err });
      throw err;
    }

    if (storedData.getMetadata().timeoutId) {
      clearTimeout(storedData.getMetadata().timeoutId);
    }

    return this.fetchQuery<T>({
      queryKey,
      queryFn: storedData.queryFn,
      ignoreCache: true,
      staleTime: storedData.getMetadata().staleTime,
      refetch: true,
    });
  }

  async invalidateQueryData<T = unknown>(
    { queryKey, exact }: Omit<QueryConfig<T>, 'queryFn'>,
  ): Promise<void> {
    const data = this.getQueryData<T>({ queryKey, exact });
    if (!data) {
      const err = new Error('No query in queries.');
      this.error('Failed to invalidate query - not found', { queryKey, exact, error: err });
      throw err;
    }
    
    // Invalidate the query item
    const invalidatedData = data.invalidate();
    
    // Get the correct key to update based on exact flag
    if (exact) {
      this.updateQuery<T>(queryKey, invalidatedData);
    } else {
      // For partial matches, find the actual key and update it
      const actualKey = Array.from(this.queries.value.keys()).find(k => {
        const parsedKey = QueryClient.parseQueryKey(k);
        return partialMatchKey(queryKey, parsedKey);
      });
      if (actualKey) {
        this.updateQuery<T>(QueryClient.parseQueryKey(actualKey), invalidatedData);
      }
    }
    
    this.log(`Query invalidated - will refetch on next access`, { queryKey, exact });
  }

  async fetchQuery<T = unknown, E = unknown | Error>({
    queryFn,
    queryKey,
    retry = this.config.retry,
    retryDelay = this.config.retryDelay,
    ignoreCache = false,
    staleTime = 0,
    refetch,
  }: QueryConfig<T>): Promise<any> {
    const isStored = this.isStored({ queryKey });
    const isStale = this.isStale({ queryKey });
    const storedData = this.getQueryData<T>({ queryKey });

    if (!ignoreCache && isStored && !isStale && storedData && !storedData.getMetadata().isInvalidated) {
      this.log(`Returning cached data for query key`, { queryKey, isStale: false });
      return new QueryClientSuccessFromCacheResponse<T>(storedData);
    }

    let attempts = 0;

    while (attempts <= retry) {
      try {
        const { signal } = new AbortController();
        const data = await queryFn({ signal });

        if (refetch) {
          this.refreshQueryData({ queryKey }, data);
          this.log(`Query data refreshed`, { queryKey });
        } else {
          this.setQueryData({ queryKey, data, queryFn, staleTime });
        }

        const result = this.getQueryData<T>({ queryKey });
        if (result) {
          return new QueryClientSuccessResponse<T>(result);
        }

        const err = new Error('Failed to retrieve query data after fetch.');
        this.error('Failed to retrieve data after successful fetch', { queryKey, error: err });
        throw err;
      } catch (error) {
        attempts++;
        if (attempts > retry) {
          this.error(`Query failed after ${attempts} attempts`, { queryKey, attempts, error });
          throw new QueryClientErrorResponse({ error });
        }
        this.log(`Query attempt ${attempts} failed, retrying...`, { queryKey, attempts, nextRetryIn: retryDelay(attempts) });
        await waitFor(retryDelay(attempts));
      }
    }
  }

  static getQueryKey = (queryKey: string[]) => queryKey.join(':');
  static parseQueryKey = (queryKey: string) => queryKey.split(':');

  static getInstance(): QueryClient {
    if (!(globalThis as any)[QUERY_CLIENT_INSTANCE]) {
      (globalThis as any)[QUERY_CLIENT_INSTANCE] = new QueryClient();
    }
    return (globalThis as any)[QUERY_CLIENT_INSTANCE];
  }
}

const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
