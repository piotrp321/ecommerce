<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine\Type;

use App\Catalog\Domain\Category\CategoryId;
use App\Shared\Infrastructure\Persistence\Doctrine\UuidIdentifierType;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDbalType;

/**
 * @extends UuidIdentifierType<CategoryId>
 */
#[AsDbalType(self::NAME)]
final class CategoryIdType extends UuidIdentifierType
{
    public const string NAME = 'catalog_category_id';

    protected function identifierClass(): string
    {
        return CategoryId::class;
    }
}
