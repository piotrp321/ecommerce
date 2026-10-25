<?php

declare(strict_types=1);

namespace App\Inventory\Infrastructure\Persistence\Doctrine;

use App\Inventory\Domain\ProductId;
use App\Shared\Infrastructure\Persistence\Doctrine\UuidIdentifierType;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDbalType;

/**
 * @extends UuidIdentifierType<ProductId>
 */
#[AsDbalType(self::NAME)]
final class ProductIdType extends UuidIdentifierType
{
    public const string NAME = 'inventory_product_id';

    protected function identifierClass(): string
    {
        return ProductId::class;
    }
}
