import { ApiError } from '../api/errors';
import { createDemoApi } from './createDemoApi';
import { demoId } from './fixtures';

const laptops = demoId('c', 2);
const electronics = demoId('c', 1);

function api() {
  return createDemoApi({ latencyMs: 0 });
}

async function problem(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
  }
  throw new Error('Expected an ApiError.');
}

describe('demo adapter', () => {
  it('filters by category subtree, searches and paginates', async () => {
    const page = await api().listProducts({ categoryId: electronics, q: 'laptop', perPage: 2, sort: 'name' });

    expect(page.totalItems).toBe(4);
    expect(page.totalPages).toBe(2);
    expect(page.items.map((p) => p.name)).toEqual(['Laptop Air 13 M3', 'Laptop gamingowy Predator 17']);
  });

  it('sorts by net price exactly', async () => {
    const page = await api().listProducts({ sort: '-price', perPage: 1 });

    expect(page.items[0]?.price.net.amount).toBe('7316.26');
  });

  it('rejects a duplicate SKU with a conflict', async () => {
    const error = await problem(
      api().createProduct({ sku: 'LAP-ZEN-14', slug: 'new', name: 'New', description: null, netPrice: '1.00', vatRate: 23, categoryId: null }),
    );

    expect(error.status).toBe(409);
  });

  it('creates products inactive, without a gross price it would have to calculate', async () => {
    const created = await api().createProduct({
      sku: 'NEW-1',
      slug: 'new-1',
      name: 'New',
      description: '  ',
      netPrice: '10.00',
      vatRate: 23,
      categoryId: laptops,
    });

    expect(created.active).toBe(false);
    expect(created.description).toBeNull();
    expect(created.price.gross).toBeNull();
    expect(created.category?.name).toBe('Laptopy');
  });

  it('rejects moving a category into its own subtree', async () => {
    const error = await problem(api().moveCategory(electronics, laptops));

    expect(error.status).toBe(409);
    expect(error.detail).toMatch(/cykl/);
  });

  it('rejects deleting a category with products', async () => {
    const error = await problem(api().deleteCategory(laptops));

    expect(error.status).toBe(409);
  });

  it('limits the tree depth', async () => {
    const demo = api();
    let parentId: string | null = null;
    for (let level = 1; level <= 10; level += 1) {
      parentId = (await demo.createCategory({ name: `L${String(level)}`, slug: `l-${String(level)}`, parentId })).id;
    }

    expect((await problem(demo.createCategory({ name: 'L11', slug: 'l-11', parentId }))).status).toBe(409);
  });

  it('validates the stock quantity', async () => {
    const error = await problem(api().setStock(demoId('a', 1), -1));

    expect(error.violations).toEqual([{ propertyPath: 'onHand', title: expect.any(String) as string }]);
  });
});
