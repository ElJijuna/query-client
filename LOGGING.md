# Query Client Logging Documentation

## Overview

The QueryClient now includes comprehensive logging capabilities for tracking query operations, caching, invalidation, and errors. Logging is disabled by default to maintain optimal performance in production.

## Enabling Logging

To enable logging in your application:

```typescript
import { QueryClient } from 'query-client';

const queryClient = QueryClient.getInstance();

// Enable logging
queryClient.setConfig({ enableLogging: true });
```

## Log Types

### 1. Informational Logs (when `enableLogging: true`)

Informational logs are only printed when logging is explicitly enabled and include timestamps in ISO format.

#### Query Creation Log
When a new query is cached:
```
[QueryClient 2026-03-18T16:53:20.995Z] Query key created and cached {
  queryKey: ['users', '1'],
  key: 'users:1',
  staleTime: 60000,
  gcTime: 300000
}
```

#### Cache Hit Log
When returning cached data:
```
[QueryClient 2026-03-18T16:53:21.100Z] Returning cached data for query key {
  queryKey: ['users', '1'],
  isStale: false
}
```

#### Query Refresh Log
When refreshing cached data:
```
[QueryClient 2026-03-18T16:53:21.150Z] Query data refreshed {
  queryKey: ['users', '1']
}
```

#### Query Invalidation Log
When invalidating a query:
```
[QueryClient 2026-03-18T16:53:21.200Z] Query invalidated - will refetch on next access {
  queryKey: ['users', '1'],
  exact: true
}
```

#### Query Removal Log
When manually removing a query:
```
[QueryClient 2026-03-18T16:53:21.250Z] Query key removed from cache {
  queryKey: ['users', '1'],
  key: 'users:1'
}
```

#### Query Expiration Log (Garbage Collection)
When GC removes an expired query:
```
[QueryClient 2026-03-18T16:53:21.300Z] Query key expired and removed from cache: users:1 {
  queryKey: ['users', '1']
}
```

#### Retry Log
When a query attempt fails and will be retried:
```
[QueryClient 2026-03-18T16:53:21.350Z] Query attempt 1 failed, retrying... {
  queryKey: ['users', '1'],
  attempts: 1,
  nextRetryIn: 1000
}
```

### 2. Error Logs (always enabled)

Error logs are **always printed** to `console.error`, regardless of the `enableLogging` setting, to ensure critical issues are captured:

#### Query Failure Log
When a query fails after all retry attempts:
```
[QueryClient ERROR 2026-03-18T16:53:21.400Z] Query failed after 3 attempts {
  queryKey: ['users', '1'],
  attempts: 3,
  error: Error: Network timeout
}
```

#### Fetch Error Log
When fetching fails unexpectedly:
```
[QueryClient ERROR 2026-03-18T16:53:21.450Z] Failed to retrieve data after successful fetch {
  queryKey: ['users', '1'],
  error: Error: Unknown error
}
```

#### Query Not Found Error
When attempting to refetch a non-existent query:
```
[QueryClient ERROR 2026-03-18T16:53:21.500Z] Failed to refetch query - not found {
  queryKey: ['users', '1'],
  error: Error: No query in queries.
}
```

#### Invalidation Error
When attempting to invalidate a non-existent query:
```
[QueryClient ERROR 2026-03-18T16:53:21.550Z] Failed to invalidate query - not found {
  queryKey: ['users', '1'],
  exact: true,
  error: Error: No query in queries.
}
```

## Configuration Options

### Enable Logging
```typescript
queryClient.setConfig({ enableLogging: true });
```

### Disable Logging (default)
```typescript
queryClient.setConfig({ enableLogging: false });
```

### Combined with Other Config
```typescript
queryClient.setConfig({
  enableLogging: true,
  staleTime: 60000,
  gcTime: 300000,
  dataStrategy: 'clone',
  retry: 3
});
```

## Data Protection Strategies with Logging

When using different data protection strategies:

