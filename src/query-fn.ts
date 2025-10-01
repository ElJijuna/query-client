export type QueryFn<T = unknown> = (config?: { signal: AbortSignal }) => Promise<T>;
