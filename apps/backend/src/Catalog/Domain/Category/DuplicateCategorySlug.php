<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\Conflict;

final class DuplicateCategorySlug extends Conflict
{
    public static function of(Slug $slug): self
    {
        return new self(\sprintf('A category with slug "%s" already exists.', $slug));
    }
}
