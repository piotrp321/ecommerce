<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Storefront;

use App\Catalog\Application\Query\ProductCriteria;
use App\Catalog\Application\Query\ProductSort;
use App\Catalog\Application\Query\ProductStatusFilter;
use App\Catalog\Domain\Slug;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class ProductListQuery
{
    public function __construct(
        #[Assert\Regex('/^'.Slug::PATTERN.'$/D')]
        #[Assert\Length(max: Slug::MAX_LENGTH)]
        public ?string $category = null,
        #[Assert\Range(min: 1, max: ProductCriteria::MAX_PAGE)]
        public int $page = 1,
        #[Assert\Range(min: 1, max: ProductCriteria::MAX_PER_PAGE)]
        public int $perPage = 20,
        #[Assert\Choice(callback: [self::class, 'sortOptions'])]
        public string $sort = 'name',
    ) {
    }

    /**
     * @return list<string>
     */
    public static function sortOptions(): array
    {
        return array_map(static fn (ProductSort $sort): string => $sort->value, ProductSort::cases());
    }

    public function criteria(): ProductCriteria
    {
        return new ProductCriteria(
            status: ProductStatusFilter::Active,
            categorySlug: $this->category,
            sort: ProductSort::from($this->sort),
            page: $this->page,
            perPage: $this->perPage,
        );
    }
}
