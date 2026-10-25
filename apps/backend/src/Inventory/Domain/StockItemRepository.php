<?php

declare(strict_types=1);

namespace App\Inventory\Domain;

interface StockItemRepository
{
    public function find(ProductId $productId): ?StockItem;

    /**
     * Persists the stock item immediately.
     *
     * @throws ConcurrentStockChange when another request created it in the meantime
     */
    public function save(StockItem $stockItem): void;
}
