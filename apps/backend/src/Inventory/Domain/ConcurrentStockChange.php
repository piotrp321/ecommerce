<?php

declare(strict_types=1);

namespace App\Inventory\Domain;

use App\Shared\Domain\Exception\Conflict;

final class ConcurrentStockChange extends Conflict
{
    public static function of(ProductId $productId): self
    {
        return new self(\sprintf('The stock of product "%s" was changed concurrently; retry the request.', $productId));
    }
}
