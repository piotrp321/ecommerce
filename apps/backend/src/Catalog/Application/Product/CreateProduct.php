<?php

declare(strict_types=1);

namespace App\Catalog\Application\Product;

final readonly class CreateProduct
{
    public function __construct(
        public string $sku,
        public string $slug,
        public string $name,
        public ?string $description,
        public string $netPrice,
        public int $vatRate,
        public ?string $categoryId,
    ) {
    }
}
