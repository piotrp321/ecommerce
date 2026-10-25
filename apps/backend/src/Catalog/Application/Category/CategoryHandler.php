<?php

declare(strict_types=1);

namespace App\Catalog\Application\Category;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotEmpty;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Category\DuplicateCategorySlug;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Slug;

/**
 * Use cases of the (flat) category list.
 */
final readonly class CategoryHandler
{
    public function __construct(
        private CategoryRepository $categories,
        private ProductRepository $products,
    ) {
    }

    public function create(string $slug, string $name): CategoryId
    {
        $slug = new Slug($slug);
        $category = Category::create(CategoryId::generate(), $slug, $name);

        if ($this->categories->slugExists($slug)) {
            throw DuplicateCategorySlug::of($slug);
        }
        $this->categories->save($category);

        return $category->id();
    }

    public function update(string $categoryId, string $slug, string $name): void
    {
        $category = $this->categories->get(CategoryId::fromString($categoryId));
        $slug = new Slug($slug);
        $category->update($slug, $name);

        if ($this->categories->slugExists($slug, except: $category->id())) {
            throw DuplicateCategorySlug::of($slug);
        }
        $this->categories->save($category);
    }

    /**
     * Only an empty category can be deleted, so no product loses its category silently.
     */
    public function delete(string $categoryId): void
    {
        $category = $this->categories->get(CategoryId::fromString($categoryId));

        if ($this->products->existsInCategory($category->id())) {
            throw CategoryNotEmpty::withId($category->id());
        }
        $this->categories->remove($category);
    }
}
