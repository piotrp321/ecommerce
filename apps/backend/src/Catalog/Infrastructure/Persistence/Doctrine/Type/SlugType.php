<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine\Type;

use App\Catalog\Domain\Slug;
use App\Shared\Infrastructure\Persistence\Doctrine\StringValueType;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDbalType;

/**
 * @extends StringValueType<Slug>
 */
#[AsDbalType(self::NAME)]
final class SlugType extends StringValueType
{
    public const string NAME = 'catalog_slug';

    protected function valueClass(): string
    {
        return Slug::class;
    }
}
