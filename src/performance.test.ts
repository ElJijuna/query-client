import { QueryClient } from './query-client';

describe('Performance Tests', () => {
    let queryClient: QueryClient;
    const mockQueryFn = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (QueryClient as any).instance = undefined;
        queryClient = QueryClient.getInstance();
        queryClient.clear();
    });

    afterEach(() => {
        queryClient.destroy();
    });

    const measureTime = async (fn: () => Promise<void>): Promise<number> => {
        const start = performance.now();
        await fn();
        return performance.now() - start;
    };

    describe('Data Strategy Performance', () => {
        it('should measure performance impact of different data strategies', async () => {
            const largeObject = Array.from({ length: 1000 }, (_, i) => ({
                id: i,
                name: `Item ${i}`,
                nested: { value: i, data: `data ${i}` },
                array: Array.from({ length: 10 }, (_, j) => ({ sub: j }))
            }));

            // Test each strategy
            const strategies = ['clone', 'freeze', 'reference'] as const;
            const results: Record<string, number> = {};

            for (const strategy of strategies) {
                queryClient.setConfig({ dataStrategy: strategy });
                mockQueryFn.mockResolvedValue(largeObject);

                const key = ['perf-test', strategy];
                await queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: key });

                // Measure time to read data 1000 times
                const time = await measureTime(async () => {
                    for (let i = 0; i < 1000; i++) {
                        queryClient.getQueryData({ queryKey: key })?.data;
                    }
                });

                results[strategy] = time;
            }

            // Log results but don't assert specific times as they're environment dependent
            console.log('Data Strategy Performance (ms):', results);

            // Just verify relative performance
            expect(results.reference ?? Infinity).toBeLessThan(results.freeze ?? Infinity);
            expect(results.freeze ?? Infinity).toBeLessThan(results.clone ?? Infinity);
        });
    });

    describe('Partial Key Search Performance', () => {
        it('should efficiently handle partial key searches with large datasets', async () => {
            // Create 1000 queries with nested keys
            const keys = Array.from({ length: 1000 }, (_, i) => [
                'users',
                Math.floor(i / 100).toString(),
                (i % 100).toString()
            ]);

            mockQueryFn.mockResolvedValue('data');

            // Insert all queries
            await Promise.all(
                keys.map(key =>
                    queryClient.fetchQuery({ queryFn: mockQueryFn, queryKey: key })
                )
            );

            // Measure time for partial key removal
            const removalTime = await measureTime(async () => {
                queryClient.removeQueries({ queryKey: ['users', '0'] });
            });

            console.log('Partial Key Removal Time (ms):', removalTime);

            // Verify removal worked correctly
            const remaining = queryClient.getStoreSize();
            expect(remaining).toBe(900); // Should have removed 100 items
        });
    });

    describe('Memory Usage', () => {
        it('should track approximate memory usage', () => {
            const getSizeEstimate = (obj: any): number => {
                const seen = new WeakSet();
                const calculateSize = (value: any): number => {
                    if (value === null || value === undefined) return 0;
                    if (typeof value !== 'object') return 8; // Approximate size for primitives
                    if (seen.has(value)) return 0; // Already counted
                    seen.add(value);

                    return Object.entries(value).reduce((size, [key, val]) => {
                        return size + key.length * 2 + calculateSize(val);
                    }, 16); // Base object size
                };
                return calculateSize(obj);
            };

            const sizes: number[] = [];
            const samples = 5;

            // Add increasingly large objects and track memory
            for (let i = 0; i < samples; i++) {
                const size = Math.pow(10, i);
                const data = Array.from({ length: size }, (_, j) => ({
                    id: j,
                    value: `value ${j}`
                }));

                mockQueryFn.mockResolvedValue(data);
                queryClient.fetchQuery({
                    queryFn: mockQueryFn,
                    queryKey: ['memory-test', i.toString()]
                });

                const totalSize = getSizeEstimate(queryClient.getQueue());
                sizes.push(totalSize);
                console.log(`Store size with ${size} items: ~${totalSize} bytes`);
            }

            // Verify memory growth is roughly linear
            for (let i = 1; i < sizes.length; i++) {
                const current = sizes[i];
                const previous = sizes[i-1];
                if (current === undefined || previous === undefined) continue;
                const ratio = current / previous;
                expect(ratio).toBeGreaterThan(5); // Should grow by roughly 10x each time
            }
        });
    });
});