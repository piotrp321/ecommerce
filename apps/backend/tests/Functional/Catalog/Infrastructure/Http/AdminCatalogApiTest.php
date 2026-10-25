<?php

declare(strict_types=1);

namespace App\Tests\Functional\Catalog\Infrastructure\Http;

use App\Tests\Support\ApiTestCase;

final class AdminCatalogApiTest extends ApiTestCase
{
    public function testCreatesAnInactiveProduct(): void
    {
        $category = $this->createCategory('tea', 'Tea');

        $product = $this->admin('POST', '/admin/catalog/products', [
            'sku' => 'TEA-001',
            'slug' => 'green-tea',
            'name' => 'Green tea',
            'description' => null,
            'netPrice' => '8.13',
            'vatRate' => 23,
            'categoryId' => $category,
        ]);

        $this->assertStatus(201);
        self::assertIsString($product['id']);
        self::assertSame('products/'.$product['id'], $this->client->getResponse()->headers->get('Location'));
        self::assertSame([
            'id' => $product['id'],
            'sku' => 'TEA-001',
            'slug' => 'green-tea',
            'name' => 'Green tea',
            'description' => null,
            'price' => [
                'net' => ['amount' => '8.13', 'currency' => 'PLN'],
                'vatRate' => 23,
                'gross' => ['amount' => '10.00', 'currency' => 'PLN'],
            ],
            'category' => ['id' => $category, 'slug' => 'tea', 'name' => 'Tea'],
            'active' => false,
            'stock' => ['onHand' => 0, 'reserved' => 0, 'available' => 0],
        ], array_diff_key($product, ['createdAt' => true, 'updatedAt' => true]));
        self::assertIsString($product['createdAt'] ?? null);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/', $product['createdAt']);
        self::assertSame($product, $this->admin('GET', '/admin/catalog/products/'.$product['id']));
    }

    public function testRejectsInvalidProductData(): void
    {
        $this->admin('POST', '/admin/catalog/products', [
            'sku' => 'tea 1',
            'slug' => 'Green Tea',
            'name' => ' ',
            'netPrice' => '10',
            'vatRate' => 7,
            'categoryId' => 'nope',
        ]);

        $this->assertProblem(422);
        $violations = $this->responseJson()['violations'] ?? null;
        self::assertIsArray($violations);
        self::assertEqualsCanonicalizing(
            ['sku', 'slug', 'name', 'netPrice', 'vatRate', 'categoryId'],
            array_map(static fn (mixed $v): mixed => \is_array($v) ? $v['propertyPath'] : null, $violations),
        );
    }

    public function testRejectsMissingFieldsAndWrongTypes(): void
    {
        $this->admin('POST', '/admin/catalog/products', ['sku' => 'TEA-001', 'vatRate' => '23']);

        $this->assertProblem(422);
    }

    public function testRejectsAZeroPrice(): void
    {
        $this->createProductRequest(['netPrice' => '0.00']);

        $this->assertProblem(422, 'net price');
    }

    public function testRejectsAnUnknownCategory(): void
    {
        $this->createProductRequest(['categoryId' => '0192f0c4-7c2a-7c51-9b1e-000000000000']);

        $this->assertProblem(422, 'does not exist');
    }

    public function testRejectsDuplicateSkuAndSlug(): void
    {
        $this->createProduct();

        $this->createProductRequest(['slug' => 'other']);
        $this->assertProblem(409, 'SKU "TEA-001"');

        $this->createProductRequest(['sku' => 'TEA-002']);
        $this->assertProblem(409, 'slug "green-tea"');
    }

    public function testUpdatesAProductButNotItsSku(): void
    {
        $id = $this->createProduct();

        $product = $this->admin('PUT', '/admin/catalog/products/'.$id, [
            'slug' => 'green-tea-xl',
            'name' => 'Green tea XL',
            'netPrice' => '10.00',
            'vatRate' => 8,
        ]);

        $this->assertStatus(200);
        self::assertSame('green-tea-xl', $product['slug']);
        self::assertSame('TEA-001', $product['sku']);
        self::assertNull($product['description']);
        self::assertTrue($product['active']);
        self::assertSame(
            ['net' => ['amount' => '10.00', 'currency' => 'PLN'], 'vatRate' => 8, 'gross' => ['amount' => '10.80', 'currency' => 'PLN']],
            $product['price'],
        );

        $this->admin('PUT', '/admin/catalog/products/'.$id, [
            'sku' => 'TEA-999',
            'slug' => 'green-tea-xl',
            'name' => 'Green tea XL',
            'netPrice' => '10.00',
            'vatRate' => 8,
        ]);
        $this->assertProblem(422);
    }

    public function testRejectsAnUpdateToATakenSlug(): void
    {
        $id = $this->createProduct();
        $this->createProduct(['sku' => 'TEA-002', 'slug' => 'black-tea']);

        $this->admin('PUT', '/admin/catalog/products/'.$id, ['slug' => 'black-tea', 'name' => 'Tea', 'netPrice' => '1.00', 'vatRate' => 23]);

        $this->assertProblem(409);
    }

