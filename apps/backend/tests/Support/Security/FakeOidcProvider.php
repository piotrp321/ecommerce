<?php

declare(strict_types=1);

namespace App\Tests\Support\Security;

use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * The identity provider of the tests: the mock response factory of the HTTP
 * client (framework.http_client.mock_response_factory, test environment).
 * Serves the OIDC discovery document and the JWKS of both realms at the
 * discovery URLs of .env.test, like Keycloak, with the keys of TestKeys.
 *
 * The state is static, so tests can switch the provider off and count its
 * requests across kernel reboots; ApiTestCase resets it after every test.
 */
final class FakeOidcProvider
{
    public const string AVAILABLE = 'available';
    /** Connection refused. */
    public const string UNREACHABLE = 'unreachable';
    /** Answers with an error status. */
    public const string FAILING = 'failing';
    /** Accepts the connection but sends nothing (idle timeout). */
    public const string SILENT = 'silent';

    public const int JWKS_MAX_AGE = 300;

    public static string $mode = self::AVAILABLE;

    /** @var list<array{method: string, url: string, timeout: mixed, max_duration: mixed}> */
    public static array $requests = [];

    public static function reset(): void
    {
        self::$mode = self::AVAILABLE;
        self::$requests = [];
    }

    /**
     * Number of JWKS downloads so far.
     */
    public static function jwksRequests(): int
    {
        return \count(array_filter(self::$requests, static fn (array $request): bool => str_ends_with($request['url'], '/protocol/openid-connect/certs')));
    }

    /**
     * @param array<string, mixed> $options
     */
    public function __invoke(string $method, string $url, array $options): MockResponse
    {
        self::$requests[] = ['method' => $method, 'url' => $url, 'timeout' => $options['timeout'] ?? null, 'max_duration' => $options['max_duration'] ?? null];

        switch (self::$mode) {
            case self::UNREACHABLE:
                return new MockResponse('', ['error' => 'Connection refused']);
            case self::FAILING:
                return new MockResponse('{"error":"unavailable"}', ['http_code' => 503]);
            case self::SILENT:
                return new MockResponse((static function (): \Generator {
                    yield '';
                })());
        }

        foreach ([TestKeys::STORE => 'OIDC_STORE', TestKeys::ADMIN => 'OIDC_ADMIN'] as $realm => $prefix) {
            $base = TestTokens::env($prefix.'_DISCOVERY_URL');
            if ($url === $base.'.well-known/openid-configuration') {
                return self::json([
                    'issuer' => TestTokens::env($prefix.'_ISSUER'),
                    'jwks_uri' => $base.'protocol/openid-connect/certs',
                    'id_token_signing_alg_values_supported' => ['RS256'],
                ]);
            }
            if ($url === $base.'protocol/openid-connect/certs') {
                return self::json(['keys' => [TestKeys::public($realm)->all()]], ['Cache-Control' => 'max-age='.self::JWKS_MAX_AGE]);
            }
        }

        return new MockResponse('{"error":"not found"}', ['http_code' => 404]);
    }

    /**
     * @param array<string, string> $headers
     */
    private static function json(mixed $body, array $headers = []): MockResponse
    {
        $headers['Content-Type'] = 'application/json';

        return new MockResponse(json_encode($body, \JSON_THROW_ON_ERROR | \JSON_UNESCAPED_SLASHES), [
            'response_headers' => array_map(static fn (string $name, string $value): string => $name.': '.$value, array_keys($headers), $headers),
        ]);
    }
}
