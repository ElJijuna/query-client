export interface QueryClientConfig {
}

export interface QueryConfig extends QueryClientConfig {
    queryKey: string[];
    queryFn: (config?: { signal: AbortSignal }) => Promise<unknown>;
}

export class QueryClient {
    private queries = new Map();
    private config: QueryClientConfig;

    constructor(config: QueryClientConfig) {
        this.config = config ?? { };
    }

    async setQueryData() {

    }

    async getQueryData() {

    }

    async refetchQueries() {

    }

    async removeQueries() {

    }

    async invalidateQueryData({ queryKey }: { queryKey: string[] }) {

    }

    async ensureQueryData({ queryFn, queryKey }: QueryConfig) {

    }

    async fetchQuery({ queryFn, queryKey }: QueryConfig) {
        const key = QueryClient.getQueryKey(queryKey);
        const { signal } = new AbortController();

        if (this.queries.has(key)) {
            return { ...this.queries.get(key), isCached: true };
        }

        try {
            const data = await queryFn({ signal });
            this.queries.set(key, {
                data, isSuccess: true, isError: false, isCached: false,
            });

            return this.queries.get(key);
        } catch (error) {
            return {
                isCached: false,
                isSuccess: false,
                isError: true,
                error,
            };
        }
    }

    static getQueryKey = (queryKey: string[]) => {
        return queryKey.join(':');
    }
}