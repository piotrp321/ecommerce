<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Shared\Domain\Exception\InvalidValue;

/**
 * Domain service: rules for putting a category under a parent that need the
 * whole tree. The database enforces "no cycles" as well (it serialises tree
 * changes), so concurrent moves cannot break the tree either.
 */
final readonly class CategoryPlacement
{
    /**
     * Levels including the root, e.g. Electronics → Phones → Smartphones is 3.
     * The tree guard trigger in the migration enforces the same value.
     */
    public const int MAX_DEPTH = 10;

    public function __construct(private CategoryRepository $categories)
    {
    }

    /**
     * @throws InvalidValue    when the parent does not exist
     * @throws CategoryCycle   when the parent is the category itself or one of its descendants
     * @throws CategoryTooDeep when the category's subtree would exceed MAX_DEPTH
     */
    public function assertCanPlace(CategoryId $category, ?CategoryId $parent): void
    {
        if (null === $parent) {
            return; // A root is never deeper than before.
        }
        if ($parent->equals($category)) {
            throw CategoryCycle::ownParent($category);
        }
        if (!$this->categories->exists($parent)) {
            throw new InvalidValue(\sprintf('Parent category "%s" does not exist.', $parent));
        }

        $parentAncestors = $this->categories->ancestorIds($parent);
        foreach ($parentAncestors as $ancestor) {
            if ($ancestor->equals($category)) {
                throw CategoryCycle::underDescendant($category, $parent);
            }
        }

        $depth = \count($parentAncestors) + 2; // the parent's level + 1
        if ($depth + $this->categories->subtreeHeight($category) > self::MAX_DEPTH) {
            throw CategoryTooDeep::under($parent, self::MAX_DEPTH);
        }
    }
}
