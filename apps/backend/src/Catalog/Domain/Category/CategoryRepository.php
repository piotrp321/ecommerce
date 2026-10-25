<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Catalog\Domain\Slug;

interface CategoryRepository
{
    /**
     * @throws CategoryNotFound
     */
    public function get(CategoryId $id): Category;

    public function exists(CategoryId $id): bool;

    /**
     * Whether another category than $except already uses the slug.
     */
    public function slugExists(Slug $slug, ?CategoryId $except = null): bool;

    /**
     * Ancestors of the category, nearest (its parent) first, ending with the root.
     *
     * @return list<CategoryId>
     */
    public function ancestorIds(CategoryId $id): array;

    /**
     * Number of levels below the category: 0 for a category without subcategories.
     */
    public function subtreeHeight(CategoryId $id): int;

    public function hasChildren(CategoryId $id): bool;

    /**
     * Persists the category immediately.
     *
     * @throws DuplicateCategorySlug when the slug is taken (also by a concurrent request)
     * @throws CategoryCycle         when a concurrent move made the new parent a descendant
     * @throws CategoryTooDeep       when a concurrent change made the branch too deep
     */
    public function save(Category $category): void;

    /**
     * @throws CategoryNotEmpty when products or subcategories were added in the meantime
     */
    public function remove(Category $category): void;
}
