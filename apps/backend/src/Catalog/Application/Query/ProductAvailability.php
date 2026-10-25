<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

/**
 * Port: stock levels of products, owned by another module (Inventory).
 */
interface ProductAvailability
{
    /**
     * Looks up many products at once (one query for a whole page, no N+1).
     *
     * @param list<string> $productIds
     *
     * @return array<string, Availability> by product id; products without stock are missing
     */
    public function forProducts(array $productIds): array;
}
