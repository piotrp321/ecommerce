<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Security;

use Psr\Log\LoggerInterface;
use SensitiveParameter;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;
use Symfony\Component\Security\Core\User\InMemoryUser;
use Symfony\Component\Security\Http\AccessToken\AccessTokenHandlerInterface;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;

/**
 * INTERIM authentication of the administrative API (ADR-0005): a single bearer
 * token taken from the ADMIN_API_TOKEN secret. Meant for tests and server-side
 * calls only; it must never reach a browser. It will be replaced by admin
 * accounts with HttpOnly session cookies and CSRF protection before the admin
 * panel uses the API.
 *
 * Without a configured token (missing, empty or too short) every request is denied.
 */
final readonly class AdminApiTokenHandler implements AccessTokenHandlerInterface
{
    /** 32 characters of `openssl rand -hex 32` output carry 128 bits. */
    public const int MIN_TOKEN_LENGTH = 32;
    public const string USER = 'admin-api';
    public const string ROLE = 'ROLE_ADMIN';

    public function __construct(
        #[Autowire('%env(default::ADMIN_API_TOKEN)%')]
        #[SensitiveParameter]
        private ?string $expectedToken,
        private LoggerInterface $logger,
    ) {
    }

    public function getUserBadgeFrom(#[SensitiveParameter] string $accessToken): UserBadge
    {
        if (null === $this->expectedToken || \strlen($this->expectedToken) < self::MIN_TOKEN_LENGTH) {
            $this->logger->warning('Admin API request denied: ADMIN_API_TOKEN is not set or shorter than {length} characters.', [
                'length' => self::MIN_TOKEN_LENGTH,
            ]);

            throw new BadCredentialsException('Invalid credentials.');
        }

        // Constant-time comparison of fixed-length hashes: neither the content
        // nor the length of the expected token leaks through timing.
        if (!hash_equals(hash('sha256', $this->expectedToken), hash('sha256', $accessToken))) {
            throw new BadCredentialsException('Invalid credentials.');
        }

        return new UserBadge(self::USER, static fn (string $identifier): InMemoryUser => new InMemoryUser($identifier, null, [self::ROLE]));
    }
}
