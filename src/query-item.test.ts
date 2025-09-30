import { QueryItem } from "./query-item";

describe('QueryItem', () => {
  it('Should instance QueryItem', () => {
    const queryFn = jest.fn();
    const queryItem = new QueryItem('fetched data', queryFn);

    expect(queryItem).toBeInstanceOf(QueryItem);
  });

  it('Should execute updateDate', () => {
    const queryFn = jest.fn();
    const queryItem = new QueryItem<string>('fetched data', queryFn);

    expect(queryItem.data).toBe('fetched data');
    expect(queryItem.dataUpdatedAt).toBeUndefined();
    
    queryItem.updateData('fetched data 2');
    expect(queryItem.data).toBe('fetched data 2');
    expect(queryItem.dataUpdatedAt).toBeDefined();
  });

  it('Should execute updateError', () => {
    const queryFn = jest.fn();
    const queryItem = new QueryItem('fetched data', queryFn);

    queryItem.updateError();
    expect(queryItem.errorUpdateCount).toBe(1);

    queryItem.updateError();
    expect(queryItem.errorUpdateCount).toBe(2);
  });

    it('Should execute invalidate', () => {
    const queryFn = jest.fn();
    const queryItem = new QueryItem('fetched data', queryFn);
      
    expect(queryItem.isInvalidated).toBe(false);

    queryItem.invalidate();
    expect(queryItem.data).toBeUndefined();
    expect(queryItem.isInvalidated).toBe(true);
  });
});