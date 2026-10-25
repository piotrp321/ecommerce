<?php

declare(strict_types=1);

namespace App\Tests\Functional\Inventory\Infrastructure\Http;

use App\Tests\Support\ApiTestCase;

final class AdminStockApiTest extends ApiTestCase
{
    public function testSetsTheStockAndPublishesAvailability(): void
    {
        $id = $this->createProduct();

        self::assertSame(['productId' => $id, 'onHand' => 0, 'reserved' => 0, 'available' => 0], $this->admin('GET', '/admin/inventory/stock/'.$id));
        self::assertFalse($this->request('GET', '/catalog/products/green-tea')['inStock']);

        self::assertSame(
            ['productId' => $id, 'onHand' => 4, 'reserved' => 0, 'available' => 4],
            $this->admin('PUT', '/admin/inventory/stock/'.$id, ['onHand' => 4]),
        );
        self::assertTrue($this->request('GET', '/catalog/products/green-tea')['inStock']);
        self::assertSame(['onHand' => 4, 'reserved' => 0, 'available' => 4], $this->admin('GET', '/admin/catalog/products/'.$id)['stock']);

        $this->admin('PUT', '/admin/inventory/stock/'.$id, ['onHand' => 0]);
        self::assertFalse($this->request('GET', '/catalog/products/green-tea')['inStock']);
    }

    public function testRejectsInvalidQuantities(): void
    {
        $id = $this->createProduct();

        $this->admin('PUT', '/admin/inventory/stock/'.$id, ['onHand' => -1]);
        $this->assertProblem(422);
        $this->admin('PUT', '/admin/inventory/stock/'.$id, ['onHand' => '5']);
        $this->assertProblem(422);
        $this->admin('PUT', '/admin/inventory/stock/'.$id, []);
        $this->assertProblem(422);
    }

    public function testUnknownProductsHaveNoStock(): void
    {
        $missing = '/admin/inventory/stock/0192f0c4-7c2a-7c51-9b1e-000000000000';

        $this->admin('GET', $missing);
        $this->assertProblem(404);
        $this->admin('PUT', $missing, ['onHand' => 1]);
        $this->assertProblem(404);
    }
}
