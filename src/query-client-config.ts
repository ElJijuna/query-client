export interface QueryClientConfig {
  retry?: number;
  retryDelay?: (attempt: number) => number;
  staleTime?: number;
  gcTime?: number;
  ignoreCache?: boolean;
}
