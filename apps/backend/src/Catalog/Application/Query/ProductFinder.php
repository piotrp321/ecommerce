<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

/**
 * Port: read model of products.
 */
interface ProductFinder
{
    /**
     * @return Page<ProductRecord>
     */
    public function search(ProductCriteria $criteria): Page;

    public function byId(string $id): ?ProductRecord;

    public function activeBySlug(string $slug): ?ProductRecord;
}
