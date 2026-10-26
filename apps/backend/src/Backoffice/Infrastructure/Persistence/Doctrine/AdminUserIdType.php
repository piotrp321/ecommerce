<?php

declare(strict_types=1);

namespace App\Backoffice\Infrastructure\Persistence\Doctrine;

use App\Backoffice\Domain\AdminUserId;
use App\Shared\Infrastructure\Persistence\Doctrine\UuidIdentifierType;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDbalType;

/**
 * @extends UuidIdentifierType<AdminUserId>
 */
#[AsDbalType(self::NAME)]
final class AdminUserIdType extends UuidIdentifierType
{
    public const string NAME = 'backoffice_admin_user_id';

    protected function identifierClass(): string
    {
        return AdminUserId::class;
    }
}
