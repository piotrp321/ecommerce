<?php

declare(strict_types=1);

namespace App\Tests\Functional\Catalog\Infrastructure\Http;

use App\Tests\Support\ApiTestCase;
use PHPUnit\Framework\Attributes\TestWith;

final class StorefrontApiTest extends ApiTestCase
{
    public function testListsActiveProductsWithGrossPricesAndAvailability(): void
    {
        $category = $this->createCategory('tea', 'Tea');
        $id = $this->createProduct(['categoryId' => $category], onHand: 3);
        $this->createProduct(['sku' => 'TEA-002', 'slug' => 'black-tea', 'name' => 'Black tea', 'netPrice' => '2.50']);
        $this->createProduct(['sku' => 'TEA-003', 'slug' => 'white-tea', 'name' => 'White tea'], active: false);

        $list = $this->request('GET', '/catalog/products');

        $this->assertStatus(200);
        self::assertSame(['page' => 1, 'perPage' => 20, 'totalItems' => 2, 'totalPages' => 1], array_diff_key($list, ['items' => true]));
        self::assertSame([
            [
                'id' => $this->productIdBySku($list, 'TEA-002'),
                'sku' => 'TEA-002',
                'slug' => 'black-tea',
                'name' => 'Black tea',
                'description' => 'Loose leaf',
                'price' => ['gross' => ['amount' => '3.08', 'currency' => 'PLN'], 'vatRate' => 23],
                'category' => null,
                'inStock' => false,
            ],
            [
                'id' => $id,
                'sku' => 'TEA-001',
                'slug' => 'green-tea',
                'name' => 'Green tea',
                'description' => 'Loose leaf',
                'price' => ['gross' => ['amount' => '10.00', 'currency' => 'PLN'], 'vatRate' => 23],
                'category' => ['id' => $category, 'slug' => 'tea', 'name' => 'Tea'],
                'inStock' => true,
            ],
        ], $list['items']);
    }

    public function testFiltersSortsAndPaginates(): void
    {
        $tea = $this->createCategory('tea', 'Tea');
        $this->createProduct(['sku' => 'A', 'slug' => 'a', 'name' => 'A', 'netPrice' => '30.00', 'categoryId' => $tea]);
        $this->createProduct(['sku' => 'B', 'slug' => 'b', 'name' => 'B', 'netPrice' => '10.00', 'categoryId' => $tea]);
        $this->createProduct(['sku' => 'C', 'slug' => 'c', 'name' => 'C', 'netPrice' => '20.00']);

        self::assertSame(['B', 'C', 'A'], $this->skus('/catalog/products?sort=price'));
        self::assertSame(['A', 'C', 'B'], $this->skus('/catalog/products?sort=-price'));
        self::assertSame(['A', 'B'], $this->skus('/catalog/products?category=tea'));
        self::assertSame([], $this->skus('/catalog/products?category=coffee'));
        self::assertSame(['C'], $this->skus('/catalog/products?page=2&perPage=2'));
        self::assertSame(2, $this->responseJson()['totalPages']);
    }

    #[TestWith(['page=0'])]
    #[TestWith(['page=abc'])]
    #[TestWith(['page=100000000000000000&perPage=100'])]
    #[TestWith(['perPage=101'])]
    #[TestWith(['sort=random'])]
    #[TestWith(['category=Not%20a%20slug'])]
    public function testRejectsInvalidQueryParameters(string $query): void
    {
        $this->request('GET', '/catalog/products?'.$query);

        $this->assertProblem(422);
    }

    public function testShowsAnActiveProductBySlug(): void
    {
        $id = $this->createProduct(onHand: 1);

        $product = $this->request('GET', '/catalog/products/green-tea');

        $this->assertStatus(200);
        self::assertSame($id, $product['id']);
        self::assertTrue($product['inStock']);
        // Administrative data is not public.
        self::assertArrayNotHasKey('active', $product);
        self::assertArrayNotHasKey('stock', $product);
        self::assertIsArray($product['price']);
        self::assertArrayNotHasKey('net', $product['price']);
    }

