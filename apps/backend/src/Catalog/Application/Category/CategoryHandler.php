<?php

declare(strict_types=1);

namespace App\Catalog\Application\Category;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotEmpty;
use App\Catalog\Domain\Category\CategoryPlacement;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Category\DuplicateCategorySlug;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Slug;

/**
 * Use cases of the category tree.
 */
final readonly class CategoryHandler
{
    public function __construct(
        private CategoryRepository $categories,
        private ProductRepository $products,
        private CategoryPlacement $placement,
    ) {
    }

    /**
     * Creates a root category, or a subcategory when a parent is given.
     */
    public function create(string $slug, string $name, ?string $parentId = null): CategoryId
    {
        $slug = new Slug($slug);
        $parent = null === $parentId ? null : CategoryId::fromString($parentId);
        $category = Category::create(CategoryId::generate(), $slug, $name, $parent);

        if ($this->categories->slugExists($slug)) {
            throw DuplicateCategorySlug::of($slug);
        }
        $this->placement->assertCanPlace($category->id(), $parent);
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
     * Moves the category with its whole subtree under another parent (null: to the root level).
     * Products stay in their categories.
     */
    public function move(string $categoryId, ?string $parentId): void
    {
        $category = $this->categories->get(CategoryId::fromString($categoryId));
        $parent = null === $parentId ? null : CategoryId::fromString($parentId);

        $this->placement->assertCanPlace($category->id(), $parent);
        $category->moveTo($parent);
        $this->categories->save($category);
    }

    /**
     * Only an empty category can be deleted: products and subcategories are
     * never removed or re-assigned implicitly.
     */
    public function delete(string $categoryId): void
    {
        $category = $this->categories->get(CategoryId::fromString($categoryId));

        if ($this->categories->hasChildren($category->id())) {
            throw CategoryNotEmpty::withSubcategories($category->id());
        }
        if ($this->products->existsInCategory($category->id())) {
            throw CategoryNotEmpty::withProducts($category->id());
        }
        $this->categories->remove($category);
    }
}