```typescript
// Clone strategy (safe, creates copies)
queryClient.setConfig({ 
  enableLogging: true,
  dataStrategy: 'clone'
});

// Freeze strategy (fast, prevents mutations)
queryClient.setConfig({ 
  enableLogging: true,
  dataStrategy: 'freeze'
});

// Reference strategy (fastest, no protection)
queryClient.setConfig({ 
  enableLogging: true,
  dataStrategy: 'reference'
});
```

Logs will be generated the same way regardless of the strategy chosen.

## Performance Considerations

- **Logging Enabled**: Minimal performance impact. Logs are only created when needed and only logged when `enableLogging: true`.
- **Logging Disabled** (default): No performance overhead. Log checks are short-circuited.
- **Error Logs**: Always enabled for critical error tracking.

## Recommended Practices

1. **Development**: Enable logging to understand query behavior
```typescript
if (process.env.NODE_ENV === 'development') {
  queryClient.setConfig({ enableLogging: true });
}
```

2. **Production**: Keep logging disabled to minimize I/O operations
```typescript
if (process.env.NODE_ENV === 'production') {
  queryClient.setConfig({ enableLogging: false });
}
```

3. **Debugging**: Enable logging temporarily to troubleshoot issues
```typescript
// Temporarily enable for debugging
queryClient.setConfig({ enableLogging: true });

// Your code here...

// Disable when done
queryClient.setConfig({ enableLogging: false });
```

## Log Format

All logs follow a consistent format:

**Informational Logs:**
```
[QueryClient ISO_TIMESTAMP] MESSAGE { contextData }
```

**Error Logs:**
```
[QueryClient ERROR ISO_TIMESTAMP] MESSAGE { contextData }
```

Where:
- `ISO_TIMESTAMP`: ISO 8601 formatted timestamp (e.g., `2026-03-18T16:53:20.995Z`)
- `MESSAGE`: Human-readable description of the operation
- `contextData`: Relevant context like queryKey, attempts, errors, etc.

## Examples

### Example 1: Basic Setup with Logging

```typescript
import { QueryClient } from 'query-client';

const queryClient = QueryClient.getInstance();
queryClient.setConfig({ enableLogging: true });

// Fetch a query
const response = await queryClient.fetchQuery({
  queryKey: ['users', '1'],
  queryFn: async ({ signal }) => {
    const res = await fetch('/api/users/1', { signal });
    return res.json();
  }
});

// Output:
// [QueryClient 2026-03-18T16:53:20.995Z] Query key created and cached { queryKey: ['users', '1'], ... }
```

### Example 2: Invalidation with Logging

```typescript
// Invalidate a query
await queryClient.invalidateQueryData({ 
  queryKey: ['users', '1'],
  exact: true 
});

// Output:
// [QueryClient 2026-03-18T16:53:21.200Z] Query invalidated - will refetch on next access { queryKey: ['users', '1'], exact: true }
```

### Example 3: Error Handling

```typescript
try {
  const response = await queryClient.fetchQuery({
    queryKey: ['failing-query'],
    queryFn: async () => {
      throw new Error('API Error');
    },
    retry: 2
  });
} catch (error) {
  // Output:
  // [QueryClient ERROR 2026-03-18T16:53:21.400Z] Query failed after 3 attempts { queryKey: ['failing-query'], attempts: 3, ... }
}
```

## Troubleshooting

### Not Seeing Logs?

1. **Check if logging is enabled:**
```typescript
// Verify logging is enabled
queryClient.setConfig({ enableLogging: true });
```

2. **Check console output:**
   - For info logs: Check browser console or Node.js stdout
   - For error logs: Check browser console or Node.js stderr

3. **Verify queryKey format:**
   - Logs use the internal key format (joined by `:`)
   - E.g., `['users', '1']` → `users:1`

### Too Many Logs?

If logging is too verbose, disable it in production:
```typescript
if (process.env.NODE_ENV !== 'development') {
  queryClient.setConfig({ enableLogging: false });
}
```

## Related Documentation

- [Query Client API](./README.md)
- [Data Protection Strategies](./README.md#data-protection-strategies)
- [Configuration Options](./README.md#configuration)
