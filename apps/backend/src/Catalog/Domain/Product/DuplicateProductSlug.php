<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Product;

use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\Conflict;

final class DuplicateProductSlug extends Conflict
{
    public static function of(Slug $slug): self
    {
        return new self(\sprintf('A product with slug "%s" already exists.', $slug));
    }
}