    public function testAnInactiveProductIsNotFound(): void
    {
        $id = $this->createProduct();
        $this->admin('POST', '/admin/catalog/products/'.$id.'/deactivate');

        $this->request('GET', '/catalog/products/green-tea');

        $this->assertProblem(404, 'green-tea');
    }

    public function testAnUnknownProductIsNotFound(): void
    {
        $this->request('GET', '/catalog/products/missing');

        $this->assertProblem(404);
    }

    public function testShowsTheCategoryTreeAndSubtrees(): void
    {
        $electronics = $this->createCategory('electronics', 'Electronics');
        $phones = $this->createCategory('phones', 'Phones', $electronics);
        $smartphones = $this->createCategory('smartphones', 'Smartphones', $phones);
        $books = $this->createCategory('books', 'Books');

        self::assertSame(['items' => [
            ['id' => $books, 'slug' => 'books', 'name' => 'Books', 'children' => []],
            ['id' => $electronics, 'slug' => 'electronics', 'name' => 'Electronics', 'children' => [
                ['id' => $phones, 'slug' => 'phones', 'name' => 'Phones', 'children' => [
                    ['id' => $smartphones, 'slug' => 'smartphones', 'name' => 'Smartphones', 'children' => []],
                ]],
            ]],
        ]], $this->request('GET', '/catalog/categories'));

        self::assertSame([
            'id' => $phones,
            'slug' => 'phones',
            'name' => 'Phones',
            'ancestors' => [['id' => $electronics, 'slug' => 'electronics', 'name' => 'Electronics']],
            'children' => [['id' => $smartphones, 'slug' => 'smartphones', 'name' => 'Smartphones', 'children' => []]],
        ], $this->request('GET', '/catalog/categories/phones'));

        $this->request('GET', '/catalog/categories/missing');
        $this->assertProblem(404);
    }

    public function testACategoryListsProductsOfItsSubcategories(): void
    {
        $electronics = $this->createCategory('electronics', 'Electronics');
        $phones = $this->createCategory('phones', 'Phones', $electronics);
        $smartphones = $this->createCategory('smartphones', 'Smartphones', $phones);
        $this->createProduct(['sku' => 'TV', 'slug' => 'tv', 'name' => 'TV', 'categoryId' => $electronics]);
        $this->createProduct(['sku' => 'PIXEL', 'slug' => 'pixel', 'name' => 'Pixel', 'categoryId' => $smartphones]);
        $this->createProduct(['sku' => 'BOOK', 'slug' => 'book', 'name' => 'Book']);

        self::assertSame(['PIXEL', 'TV'], $this->skus('/catalog/products?category=electronics'));
        self::assertSame(['PIXEL'], $this->skus('/catalog/products?category=phones'));
    }

    public function testThePublicApiDoesNotDiscloseStockQuantities(): void
    {
        $category = $this->createCategory('tea', 'Tea');
        $this->createProduct(['categoryId' => $category], onHand: 7);

        foreach (['/catalog/products', '/catalog/products/green-tea', '/catalog/categories', '/catalog/categories/tea'] as $uri) {
            $this->request('GET', $uri);
            $this->assertStatus(200);
            $json = (string) $this->client->getResponse()->getContent();
            foreach (['onHand', 'reserved', 'available', 'stock', 'productCount', '"active"'] as $field) {
                self::assertStringNotContainsString($field, $json, \sprintf('%s discloses "%s".', $uri, $field));
            }
        }
        self::assertTrue($this->request('GET', '/catalog/products/green-tea')['inStock']);
    }

    /**
     * @return list<mixed>
     */
    private function skus(string $uri): array
    {
        $list = $this->request('GET', $uri);
        $this->assertStatus(200);
        \assert(\is_array($list['items']));

        return array_map(static fn (mixed $item): mixed => \is_array($item) ? $item['sku'] : null, array_values($list['items']));
    }

    /**
     * @param array<mixed> $list
     */
    private function productIdBySku(array $list, string $sku): mixed
    {
        \assert(\is_array($list['items']));
        foreach ($list['items'] as $item) {
            if (\is_array($item) && $sku === $item['sku']) {
                return $item['id'];
            }
        }

        return null;
    }
}
