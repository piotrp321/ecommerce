<?php

declare(strict_types=1);

namespace App\Tests\Support\Inventory;

use App\Inventory\Application\StockLevel;
use App\Inventory\Application\StockLevels;
use App\Inventory\Domain\ProductId;
use App\Inventory\Domain\StockItem;
use App\Inventory\Domain\StockItemRepository;

/**
 * Write and read side over the same in-memory data.
 */
final class InMemoryStockItemRepository implements StockItemRepository, StockLevels
{
    /** @var array<string, StockItem> */
    private array $items = [];

    public function find(ProductId $productId): ?StockItem
    {
        return $this->items[$productId->value] ?? null;
    }

    public function save(StockItem $stockItem): void
    {
        $this->items[$stockItem->productId()->value] = $stockItem;
    }

    public function forProducts(array $productIds): array
    {
        $levels = [];
        foreach ($productIds as $id) {
            if (isset($this->items[$id])) {
                $levels[$id] = new StockLevel($id, $this->items[$id]->onHand(), 0);
            }
        }

        return $levels;
    }
}
