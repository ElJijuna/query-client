import {
  QueryClient,
  QueryItem,
  DEFAULT_STALE_TIME,
  DEFAULT_RETRY,
  DEFAULT_GC_TIME,
  QueryClientBaseResponse,
  QueryClientSuccessResponse,
  QueryClientErrorResponse,
  QueryClientSuccessFromCacheResponse,
} from './index';

describe('index exports', () => {
  it('should export QueryClient class', () => {
    expect(QueryClient).toBeDefined();
    expect(typeof QueryClient).toBe('function');
  });

  it('should export QueryItem class', () => {
    expect(QueryItem).toBeDefined();
    expect(typeof QueryItem).toBe('function');
  });

  it('should export default constants with correct values', () => {
    expect(DEFAULT_STALE_TIME).toBe(60000);
    expect(DEFAULT_RETRY).toBe(3);
    expect(DEFAULT_GC_TIME).toBe(300000);
  });

  it('should export response base class', () => {
    expect(QueryClientBaseResponse).toBeDefined();
    expect(typeof QueryClientBaseResponse).toBe('function');
  });

  it('should export QueryClientSuccessResponse', () => {
    expect(QueryClientSuccessResponse).toBeDefined();
    expect(typeof QueryClientSuccessResponse).toBe('function');
  });

  it('should export QueryClientErrorResponse', () => {
    expect(QueryClientErrorResponse).toBeDefined();
    expect(typeof QueryClientErrorResponse).toBe('function');
  });

  it('should export QueryClientSuccessFromCacheResponse', () => {
    expect(QueryClientSuccessFromCacheResponse).toBeDefined();
    expect(typeof QueryClientSuccessFromCacheResponse).toBe('function');
  });
});
