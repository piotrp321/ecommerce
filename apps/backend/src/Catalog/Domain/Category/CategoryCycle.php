<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Shared\Domain\Exception\Conflict;

/**
 * The requested parent would make the tree cyclic.
 */
final class CategoryCycle extends Conflict
{
    public static function ownParent(CategoryId $id): self
    {
        return new self(\sprintf('Category "%s" cannot be its own parent.', $id));
    }

    public static function underDescendant(CategoryId $id, CategoryId $parentId): self
    {
        return new self(\sprintf('Category "%s" cannot be moved under "%s", which is one of its subcategories.', $id, $parentId));
    }
}
