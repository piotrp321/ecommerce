<?php

declare(strict_types=1);

namespace App\Inventory\Application;

/**
 * Read model of stock levels; the query API of the Inventory module for other modules.
 */
interface StockLevels
{
    /**
     * Looks up many products in one query.
     *
     * @param list<string> $productIds
     *
     * @return array<string, StockLevel> by product id; products without a stock item are missing
     */
    public function forProducts(array $productIds): array;
}
