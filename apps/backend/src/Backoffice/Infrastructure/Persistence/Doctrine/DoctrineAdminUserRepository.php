<?php

declare(strict_types=1);

namespace App\Backoffice\Infrastructure\Persistence\Doctrine;

use App\Backoffice\Domain\AdminUser;
use App\Backoffice\Domain\AdminUserRepository;
use App\Shared\Domain\Identity\ExternalIdentity;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineAdminUserRepository implements AdminUserRepository
{
    public function __construct(private EntityManagerInterface $entityManager)
    {
    }

    public function findByIdentity(ExternalIdentity $identity): ?AdminUser
    {
        return $this->entityManager->getRepository(AdminUser::class)->findOneBy([
            'issuer' => $identity->issuer,
            'subject' => $identity->subject,
        ]);
    }

    /**
     * One statement, so concurrent first requests of an administrator neither fail
     * nor create two rows: the unique (issuer, subject) index makes the later
     * insert wait for the earlier transaction and then do nothing.
     */
    public function addIfAbsent(AdminUser $adminUser): void
    {
        $identity = $adminUser->identity();
        $this->entityManager->getConnection()->executeStatement(
            'INSERT INTO backoffice_admin_user (id, issuer, subject, email, email_verified, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (issuer, subject) DO NOTHING',
            [$adminUser->id()->value, $identity->issuer, $identity->subject, $adminUser->email(), $adminUser->emailVerified(), $adminUser->status()->value, $adminUser->createdAt(), $adminUser->updatedAt()],
            [Types::GUID, Types::STRING, Types::STRING, Types::STRING, Types::BOOLEAN, Types::STRING, Types::DATETIMETZ_IMMUTABLE, Types::DATETIMETZ_IMMUTABLE],
        );
    }

    public function save(AdminUser $adminUser): void
    {
        $this->entityManager->persist($adminUser);
        $this->entityManager->flush();
    }
}
