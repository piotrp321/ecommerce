<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine\Type;

use App\Catalog\Domain\Product\ProductId;
use App\Shared\Infrastructure\Persistence\Doctrine\UuidIdentifierType;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDbalType;

/**
 * @extends UuidIdentifierType<ProductId>
 */
#[AsDbalType(self::NAME)]
final class ProductIdType extends UuidIdentifierType
{
    public const string NAME = 'catalog_product_id';

    protected function identifierClass(): string
    {
        return ProductId::class;
    }
}
