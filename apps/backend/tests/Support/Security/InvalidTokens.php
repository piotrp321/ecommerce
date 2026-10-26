<?php

declare(strict_types=1);

namespace App\Tests\Support\Security;

/**
 * Tokens that an API firewall must reject with 401, for the realm it trusts.
 * Each one differs from a valid token of that realm in one respect only.
 *
 * Data providers get the names only (cases()); the token is made when the test
 * runs (make()), so its time claims are relative to that moment.
 */
final class InvalidTokens
{
    private const array CASES = [
        'not a JWT',
        'three garbage segments',
        'foreign key with the realm key id',
        'unknown key id',
        'alg none',
        'HS256 with the public key as secret',
        'payload modified after signing',
        'wrong issuer',
        'issuer of the other realm',
        'token of the other realm',
        'no audience',
        'wrong audience',
        'audience of the other realm',
        'expired',
        'no expiry',
        'not valid yet (nbf)',
        'issued in the future (iat)',
        'ID token',
        'refresh token',
        'logout token',
        'no token type',
        'client not allowed (azp)',
        'client of the other realm (azp)',
        'no authorized party',
        'no subject',
    ];

    /**
     * @return iterable<string, array{string}>
     */
    public static function cases(): iterable
    {
        foreach (self::CASES as $case) {
            yield $case => [$case];
        }
    }

    /**
     * @param TestKeys::STORE|TestKeys::ADMIN $realm
     */
    public static function make(string $realm, string $case): string
    {
        $other = TestKeys::STORE === $realm ? TestKeys::ADMIN : TestKeys::STORE;
        $otherClaims = self::claims($other);
        $sign = static fn (array $overrides = []): string => TestTokens::sign(self::claims($realm, $overrides), $realm);
        $now = time();

        return match ($case) {
            'not a JWT' => 'not-a-jwt',
            'three garbage segments' => 'a.b.c',
            'foreign key with the realm key id' => TestTokens::sign(self::claims($realm), TestKeys::FOREIGN, ['kid' => TestKeys::private($realm)->get('kid')]),
            'unknown key id' => TestTokens::sign(self::claims($realm), TestKeys::FOREIGN),
            'alg none' => TestTokens::unsigned(self::claims($realm)),
            'HS256 with the public key as secret' => TestTokens::hs256WithPublicKey(self::claims($realm), $realm),
            'payload modified after signing' => TestTokens::withPayload($sign(), self::claims($realm, ['sub' => 'someone-else'])),
            'wrong issuer' => $sign(['iss' => 'https://evil.example.test/realms/'.$realm]),
            'issuer of the other realm' => $sign(['iss' => $otherClaims['iss']]),
            'token of the other realm' => TestTokens::sign($otherClaims, $other),
            'no audience' => $sign(['aud' => null]),
            'wrong audience' => $sign(['aud' => 'account']),
            'audience of the other realm' => $sign(['aud' => $otherClaims['aud']]),
            'expired' => $sign(['iat' => $now - 600, 'exp' => $now - 60]),
            'no expiry' => $sign(['exp' => null]),
            'not valid yet (nbf)' => $sign(['nbf' => $now + 60]),
            'issued in the future (iat)' => $sign(['iat' => $now + 60]),
            'ID token' => $sign(['typ' => 'ID']),
            'refresh token' => $sign(['typ' => 'Refresh']),
            'logout token' => $sign(['typ' => 'Logout']),
            'no token type' => $sign(['typ' => null]),
            'client not allowed (azp)' => $sign(['azp' => 'other-client']),
            'client of the other realm (azp)' => $sign(['azp' => $otherClaims['azp']]),
            'no authorized party' => $sign(['azp' => null]),
            'no subject' => $sign(['sub' => null]),
            default => throw new \LogicException(\sprintf('Unknown invalid token "%s".', $case)),
        };
    }

    /**
     * @param array<mixed> $overrides
     *
     * @return array<string, mixed>
     */
    private static function claims(string $realm, array $overrides = []): array
    {
        /** @var array<string, mixed> $overrides */
        return TestKeys::STORE === $realm ? TestTokens::customerClaims($overrides) : TestTokens::adminClaims($overrides);
    }
}
