<?php

declare(strict_types=1);

namespace App\Backoffice\Application;

use App\Backoffice\Domain\AdminUser;
use App\Backoffice\Domain\AdminUserId;
use App\Backoffice\Domain\AdminUserRepository;
use App\Shared\Domain\Identity\ExternalIdentity;
use Psr\Clock\ClockInterface;

/**
 * The administrator behind a verified access token of the admin realm that
 * grants the administrator role (the caller checks the role): registered on
 * their first request (just in time), with the profile kept in sync with the
 * identity provider. Concurrent first requests end with one administrator.
 */
final readonly class ProvisionAdminUser
{
    public function __construct(
        private AdminUserRepository $adminUsers,
        private ClockInterface $clock,
    ) {
    }

    public function __invoke(ExternalIdentity $identity, ?string $email, bool $emailVerified): AdminUser
    {
        $now = $this->clock->now();

        $adminUser = $this->adminUsers->findByIdentity($identity);
        if (null === $adminUser) {
            $this->adminUsers->addIfAbsent(AdminUser::register(AdminUserId::generate(), $identity, $email, $emailVerified, $now));
            $adminUser = $this->adminUsers->findByIdentity($identity)
                ?? throw new \LogicException('The administrator was neither added nor found.');
        }

        if ($adminUser->syncProfile($email, $emailVerified, $now)) {
            $this->adminUsers->save($adminUser);
        }

        return $adminUser;
    }
}
