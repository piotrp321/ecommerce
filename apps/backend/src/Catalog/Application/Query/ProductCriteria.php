<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

final readonly class ProductCriteria
{
    public const int MAX_PER_PAGE = 100;

    public function __construct(
        public ProductStatusFilter $status = ProductStatusFilter::All,
        public ?string $categorySlug = null,
        public ?string $categoryId = null,
        /** Case-insensitive substring of the name or SKU. */
        public ?string $search = null,
        public ProductSort $sort = ProductSort::Name,
        public int $page = 1,
        public int $perPage = 20,
    ) {
        if ($page < 1 || $perPage < 1 || $perPage > self::MAX_PER_PAGE) {
            throw new \InvalidArgumentException('Invalid pagination.');
        }
    }

    public function offset(): int
    {
        return ($this->page - 1) * $this->perPage;
    }
}
