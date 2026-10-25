<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

use App\Shared\Domain\Pricing\Money;

/**
 * A product as presented by the API: stored data, the calculated gross price
 * and the current availability.
 */
final readonly class ProductView
{
    public function __construct(
        public ProductRecord $product,
        public Money $grossPrice,
        public Availability $availability,
    ) {
    }
}
