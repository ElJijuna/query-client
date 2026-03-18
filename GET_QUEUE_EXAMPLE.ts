// Ejemplo de uso de getQueueAsArray()

import { QueryClient } from 'query-client';

const queryClient = QueryClient.getInstance();
queryClient.setConfig({ 
  enableLogging: true,
  staleTime: 30000,  // 30 segundos
  gcTime: 300000     // 5 minutos
});

// Simular algunos queries cacheados
async function setupQueries() {
  await queryClient.fetchQuery({
    queryKey: ['users'],
    queryFn: async ({ signal }) => {
      return { users: ['Alice', 'Bob'] };
    }
  });

  await queryClient.fetchQuery({
    queryKey: ['users', '1'],
    queryFn: async ({ signal }) => {
      return { id: 1, name: 'Alice' };
    }
  });

  await queryClient.fetchQuery({
    queryKey: ['posts', '5'],
    queryFn: async ({ signal }) => {
      return { id: 5, title: 'My Post' };
    }
  });
}

// Usar getQueueAsArray()
async function main() {
  await setupQueries();

  // Obtener el array con información de los queries
  const queue = queryClient.getQueueAsArray();

  console.log('Queue Information:');
  console.log('==================\n');

  queue.forEach(item => {
    console.log(`Query Key: ${item.queryKey.join(' > ')}`);
    console.log(`  Full Key: ${item.key}`);
    console.log(`  Created At: ${new Date(item.createdAt).toLocaleString()}`);
    console.log(`  Updated At: ${new Date(item.updatedAt).toLocaleString()}`);
    console.log(`  Expires At: ${new Date(item.expiresAt).toLocaleString()}`);
    console.log(`  Time Left to Expire: ${(item.timeLeftToExpire / 1000).toFixed(1)}s`);
    console.log(`  Is Stale: ${item.isStale}`);
    console.log(`  Is Invalidated: ${item.isInvalidated}`);
    console.log(`  Stale Time: ${item.staleTime}ms`);
    console.log(`  GC Time: ${item.gcTime}ms`);
    console.log(`  Status: ${item.status}`);
    console.log('');
  });

  // Ejemplo de iteración
  console.log('\nIterating over queue:');
  queue.forEach(item => {
    if (item.status === 'fresh') {
      console.log(`✅ ${item.queryKey.join('/')} - Fresh data available`);
    } else if (item.status === 'stale') {
      console.log(`⚠️  ${item.queryKey.join('/')} - Data is stale, should refetch`);
    } else if (item.status === 'invalidated') {
      console.log(`❌ ${item.queryKey.join('/')} - Data invalidated, will refetch on next access`);
    } else if (item.status === 'expired') {
      console.log(`💀 ${item.queryKey.join('/')} - Data expired and will be removed`);
    }
  });

  // Filtrar solo queries fresh
  const freshQueries = queue.filter(item => item.status === 'fresh');
  console.log(`\nTotal fresh queries: ${freshQueries.length}`);

  // Ordenar por tiempo de expiración
  const sortedByExpiration = [...queue].sort(
    (a, b) => a.timeLeftToExpire - b.timeLeftToExpire
  );
  console.log('\nQueries sorted by time to expire:');
  sortedByExpiration.forEach(item => {
    console.log(`  ${item.queryKey.join('/')} - ${(item.timeLeftToExpire / 1000).toFixed(1)}s left`);
  });
}

main().catch(console.error);

/*
Expected Output:
================

Query Information:
==================

Query Key: users
  Full Key: users
  Created At: 3/18/2026, 2:15:30 PM
  Updated At: 3/18/2026, 2:15:30 PM
  Expires At: 3/18/2026, 2:20:30 PM
  Time Left to Expire: 299.9s
  Is Stale: false
  Is Invalidated: false
  Stale Time: 30000ms
  GC Time: 300000ms
  Status: fresh

Query Key: users > 1
  Full Key: users:1
  Created At: 3/18/2026, 2:15:31 PM
  Updated At: 3/18/2026, 2:15:31 PM
  Expires At: 3/18/2026, 2:20:31 PM
  Time Left to Expire: 298.9s
  Is Stale: false
  Is Invalidated: false
  Stale Time: 30000ms
  GC Time: 300000ms
  Status: fresh

Query Key: posts > 5
  Full Key: posts:5
  Created At: 3/18/2026, 2:15:32 PM
  Updated At: 3/18/2026, 2:15:32 PM
  Expires At: 3/18/2026, 2:20:32 PM
  Time Left to Expire: 297.9s
  Is Stale: false
  Is Invalidated: false
  Stale Time: 30000ms
  GC Time: 300000ms
  Status: fresh

Iterating over queue:
✅ users - Fresh data available
✅ users/1 - Fresh data available
✅ posts/5 - Fresh data available

Total fresh queries: 3

Queries sorted by time to expire:
  posts/5 - 297.9s left
  users/1 - 298.9s left
  users - 299.9s left
*/
