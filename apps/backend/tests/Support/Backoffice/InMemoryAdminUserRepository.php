<?php

declare(strict_types=1);

namespace App\Tests\Support\Backoffice;

use App\Backoffice\Domain\AdminUser;
use App\Backoffice\Domain\AdminUserRepository;
use App\Shared\Domain\Identity\ExternalIdentity;

final class InMemoryAdminUserRepository implements AdminUserRepository
{
    /** @var array<string, AdminUser> */
    private array $adminUsers = [];

    public int $saves = 0;

    public function findByIdentity(ExternalIdentity $identity): ?AdminUser
    {
        return $this->adminUsers[self::key($identity)] ?? null;
    }

    public function addIfAbsent(AdminUser $adminUser): void
    {
        $this->adminUsers[self::key($adminUser->identity())] ??= $adminUser;
    }

    public function save(AdminUser $adminUser): void
    {
        ++$this->saves;
        $this->adminUsers[self::key($adminUser->identity())] = $adminUser;
    }

    /**
     * @return list<AdminUser>
     */
    public function all(): array
    {
        return array_values($this->adminUsers);
    }

    private static function key(ExternalIdentity $identity): string
    {
        return $identity->issuer."\n".$identity->subject;
    }
}
