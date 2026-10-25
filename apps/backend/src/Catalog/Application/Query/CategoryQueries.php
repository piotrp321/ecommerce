<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotFound;

/**
 * Category tree read side.
 */
final readonly class CategoryQueries
{
    public function __construct(private CategoryFinder $finder)
    {
    }

    /**
     * The whole tree: root categories with their subcategories (one query).
     *
     * @return list<CategoryNode>
     */
    public function tree(): array
    {
        return CategoryNode::forest($this->finder->all());
    }

    /**
     * @throws CategoryNotFound
     */
    public function byId(string $id): CategoryDetails
    {
        return $this->details($this->finder->byId($id) ?? throw CategoryNotFound::withId(CategoryId::fromString($id)));
    }

    /**
     * @throws CategoryNotFound
     */
    public function bySlug(string $slug): CategoryDetails
    {
        return $this->details($this->finder->bySlug($slug) ?? throw CategoryNotFound::withSlug($slug));
    }

    private function details(CategoryRecord $category): CategoryDetails
    {
        // Empty when the category was deleted after it was read.
        $node = CategoryNode::forest($this->finder->subtree($category->id))[0]
            ?? throw CategoryNotFound::withId(CategoryId::fromString($category->id));

        return new CategoryDetails($node, $this->finder->ancestors($category->id));
    }
}
