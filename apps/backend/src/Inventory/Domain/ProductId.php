<?php

declare(strict_types=1);

namespace App\Inventory\Domain;

use App\Shared\Domain\Identity\UuidIdentifier;

/**
 * Identifier of a sellable product. Inventory keeps its own type: it only needs
 * the identity, not the product data owned by Catalog.
 */
final readonly class ProductId extends UuidIdentifier
{
}
