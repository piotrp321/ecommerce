<?php

declare(strict_types=1);

namespace App\Inventory\Domain;

use App\Shared\Domain\Exception\NotFound;

final class UnknownProduct extends NotFound
{
    public static function withId(ProductId $productId): self
    {
        return new self(\sprintf('Product "%s" was not found.', $productId));
    }
}
