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
     * Persists the category immediately.
     *
     * @throws DuplicateCategorySlug when the slug is taken (also by a concurrent request)
     */
    public function save(Category $category): void;

    /**
     * @throws CategoryNotEmpty when products were assigned to it in the meantime
     */
    public function remove(Category $category): void;
}
