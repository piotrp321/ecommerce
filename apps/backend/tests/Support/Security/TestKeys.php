<?php

declare(strict_types=1);

namespace App\Tests\Support\Security;

use Jose\Component\Core\JWK;
use Jose\Component\KeyManagement\JWKFactory;

/**
 * Signing keys of the fake identity provider, generated once per test run
 * (tests/bootstrap.php): one RSA key per realm, published by FakeOidcProvider,
 * and a foreign key that no realm publishes.
 */
final class TestKeys
{
    public const string STORE = 'store';
    public const string ADMIN = 'admin';
    public const string FOREIGN = 'foreign';

    /** @var array<string, array{JWK, string}> name => [private JWK, public key PEM] */
    private static array $keys = [];

    public static function generate(): void
    {
        foreach ([self::STORE, self::ADMIN, self::FOREIGN] as $name) {
            $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => \OPENSSL_KEYTYPE_RSA]);
            $details = false === $key ? false : openssl_pkey_get_details($key);
            if (false === $key || !openssl_pkey_export($key, $privatePem) || !\is_string($privatePem) || !\is_array($details) || !\is_string($details['key'] ?? null)) {
                throw new \RuntimeException('Cannot generate an RSA test key.');
            }

            self::$keys[$name] = [
                JWKFactory::createFromKey($privatePem, null, ['kid' => $name.'-key-1', 'alg' => 'RS256', 'use' => 'sig']),
                $details['key'],
            ];
        }
    }

    public static function private(string $name): JWK
    {
        return self::key($name)[0];
    }

    /**
     * The public key as published in the realm's JWKS.
     */
    public static function public(string $name): JWK
    {
        return self::key($name)[0]->toPublic();
    }

    public static function publicPem(string $name): string
    {
        return self::key($name)[1];
    }

    /**
     * @return array{JWK, string}
     */
    private static function key(string $name): array
    {
        return self::$keys[$name] ?? throw new \LogicException(\sprintf('No test key "%s"; tests/bootstrap.php generates them.', $name));
    }
}
