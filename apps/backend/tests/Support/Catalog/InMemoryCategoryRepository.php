<?php

declare(strict_types=1);

namespace App\Tests\Support\Catalog;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotFound;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Slug;

final class InMemoryCategoryRepository implements CategoryRepository
{
    /** @var array<string, Category> */
    private array $categories = [];

    public function get(CategoryId $id): Category
    {
        return $this->categories[$id->value] ?? throw CategoryNotFound::withId($id);
    }

    public function exists(CategoryId $id): bool
    {
        return isset($this->categories[$id->value]);
    }

    public function slugExists(Slug $slug, ?CategoryId $except = null): bool
    {
        return [] !== array_filter(
            $this->categories,
            static fn (Category $c): bool => $c->slug()->equals($slug) && !(null !== $except && $c->id()->equals($except)),
        );
    }

    public function ancestorIds(CategoryId $id): array
    {
        $ancestors = [];
        $parent = ($this->categories[$id->value] ?? null)?->parentId();
        while (null !== $parent && \count($ancestors) <= \count($this->categories)) {
            $ancestors[] = $parent;
            $parent = ($this->categories[$parent->value] ?? null)?->parentId();
        }

        return $ancestors;
    }

    public function subtreeHeight(CategoryId $id): int
    {
        $height = 0;
        foreach ($this->children($id) as $child) {
            $height = max($height, 1 + $this->subtreeHeight($child->id()));
        }

        return $height;
    }

    public function hasChildren(CategoryId $id): bool
    {
        return [] !== $this->children($id);
    }

    public function save(Category $category): void
    {
        $this->categories[$category->id()->value] = $category;
    }

    public function remove(Category $category): void
    {
        unset($this->categories[$category->id()->value]);
    }

    /**
     * @return list<Category>
     */
    private function children(CategoryId $id): array
    {
        return array_values(array_filter(
            $this->categories,
            static fn (Category $c): bool => $c->parentId()?->equals($id) ?? false,
        ));
    }
}
