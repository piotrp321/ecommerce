<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Security;

use Psr\Log\LoggerInterface;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;

/**
 * Checks of an OpenID Connect access token that Symfony's OidcTokenHandler does
 * not make (it verifies the signature, iss, aud, exp, nbf and iat):
 * - `typ` must be "Bearer": an access token, not an ID, refresh or logout token
 *   of the same realm (Keycloak signs them all with the same keys),
 * - `azp` must be one of the clients allowed to call the API.
 *
 * Used by the decorator of each API firewall's token handler, so a rejected token
 * never reaches the user provider (nothing is provisioned from it). The reason is
 * only logged; the client gets the generic 401 of ApiSecurityResponses.
 */
final readonly class AccessTokenPolicy
{
    public const string ACCESS_TOKEN_TYPE = 'Bearer';

    /** @var list<string> */
    private array $allowedClients;

    /**
     * @param string $allowedClients client ids separated by commas
     */
    public function __construct(string $allowedClients, private LoggerInterface $logger)
    {
        $this->allowedClients = array_values(array_filter(
            array_map(trim(...), explode(',', $allowedClients)),
            static fn (string $client): bool => '' !== $client,
        ));
    }

    /**
     * @throws BadCredentialsException
     */
    public function check(UserBadge $badge): UserBadge
    {
        $claims = $badge->getAttributes() ?? [];
        $reason = match (true) {
            self::ACCESS_TOKEN_TYPE !== ($claims['typ'] ?? null) => 'it is not an access token (typ)',
            !\in_array($claims['azp'] ?? null, $this->allowedClients, true) => 'its client may not call this API (azp)',
            default => null,
        };
        if (null !== $reason) {
            $this->logger->notice('Access token rejected: {reason}.', [
                'reason' => $reason,
                'typ' => \is_scalar($claims['typ'] ?? null) ? $claims['typ'] : null,
                'azp' => \is_scalar($claims['azp'] ?? null) ? $claims['azp'] : null,
            ]);

            throw new BadCredentialsException('Invalid credentials.');
        }

        return $badge;
    }
}
