<?php

declare(strict_types=1);

namespace App\Tests\Integration\Inventory\Infrastructure;

use App\Inventory\Application\StockLevels;
use App\Inventory\Domain\ProductId;
use App\Inventory\Domain\StockItem;
use App\Inventory\Domain\StockItemRepository;
use App\Tests\Support\DatabaseTestCase;

final class StockPersistenceTest extends DatabaseTestCase
{
    public function testStoresStockItemsAndReadsLevelsInOneBatch(): void
    {
        $repository = self::service(StockItemRepository::class);
        $first = ProductId::generate();
        $second = ProductId::generate();
        $repository->save(StockItem::create($first, 5, new \DateTimeImmutable()));
        $repository->save(StockItem::create($second, 0, new \DateTimeImmutable()));
        self::entityManager()->clear();

        $item = $repository->find($first);
        self::assertNotNull($item);
        $item->setOnHand(7, new \DateTimeImmutable());
        $repository->save($item);

        $levels = self::service(StockLevels::class)->forProducts([$first->value, $second->value, ProductId::generate()->value, 'not-a-uuid']);

        self::assertSame([$first->value, $second->value], array_keys($levels));
        self::assertSame(7, $levels[$first->value]->onHand);
        self::assertSame(0, $levels[$first->value]->reserved);
        self::assertSame(7, $levels[$first->value]->available());
        self::assertSame(0, $levels[$second->value]->available());
        self::assertSame([], self::service(StockLevels::class)->forProducts([]));
    }
}
