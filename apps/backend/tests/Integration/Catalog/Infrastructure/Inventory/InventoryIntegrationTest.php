<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Inventory;

use App\Catalog\Application\Query\ProductCriteria;
use App\Catalog\Application\Query\ProductQueries;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Product\ProductRepository;
use App\Inventory\Application\StockHandler;
use App\Inventory\Domain\UnknownProduct;
use App\Tests\Support\Catalog\CatalogFixtures;
use App\Tests\Support\DatabaseTestCase;

/**
 * Catalog and Inventory wired together through their ports.
 */
final class InventoryIntegrationTest extends DatabaseTestCase
{
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fixtures = new CatalogFixtures(self::service(ProductRepository::class), self::service(CategoryRepository::class));
    }

    public function testStockCanOnlyBeSetForCatalogProducts(): void
    {
        $product = $this->fixtures->product('TEA-001');
        $stock = self::service(StockHandler::class);

        self::assertSame(3, $stock->setOnHand($product->id()->value, 3)->onHand);

        $this->expectException(UnknownProduct::class);
        $stock->setOnHand('0192f0c4-7c2a-7c51-9b1e-000000000000', 3);
    }

    public function testAProductPageNeedsAFixedNumberOfQueries(): void
    {
        $stock = self::service(StockHandler::class);
        foreach (range(1, 15) as $i) {
            $product = $this->fixtures->product(\sprintf('P-%02d', $i));
            $stock->setOnHand($product->id()->value, $i % 3);
        }
        $queries = self::getContainer()->get('doctrine.debug_data_holder');
        $queries->reset();

        $page = self::service(ProductQueries::class)->search(new ProductCriteria(perPage: 10));

        self::assertCount(10, $page->items);
        self::assertSame(15, $page->totalItems);
        self::assertSame(1, $page->items[0]->availability->onHand);
        self::assertFalse($page->items[2]->availability->isInStock());
        // Count, page and one stock lookup for the whole page.
        self::assertCount(3, $queries->getData()['default'] ?? []);
    }
}
