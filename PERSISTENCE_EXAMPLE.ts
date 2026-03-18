import { QueryClient } from './src/query-client';

/**
 * PERSISTENCE EXAMPLE - File-based Query Cache Storage
 * 
 * This example demonstrates how to use the QueryClient with file-based
 * persistence to save and load the query cache from a JSON file.
 */

async function persistenceExample() {
  // Get the singleton instance
  const queryClient = QueryClient.getInstance();

  // Configure QueryClient with file persistence
  queryClient.setConfig({
    staleTime: 60 * 1000, // 60 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    persistenceStrategy: 'file', // Enable file persistence
    persistencePath: process.cwd(), // Use current working directory (creates query-cache.json)
    enableLogging: true, // Enable logging to see what's happening
  });

  // Example 1: Fetch and cache some data
  console.log('\n=== Example 1: Fetching and caching data ===\n');

  const userQuery = await queryClient.fetchQuery({
    queryKey: ['users', '1'],
    queryFn: async ({ signal }) => {
      // Simulate API call
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
          });
        }, 500);
      });
    },
    staleTime: 60 * 1000,
  });

  console.log('User data fetched:', userQuery.data);

  // Example 2: Fetch another query
  console.log('\n=== Example 2: Fetching posts data ===\n');

  const postsQuery = await queryClient.fetchQuery({
    queryKey: ['posts', 'user', '1'],
    queryFn: async ({ signal }) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve([
            { id: 1, title: 'First Post', userId: 1 },
            { id: 2, title: 'Second Post', userId: 1 },
            { id: 3, title: 'Third Post', userId: 1 },
          ]);
        }, 500);
      });
    },
    staleTime: 60 * 1000,
  });

  console.log('Posts data fetched:', postsQuery.data);

  // Example 3: View the current cache queue
  console.log('\n=== Example 3: Viewing cache queue ===\n');

  const queue = queryClient.getQueueAsArray();
  console.log('Current cache entries:');
  queue.forEach((entry) => {
    console.log(`  - Key: ${entry.key}`);
    console.log(`    Status: ${entry.status}`);
    console.log(`    Time to expire: ${entry.timeLeftToExpire}ms`);
    console.log('');
  });

  // Example 4: Save cache to JSON file
  console.log('\n=== Example 4: Saving cache to file ===\n');
  console.log('File will be saved at: query-cache.json in your current directory');
  console.log('The file contains all cached queries with their metadata');
  console.log('You can manually inspect the file to see the serialized cache structure');

  // Note: The file is automatically saved when using file persistence strategy
  // If you want to manually trigger a save, the internal saveCacheToFile() method
  // is called during garbage collection cycles and cache updates

  // Example 5: Demonstrate what the saved file looks like
  console.log('\n=== Example 5: Cache file structure ===\n');
  console.log('The query-cache.json file will contain entries like:');
  console.log(`
[
  {
    "queryKey": ["users", "1"],
    "key": "users:1",
    "data": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com"
    },
    "metadata": {
      "dataCreatedAt": 1710768000000,
      "dataUpdatedAt": 1710768000500,
      "staleTime": 60000,
      "isInvalidated": false
    }
  },
  {
    "queryKey": ["posts", "user", "1"],
    "key": "posts:user:1",
    "data": [
      { "id": 1, "title": "First Post", "userId": 1 },
      { "id": 2, "title": "Second Post", "userId": 1 },
      { "id": 3, "title": "Third Post", "userId": 1 }
    ],
    "metadata": {
      "dataCreatedAt": 1710768001000,
      "dataUpdatedAt": 1710768001500,
      "staleTime": 60000,
      "isInvalidated": false
    }
  }
]
  `);

  // Example 6: Using memory persistence (default)
  console.log('\n=== Example 6: Memory persistence (default) ===\n');

  const memoryClient = QueryClient.getInstance();
  memoryClient.setConfig({
    persistenceStrategy: 'memory', // Data stays only in memory (default)
    enableLogging: true,
  });

  console.log('Memory persistence: Data cached in RAM only, lost on process restart');

  // Example 7: Switch persistence strategy
  console.log('\n=== Example 7: Switching persistence strategies ===\n');

  queryClient.setConfig({
    persistenceStrategy: 'file',
    persistencePath: process.cwd(),
  });

  console.log('Switched to file persistence');

  // Example 8: Configuration options
  console.log('\n=== Example 8: Available persistence configuration ===\n');
  console.log(`
Persistence Configuration Options:
├── persistenceStrategy: 'memory' | 'file'
│   ├── 'memory': Default, data stored in RAM only
│   └── 'file': Data persisted to JSON file
│
└── persistencePath: string (optional)
    └── Directory where query-cache.json will be saved
        Default: process.cwd() (current working directory)
        Example: '/Users/username/app-cache'
  `);

  console.log('\n=== Persistence Example Complete ===\n');
  console.log('Check the query-cache.json file that was created!');
}

// Run the example
persistenceExample().catch(console.error);
