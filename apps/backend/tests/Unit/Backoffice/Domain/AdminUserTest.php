<?php

declare(strict_types=1);

namespace App\Tests\Unit\Backoffice\Domain;

use App\Backoffice\Domain\AdminUser;
use App\Backoffice\Domain\AdminUserId;
use App\Backoffice\Domain\AdminUserStatus;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Identity\ExternalIdentity;
use PHPUnit\Framework\TestCase;

final class AdminUserTest extends TestCase
{
    private const string ISSUER = 'https://auth.example.com/realms/admin';

    public function testRegistersAnActiveAdministrator(): void
    {
        $now = new \DateTimeImmutable('2026-10-26 10:00:00');

        $adminUser = AdminUser::register(AdminUserId::generate(), new ExternalIdentity(self::ISSUER, 'sub-1'), 'ola@example.com', true, $now);

        self::assertTrue($adminUser->identity()->equals(new ExternalIdentity(self::ISSUER, 'sub-1')));
        self::assertSame('ola@example.com', $adminUser->email());
        self::assertTrue($adminUser->emailVerified());
        self::assertSame(AdminUserStatus::Active, $adminUser->status());
        self::assertFalse($adminUser->isBlocked());
        self::assertEquals($now, $adminUser->createdAt());
    }

    public function testSyncsOnlyAChangedProfile(): void
    {
        $adminUser = $this->adminUser();
        $later = new \DateTimeImmutable('2026-10-27 08:00:00');

        self::assertFalse($adminUser->syncProfile('ola@example.com', true, $later));
        self::assertEquals(new \DateTimeImmutable('2026-10-26 10:00:00'), $adminUser->updatedAt());

        self::assertTrue($adminUser->syncProfile(null, true, $later));
        self::assertNull($adminUser->email());
        self::assertFalse($adminUser->emailVerified());
        self::assertEquals($later, $adminUser->updatedAt());
    }

    public function testCanBeBlocked(): void
    {
        $adminUser = $this->adminUser();
        $later = new \DateTimeImmutable('2026-10-27 08:00:00');

        $adminUser->block($later);

        self::assertTrue($adminUser->isBlocked());
        self::assertSame(AdminUserStatus::Blocked, $adminUser->status());
        self::assertEquals($later, $adminUser->updatedAt());
    }

    public function testRejectsAnEmailLongerThanTheColumn(): void
    {
        $this->expectException(InvalidValue::class);

        AdminUser::register(AdminUserId::generate(), new ExternalIdentity(self::ISSUER, 'sub-1'), str_repeat('a', 250).'@example.com', true, new \DateTimeImmutable());
    }

    private function adminUser(): AdminUser
    {
        return AdminUser::register(
            AdminUserId::generate(),
            new ExternalIdentity(self::ISSUER, 'sub-1'),
            'ola@example.com',
            true,
            new \DateTimeImmutable('2026-10-26 10:00:00'),
        );
    }
}
