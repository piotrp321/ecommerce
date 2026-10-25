<?php

declare(strict_types=1);

namespace App\Inventory\Application;

/**
 * Port: tells whether a product exists. Inventory does not own products; the
 * adapter is provided by the module that does (Catalog).
 */
interface KnownProducts
{
    public function exists(string $productId): bool;
}
