<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Product;

use App\Shared\Domain\Exception\Conflict;

final class DuplicateSku extends Conflict
{
    public static function of(Sku $sku): self
    {
        return new self(\sprintf('A product with SKU "%s" already exists.', $sku));
    }
}
