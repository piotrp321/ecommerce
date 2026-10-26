<?php

declare(strict_types=1);

namespace App\Customers\Infrastructure\Security;

use App\Shared\Infrastructure\Security\AccessTokenPolicy;
use Psr\Log\LoggerInterface;
use SensitiveParameter;
use Symfony\Component\DependencyInjection\Attribute\AsDecorator;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\DependencyInjection\Attribute\AutowireDecorated;
use Symfony\Component\Security\Http\AccessToken\AccessTokenHandlerInterface;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;

/**
 * OIDC token handler of the store_api firewall (security.yaml) with the checks
 * of AccessTokenPolicy (typ, azp) on top.
 */
#[AsDecorator('security.access_token_handler.store_api')]
final readonly class CustomerAccessTokenHandler implements AccessTokenHandlerInterface
{
    private AccessTokenPolicy $policy;

    public function __construct(
        #[AutowireDecorated]
        private AccessTokenHandlerInterface $inner,
        #[Autowire('%env(OIDC_STORE_CLIENTS)%')]
        string $allowedClients,
        LoggerInterface $logger,
    ) {
        $this->policy = new AccessTokenPolicy($allowedClients, $logger);
    }

    public function getUserBadgeFrom(#[SensitiveParameter] string $accessToken): UserBadge
    {
        return $this->policy->check($this->inner->getUserBadgeFrom($accessToken));
    }
}
