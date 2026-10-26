<?php

declare(strict_types=1);

namespace App\Customers\Infrastructure\Persistence\Doctrine;

use App\Customers\Domain\CustomerId;
use App\Shared\Infrastructure\Persistence\Doctrine\UuidIdentifierType;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDbalType;

/**
 * @extends UuidIdentifierType<CustomerId>
 */
#[AsDbalType(self::NAME)]
final class CustomerIdType extends UuidIdentifierType
{
    public const string NAME = 'customers_customer_id';

    protected function identifierClass(): string
    {
        return CustomerId::class;
    }
}
