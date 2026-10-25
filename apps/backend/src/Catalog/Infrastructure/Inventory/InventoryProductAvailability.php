<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Inventory;

use App\Catalog\Application\Query\Availability;
use App\Catalog\Application\Query\ProductAvailability;
use App\Inventory\Application\StockLevel;
use App\Inventory\Application\StockLevels;

/**
 * Adapter: Catalog's availability port backed by the Inventory query API.
 */
final readonly class InventoryProductAvailability implements ProductAvailability
{
    public function __construct(private StockLevels $stockLevels)
    {
    }

    public function forProducts(array $productIds): array
    {
        return array_map(
            static fn (StockLevel $level): Availability => new Availability($level->onHand, $level->reserved, $level->available()),
            $this->stockLevels->forProducts($productIds),
        );
    }
}
