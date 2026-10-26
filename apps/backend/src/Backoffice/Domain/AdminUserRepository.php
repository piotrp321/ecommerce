<?php

declare(strict_types=1);

namespace App\Backoffice\Domain;

use App\Shared\Domain\Identity\ExternalIdentity;

interface AdminUserRepository
{
    public function findByIdentity(ExternalIdentity $identity): ?AdminUser;

    /**
     * Adds a newly registered administrator unless one with the same external
     * identity already exists, e.g. registered by a concurrent first request.
     * Never fails because of that administrator: read it back with findByIdentity().
     */
    public function addIfAbsent(AdminUser $adminUser): void;

    public function save(AdminUser $adminUser): void;
}
