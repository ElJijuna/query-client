#!/usr/bin/env node

import { QueryClient } from './lib/query-client.es.js';

/**
 * Run persistence example to demonstrate file-based cache storage
 */
async function runPersistenceDemo() {
  console.log('🚀 Starting QueryClient Persistence Demo\n');

  const queryClient = QueryClient.getInstance();

  // Configure with file persistence
  queryClient.setConfig({
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    persistenceStrategy: 'file',
    persistencePath: process.cwd(),
    enableLogging: true,
  });

  console.log('✅ QueryClient configured with file persistence\n');

  // Fetch some example data
  console.log('📝 Fetching example data...\n');

  try {
    const result1 = await queryClient.fetchQuery({
      queryKey: ['users', 'profile'],
      queryFn: async ({ signal }) => {
        return {
          id: 1,
          name: 'Jane Doe',
          email: 'jane@example.com',
          role: 'admin',
        };
      },
      staleTime: 60 * 1000,
    });

    console.log('✅ User profile cached\n');

    const result2 = await queryClient.fetchQuery({
      queryKey: ['products', 'featured'],
      queryFn: async ({ signal }) => {
        return [
          { id: 1, name: 'Product A', price: 29.99 },
          { id: 2, name: 'Product B', price: 49.99 },
          { id: 3, name: 'Product C', price: 79.99 },
        ];
      },
      staleTime: 60 * 1000,
    });

    console.log('✅ Products cached\n');

    // View the cache
    console.log('📊 Current Cache Queue:\n');
    const queue = queryClient.getQueueAsArray();
    queue.forEach((entry) => {
      console.log(`   Key: ${entry.key}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   Time to expire: ${(entry.timeLeftToExpire / 1000).toFixed(1)}s\n`);
    });

    console.log('💾 Cache saved to: query-cache.json');
    console.log('   Location: ' + process.cwd() + '/query-cache.json\n');

    console.log('✅ Persistence demo completed successfully!');
    console.log('   You can inspect the query-cache.json file to see the cached data.\n');
  } catch (error) {
    console.error('❌ Error during demo:', error);
  }
}

runPersistenceDemo().catch(console.error);
