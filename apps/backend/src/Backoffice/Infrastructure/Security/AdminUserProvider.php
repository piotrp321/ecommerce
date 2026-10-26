<?php

declare(strict_types=1);

namespace App\Backoffice\Infrastructure\Security;

use App\Backoffice\Application\ProvisionAdminUser;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Identity\ExternalIdentity;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\Exception\UserNotFoundException;
use Symfony\Component\Security\Core\User\AttributesBasedUserProviderInterface;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * The caller of a verified admin access token: the identifier is its `sub`, the
 * attributes are its claims.
 *
 * The administrator role is granted only by the client role "admin" of the
 * admin API client (`resource_access.<OIDC_ADMIN_AUDIENCE>.roles`); realm roles
 * and roles of other clients are ignored. Only such a caller is registered as an
 * AdminUser (ProvisionAdminUser); a locally blocked AdminUser gets no role.
 *
 * @implements AttributesBasedUserProviderInterface<AdminSecurityUser>
 */
final readonly class AdminUserProvider implements AttributesBasedUserProviderInterface
{
    public const string ADMIN_CLIENT_ROLE = 'admin';

    public function __construct(
        private ProvisionAdminUser $provisionAdminUser,
        #[Autowire('%env(OIDC_ADMIN_AUDIENCE)%')]
        private string $apiClient,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @param array<string, mixed> $attributes the claims of the verified token
     */
    public function loadUserByIdentifier(string $identifier, array $attributes = []): AdminSecurityUser
    {
        $issuer = $attributes['iss'] ?? null;
        if (!\is_string($issuer)) {
            // Only access tokens identify administrators (stateless API, no sessions).
            throw new UserNotFoundException('An administrator is identified by an access token only.');
        }
        if (!$this->grantsAdministratorRole($attributes)) {
            return new AdminSecurityUser($identifier, null, []);
        }
        $email = $attributes['email'] ?? null;

        try {
            $adminUser = ($this->provisionAdminUser)(
                new ExternalIdentity($issuer, $identifier),
                \is_string($email) ? $email : null,
                true === ($attributes['email_verified'] ?? null),
            );
        } catch (InvalidValue $exception) {
            throw new UserNotFoundException('The token does not identify a valid administrator.', previous: $exception);
        }

        if ($adminUser->isBlocked()) {
            $this->logger->notice('Admin API request denied: administrator {id} is blocked.', ['id' => $adminUser->id()->value]);

            return new AdminSecurityUser($adminUser->id()->value, $adminUser->email(), []);
        }

        return new AdminSecurityUser($adminUser->id()->value, $adminUser->email(), [AdminSecurityUser::ROLE_ADMIN]);
    }

    public function refreshUser(UserInterface $user): UserInterface
    {
        throw new UnsupportedUserException('The admin API is stateless: there is no user to refresh.');
    }

    public function supportsClass(string $class): bool
    {
        return AdminSecurityUser::class === $class;
    }

    /**
     * @param array<mixed> $claims
     */
    private function grantsAdministratorRole(array $claims): bool
    {
        $access = $claims['resource_access'] ?? null;
        $roles = \is_array($access) && \is_array($access[$this->apiClient] ?? null) ? ($access[$this->apiClient]['roles'] ?? null) : null;

        return \is_array($roles) && \in_array(self::ADMIN_CLIENT_ROLE, $roles, true);
    }
}
