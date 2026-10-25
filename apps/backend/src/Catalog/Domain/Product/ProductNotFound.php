<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Product;

use App\Shared\Domain\Exception\NotFound;

final class ProductNotFound extends NotFound
{
    public static function withId(ProductId $id): self
    {
        return new self(\sprintf('Product "%s" was not found.', $id));
    }

    public static function withSlug(string $slug): self
    {
        return new self(\sprintf('Product "%s" was not found.', $slug));
    }
}
