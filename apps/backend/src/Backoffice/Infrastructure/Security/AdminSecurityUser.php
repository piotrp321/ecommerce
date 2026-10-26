<?php

declare(strict_types=1);

namespace App\Backoffice\Infrastructure\Security;

use Symfony\Component\Security\Core\User\UserInterface;

/**
 * The caller of an admin API request (firewall admin_api). The roles come from
 * the access token only; a caller without the administrator role, or a locally
 * blocked administrator, has none and is denied by access_control (403).
 */
final readonly class AdminSecurityUser implements UserInterface
{
    public const string ROLE_ADMIN = 'ROLE_ADMIN';

    /**
     * @param string      $id    the AdminUser id, or the token subject of a caller that is not an administrator
     * @param list<string> $roles
     */
    public function __construct(
        public string $id,
        public ?string $email,
        private array $roles,
    ) {
    }

    public function getRoles(): array
    {
        return $this->roles;
    }

    public function getUserIdentifier(): string
    {
        \assert('' !== $this->id);

        return $this->id;
    }
}
