<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;

/**
 * Product data as stored, read without loading the aggregate.
 */
final readonly class ProductRecord
{
    public function __construct(
        public string $id,
        public string $sku,
        public string $slug,
        public string $name,
        public ?string $description,
        public Money $netPrice,
        public VatRate $vatRate,
        public ?CategoryRef $category,
        public bool $active,
        public \DateTimeImmutable $createdAt,
        public \DateTimeImmutable $updatedAt,
    ) {
    }
}
