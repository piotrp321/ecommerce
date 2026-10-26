<?php

declare(strict_types=1);

namespace App\Tests\Integration\Backoffice\Infrastructure\Persistence;

use App\Backoffice\Application\ProvisionAdminUser;
use App\Backoffice\Domain\AdminUser;
use App\Backoffice\Domain\AdminUserId;
use App\Backoffice\Domain\AdminUserStatus;
use App\Backoffice\Infrastructure\Persistence\Doctrine\DoctrineAdminUserRepository;
use App\Shared\Domain\Identity\ExternalIdentity;
use App\Tests\Support\DatabaseTestCase;
use Doctrine\DBAL\Exception\DriverException;
use Symfony\Component\Clock\MockClock;

final class AdminUserProvisioningTest extends DatabaseTestCase
{
    private const string ISSUER = 'https://auth.example.com/realms/admin';
    private const string LOCK_NOT_AVAILABLE = '55P03';
    private const string CHECK_VIOLATION = '23514';

    protected function tearDown(): void
    {
        self::connection()->executeStatement('RESET lock_timeout');
        parent::tearDown();
    }

    public function testRegistersOnceAndKeepsTheLocalBlock(): void
    {
        $provision = new ProvisionAdminUser(self::repository(), new MockClock());
        $identity = new ExternalIdentity(self::ISSUER, 'sub-1');
        $adminUser = $provision($identity, 'ola@example.com', true);
        $adminUser->block(new \DateTimeImmutable());
        self::repository()->save($adminUser);
        self::entityManager()->clear();

        $again = $provision($identity, 'ola.kowalska@example.com', true);

        self::assertTrue($again->id()->equals($adminUser->id()));
        self::assertTrue($again->isBlocked());
        self::assertSame([[
            'email' => 'ola.kowalska@example.com',
            'status' => 'blocked',
        ]], self::connection()->fetchAllAssociative('SELECT email, status FROM backoffice_admin_user'));
    }

    public function testConcurrentFirstRequestsEndWithOneAdministrator(): void
    {
        $identity = new ExternalIdentity(self::ISSUER, 'sub-1');
        $other = AdminUserId::generate();
        $second = self::secondConnection();
        try {
            $second->beginTransaction();
            $second->executeStatement(
                "INSERT INTO backoffice_admin_user (id, issuer, subject, email, email_verified, status, created_at, updated_at) VALUES (?, ?, ?, NULL, false, 'active', now(), now())",
                [$other->value, $identity->issuer, $identity->subject],
            );

            self::connection()->executeStatement("SET lock_timeout = '300ms'");
            try {
                self::repository()->addIfAbsent(self::adminUser($identity));
                self::fail('The insert should wait for the concurrent transaction.');
            } catch (DriverException $exception) {
                self::assertSame(self::LOCK_NOT_AVAILABLE, $exception->getSQLState());
            }
            self::connection()->executeStatement('RESET lock_timeout');
            $second->commit();
        } finally {
            if ($second->isTransactionActive()) {
                $second->rollBack();
            }
            $second->close();
        }

        $repository = self::repository();
        $repository->addIfAbsent(self::adminUser($identity));

        self::assertTrue($repository->findByIdentity($identity)?->id()->equals($other));
        self::assertSame(1, self::connection()->fetchOne('SELECT count(*) FROM backoffice_admin_user'));
    }

    public function testTheDatabaseAcceptsOnlyKnownStatuses(): void
    {
        $adminUser = self::adminUser(new ExternalIdentity(self::ISSUER, 'sub-1'));
        self::repository()->addIfAbsent($adminUser);
        self::assertSame(AdminUserStatus::Active->value, self::connection()->fetchOne('SELECT status FROM backoffice_admin_user'));

        try {
            self::connection()->executeStatement("UPDATE backoffice_admin_user SET status = 'deleted'");
            self::fail('Expected a check violation.');
        } catch (DriverException $exception) {
            self::assertSame(self::CHECK_VIOLATION, $exception->getSQLState());
        }
    }

    private static function repository(): DoctrineAdminUserRepository
    {
        return new DoctrineAdminUserRepository(self::entityManager());
    }

    private static function adminUser(ExternalIdentity $identity): AdminUser
    {
        return AdminUser::register(AdminUserId::generate(), $identity, 'ola@example.com', true, new \DateTimeImmutable());
    }
}
