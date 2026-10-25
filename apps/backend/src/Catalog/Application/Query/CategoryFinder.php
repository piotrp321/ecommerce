<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

/**
 * Port: read model of the category tree.
 */
interface CategoryFinder
{
    /**
     * All categories (the whole tree), ordered by name.
     *
     * @return list<CategoryRecord>
     */
    public function all(): array;

    /**
     * The category and all its descendants, ordered by name.
     *
     * @return list<CategoryRecord>
     */
    public function subtree(string $id): array;

    /**
     * Ancestors of the category, from the root down to its parent.
     *
     * @return list<CategoryRecord>
     */
    public function ancestors(string $id): array;

    public function byId(string $id): ?CategoryRecord;

    public function bySlug(string $slug): ?CategoryRecord;
}
