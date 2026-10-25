<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Shared\Domain\Exception\NotFound;

final class CategoryNotFound extends NotFound
{
    public static function withId(CategoryId $id): self
    {
        return new self(\sprintf('Category "%s" was not found.', $id));
    }

    public static function withSlug(string $slug): self
    {
        return new self(\sprintf('Category "%s" was not found.', $slug));
    }
}
