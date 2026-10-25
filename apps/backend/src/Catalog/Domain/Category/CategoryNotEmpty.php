<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Shared\Domain\Exception\Conflict;

final class CategoryNotEmpty extends Conflict
{
    public static function withId(CategoryId $id): self
    {
        return new self(\sprintf('Category "%s" still has products; move them to another category first.', $id));
    }
}
