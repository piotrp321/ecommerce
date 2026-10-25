<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Shared\Domain\Exception\Conflict;

/**
 * Deleting a category never removes its products or subcategories.
 */
final class CategoryNotEmpty extends Conflict
{
    public static function withProducts(CategoryId $id): self
    {
        return new self(\sprintf('Category "%s" still has products; move them to another category first.', $id));
    }

    public static function withSubcategories(CategoryId $id): self
    {
        return new self(\sprintf('Category "%s" still has subcategories; move or delete them first.', $id));
    }

    public static function withId(CategoryId $id): self
    {
        return new self(\sprintf('Category "%s" still has products or subcategories.', $id));
    }
}
