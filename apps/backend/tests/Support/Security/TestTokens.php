<?php

declare(strict_types=1);

namespace App\Tests\Support\Security;

use Jose\Component\Core\AlgorithmManager;
use Jose\Component\KeyManagement\JWKFactory;
use Jose\Component\Signature\Algorithm\HS256;
use Jose\Component\Signature\JWSBuilder;
use Jose\Component\Signature\Serializer\CompactSerializer;

/**
 * Access tokens shaped like Keycloak's, signed with the keys of the fake identity
 * provider. Every claim can be overridden; null removes it.
 *
 * RS256 signatures are made with ext-openssl directly from the PEM key: JWSBuilder
 * converts the JWK to PEM in pure PHP on every signature (without GMP/BCMath this
 * takes most of a second). JWSBuilder signs the HS256 attack token.
 */
final class TestTokens
{
    public const string CUSTOMER_SUBJECT = '5f1d3c2a-8b7e-4a6d-9c1f-2e3d4c5b6a71';
    public const string ADMIN_SUBJECT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

    /**
     * @param array<string, mixed> $claims overrides of customerClaims()
     */
    public static function customer(array $claims = []): string
    {
        return self::sign(self::customerClaims($claims), TestKeys::STORE);
    }

    /**
     * @param array<string, mixed> $claims overrides of adminClaims()
     */
    public static function admin(array $claims = []): string
    {
        return self::sign(self::adminClaims($claims), TestKeys::ADMIN);
    }

    /**
     * A valid access token of the store realm for the store API client.
     *
     * @param array<string, mixed> $overrides
     *
     * @return array<string, mixed>
     */
    public static function customerClaims(array $overrides = []): array
    {
        return self::claims([
            'iss' => self::env('OIDC_STORE_ISSUER'),
            'sub' => self::CUSTOMER_SUBJECT,
            'aud' => [self::env('OIDC_STORE_AUDIENCE'), 'account'],
            'azp' => 'store-bff',
            'typ' => 'Bearer',
            'scope' => 'openid email profile',
            'email' => 'anna@example.com',
            'email_verified' => true,
            'realm_access' => ['roles' => ['default-roles-store', 'offline_access']],
        ], $overrides);
    }

    /**
     * A valid access token of the admin realm granting the admin role of the admin API client.
     *
     * @param array<string, mixed> $overrides
     *
     * @return array<string, mixed>
     */
    public static function adminClaims(array $overrides = []): array
    {
        return self::claims([
            'iss' => self::env('OIDC_ADMIN_ISSUER'),
            'sub' => self::ADMIN_SUBJECT,
            'aud' => self::env('OIDC_ADMIN_AUDIENCE'),
            'azp' => 'admin-bff',
            'typ' => 'Bearer',
            'scope' => 'openid email profile',
            'email' => 'ola@example.com',
            'email_verified' => true,
            'realm_access' => ['roles' => ['default-roles-admin']],
            'resource_access' => [self::env('OIDC_ADMIN_AUDIENCE') => ['roles' => ['admin']]],
        ], $overrides);
    }

    /**
     * RS256 with one of the TestKeys.
     *
     * @param array<string, mixed> $claims
     * @param array<string, mixed> $header overrides of the protected header
     */
    public static function sign(array $claims, string $key, array $header = []): string
    {
        $header += ['alg' => 'RS256', 'typ' => 'JWT', 'kid' => TestKeys::private($key)->get('kid')];
        $input = self::base64Url(self::json($header)).'.'.self::base64Url(self::json($claims));
        if (!openssl_sign($input, $signature, TestKeys::privatePem($key), \OPENSSL_ALGO_SHA256) || !\is_string($signature)) {
            throw new \RuntimeException('Cannot sign the test token.');
        }

        return $input.'.'.self::base64Url($signature);
    }

    /**
     * HS256 with the realm's public key (PEM) as the HMAC secret: the algorithm
     * confusion attack on verifiers that let the token choose the algorithm.
     *
     * @param array<string, mixed> $claims
     */
    public static function hs256WithPublicKey(array $claims, string $realm): string
    {
        $key = JWKFactory::createFromSecret(TestKeys::publicPem($realm));

        $jws = (new JWSBuilder(new AlgorithmManager([new HS256()])))
            ->create()
            ->withPayload(self::json($claims))
            ->addSignature($key, ['alg' => 'HS256', 'typ' => 'JWT', 'kid' => TestKeys::private($realm)->get('kid')])
            ->build();

        return (new CompactSerializer())->serialize($jws, 0);
    }

    /**
     * An unsecured JWT (`alg: none`, empty signature).
     *
     * @param array<string, mixed> $claims
     */
    public static function unsigned(array $claims): string
    {
        return self::base64Url(self::json(['alg' => 'none', 'typ' => 'JWT'])).'.'.self::base64Url(self::json($claims)).'.';
    }

    /**
     * The token with another payload but the original header and signature.
     *
     * @param array<string, mixed> $claims
     */
    public static function withPayload(string $token, array $claims): string
    {
        [$header, , $signature] = explode('.', $token);

        return $header.'.'.self::base64Url(self::json($claims)).'.'.$signature;
    }

    /**
     * @param array<string, mixed> $defaults
     * @param array<string, mixed> $overrides
     *
     * @return array<string, mixed>
     */
    private static function claims(array $defaults, array $overrides): array
    {
        $now = time();
        $claims = array_replace(['exp' => $now + 300, 'iat' => $now - 5, 'jti' => bin2hex(random_bytes(8))], $defaults, $overrides);

        return array_filter($claims, static fn (mixed $value): bool => null !== $value);
    }

    private static function json(mixed $value): string
    {
        return json_encode($value, \JSON_THROW_ON_ERROR | \JSON_UNESCAPED_SLASHES);
    }

    private static function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    public static function env(string $name): string
    {
        $value = $_SERVER[$name] ?? $_ENV[$name] ?? null;
        \assert(\is_string($value), \sprintf('%s is not set (.env.test).', $name));

        return $value;
    }
}
