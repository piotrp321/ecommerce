<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Query\ProductCriteria;
use App\Catalog\Application\Query\ProductSort;
use App\Catalog\Application\Query\ProductStatusFilter;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class ProductListQuery
{
    public function __construct(
        #[Assert\Choice(choices: ['all', 'active', 'inactive'])]
        public string $status = 'all',
        #[Assert\Uuid]
        public ?string $category = null,
        #[Assert\Length(min: 1, max: 100)]
        public ?string $q = null,
        #[Assert\Range(min: 1, max: ProductCriteria::MAX_PAGE)]
        public int $page = 1,
        #[Assert\Range(min: 1, max: ProductCriteria::MAX_PER_PAGE)]
        public int $perPage = 20,
    ) {
    }

    public function criteria(): ProductCriteria
    {
        return new ProductCriteria(
            status: ProductStatusFilter::from($this->status),
            categoryId: $this->category,
            search: $this->q,
            sort: ProductSort::Newest,
            page: $this->page,
            perPage: $this->perPage,
        );
    }
}
