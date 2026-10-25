<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine\Type;

use App\Catalog\Domain\Product\Sku;
use App\Shared\Infrastructure\Persistence\Doctrine\StringValueType;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDbalType;

/**
 * @extends StringValueType<Sku>
 */
#[AsDbalType(self::NAME)]
final class SkuType extends StringValueType
{
    public const string NAME = 'catalog_sku';

    protected function valueClass(): string
    {
        return Sku::class;
    }
}