    public function testUnknownProductsAreNotFound(): void
    {
        $missing = '/admin/catalog/products/0192f0c4-7c2a-7c51-9b1e-000000000000';

        $this->admin('GET', $missing);
        $this->assertProblem(404);
        $this->admin('PUT', $missing, ['slug' => 'tea', 'name' => 'Tea', 'netPrice' => '1.00', 'vatRate' => 23]);
        $this->assertProblem(404);
        $this->admin('POST', $missing.'/activate');
        $this->assertProblem(404);
        $this->admin('GET', '/admin/catalog/products/not-a-uuid');
        $this->assertStatus(404);
    }

    public function testActivationControlsPublicVisibility(): void
    {
        $id = $this->createProduct(active: false);
        $this->request('GET', '/catalog/products/green-tea');
        $this->assertStatus(404);

        self::assertTrue($this->admin('POST', '/admin/catalog/products/'.$id.'/activate')['active']);
        self::assertTrue($this->admin('POST', '/admin/catalog/products/'.$id.'/activate')['active']);
        $this->request('GET', '/catalog/products/green-tea');
        $this->assertStatus(200);

        self::assertFalse($this->admin('POST', '/admin/catalog/products/'.$id.'/deactivate')['active']);
        $this->request('GET', '/catalog/products/green-tea');
        $this->assertStatus(404);
    }

    public function testListsAllProductsWithFilters(): void
    {
        $tea = $this->createCategory('tea', 'Tea');
        $this->createProduct(['sku' => 'TEA-001', 'slug' => 'green-tea', 'name' => 'Green tea', 'categoryId' => $tea]);
        $this->createProduct(['sku' => 'TEA-002', 'slug' => 'black-tea', 'name' => 'Black tea'], active: false);

        self::assertSame(['TEA-002', 'TEA-001'], $this->skus('/admin/catalog/products'));
        self::assertSame(['TEA-002'], $this->skus('/admin/catalog/products?status=inactive'));
        self::assertSame(['TEA-001'], $this->skus('/admin/catalog/products?category='.$tea));
        self::assertSame(['TEA-002'], $this->skus('/admin/catalog/products?q=black'));

        $this->admin('GET', '/admin/catalog/products?status=deleted');
        $this->assertProblem(422);
    }

    public function testManagesCategories(): void
    {
        $id = $this->createCategory('tea', 'Tea');
        self::assertSame('categories/'.$id, $this->client->getResponse()->headers->get('Location'));

        self::assertSame(
            ['id' => $id, 'slug' => 'teas', 'name' => 'Teas', 'productCount' => 0],
            $this->admin('PUT', '/admin/catalog/categories/'.$id, ['slug' => 'teas', 'name' => 'Teas']),
        );
        $this->createProduct(['categoryId' => $id], active: false);
        self::assertSame(['items' => [['id' => $id, 'slug' => 'teas', 'name' => 'Teas', 'productCount' => 1]]], $this->admin('GET', '/admin/catalog/categories'));
        self::assertSame(1, $this->admin('GET', '/admin/catalog/categories/'.$id)['productCount']);
    }

    public function testRejectsInvalidAndDuplicateCategories(): void
    {
        $this->createCategory('tea', 'Tea');

        $this->admin('POST', '/admin/catalog/categories', ['slug' => 'tea', 'name' => 'Tea']);
        $this->assertProblem(409);

        $this->admin('POST', '/admin/catalog/categories', ['slug' => 'Tea!', 'name' => '']);
        $this->assertProblem(422);
    }

    public function testDeletesOnlyEmptyCategories(): void
    {
        $tea = $this->createCategory('tea', 'Tea');
        $coffee = $this->createCategory('coffee', 'Coffee');
        $this->createProduct(['categoryId' => $tea]);

        $this->admin('DELETE', '/admin/catalog/categories/'.$tea);
        $this->assertProblem(409, 'still has products');

        $this->admin('DELETE', '/admin/catalog/categories/'.$coffee);
        $this->assertStatus(204);
        self::assertSame('', $this->client->getResponse()->getContent());

        $this->admin('GET', '/admin/catalog/categories/'.$coffee);
        $this->assertProblem(404);
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function createProductRequest(array $overrides): void
    {
        $this->admin('POST', '/admin/catalog/products', $overrides + [
            'sku' => 'TEA-001',
            'slug' => 'green-tea',
            'name' => 'Green tea',
            'netPrice' => '8.13',
            'vatRate' => 23,
        ]);
    }

    /**
     * @return list<mixed>
     */
    private function skus(string $uri): array
    {
        $list = $this->admin('GET', $uri);
        $this->assertStatus(200);
        \assert(\is_array($list['items']));

        return array_map(static fn (mixed $item): mixed => \is_array($item) ? $item['sku'] : null, array_values($list['items']));
    }
}
