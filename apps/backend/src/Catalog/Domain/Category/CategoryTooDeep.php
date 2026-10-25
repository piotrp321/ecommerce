<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Shared\Domain\Exception\Conflict;

final class CategoryTooDeep extends Conflict
{
    public static function under(CategoryId $parentId, int $maxDepth): self
    {
        return new self(\sprintf('Placing the category under "%s" would make the tree deeper than %d levels.', $parentId, $maxDepth));
    }
}
