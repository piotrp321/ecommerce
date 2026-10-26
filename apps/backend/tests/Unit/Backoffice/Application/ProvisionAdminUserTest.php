<?php

declare(strict_types=1);

namespace App\Tests\Unit\Backoffice\Application;

use App\Backoffice\Application\ProvisionAdminUser;
use App\Shared\Domain\Identity\ExternalIdentity;
use App\Tests\Support\Backoffice\InMemoryAdminUserRepository;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Clock\MockClock;

final class ProvisionAdminUserTest extends TestCase
{
    private const string ISSUER = 'https://auth.example.com/realms/admin';

    private InMemoryAdminUserRepository $adminUsers;
    private ProvisionAdminUser $provision;

    protected function setUp(): void
    {
        $this->adminUsers = new InMemoryAdminUserRepository();
        $this->provision = new ProvisionAdminUser($this->adminUsers, new MockClock('2026-10-26 10:00:00'));
    }

    public function testRegistersTheAdministratorOnceAndSyncsTheProfile(): void
    {
        $first = ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'ola@example.com', true);
        $same = ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'ola@example.com', true);
        self::assertSame(0, $this->adminUsers->saves);

        $changed = ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'ola.kowalska@example.com', true);

        self::assertCount(1, $this->adminUsers->all());
        self::assertTrue($first->id()->equals($same->id()));
        self::assertTrue($first->id()->equals($changed->id()));
        self::assertSame('ola.kowalska@example.com', $changed->email());
        self::assertSame(1, $this->adminUsers->saves);
    }

    public function testKeepsALocalBlock(): void
    {
        ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'ola@example.com', true)->block(new \DateTimeImmutable());

        $adminUser = ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'ola.kowalska@example.com', true);

        self::assertTrue($adminUser->isBlocked());
    }
}
