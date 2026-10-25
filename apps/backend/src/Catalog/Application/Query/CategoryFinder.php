<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

/**
 * Port: read model of categories.
 */
interface CategoryFinder
{
    /**
     * @return list<CategoryRecord> ordered by name
     */
    public function all(): array;

    public function byId(string $id): ?CategoryRecord;

    public function bySlug(string $slug): ?CategoryRecord;
}
