<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

final readonly class CategoryRecord
{
    public function __construct(
        public string $id,
        public string $slug,
        public string $name,
        public ?string $parentId,
        /** Products directly in the category, active or not. */
        public int $productCount,
    ) {
    }
}
