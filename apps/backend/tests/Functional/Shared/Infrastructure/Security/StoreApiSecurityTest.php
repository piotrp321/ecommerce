<?php

declare(strict_types=1);

namespace App\Tests\Functional\Shared\Infrastructure\Security;

use App\Tests\Support\ApiTestCase;
use App\Tests\Support\Security\FakeOidcProvider;
use App\Tests\Support\Security\InvalidTokens;
use App\Tests\Support\Security\TestKeys;
use App\Tests\Support\Security\TestTokens;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Firewall store_api (everything outside /admin/): the public API ignores any
 * token, every other path requires a customer token of the store realm.
 */
final class StoreApiSecurityTest extends ApiTestCase
{
    /** @var array<string, string|null> */
    private array $environment = [];

    protected function tearDown(): void
    {
        foreach ($this->environment as $name => $value) {
            if (null === $value) {
                unset($_SERVER[$name], $_ENV[$name]);
            } else {
                $_SERVER[$name] = $_ENV[$name] = $value;
            }
        }
        parent::tearDown();
    }

    /**
     * @return iterable<string, array{string, string|null}>
     */
    public static function publicEndpointsAndTokens(): iterable
    {
        foreach (['/health', '/catalog/products', '/catalog/categories'] as $uri) {
            yield $uri.' without a token' => [$uri, null];
            yield $uri.' with a garbage token' => [$uri, 'garbage'];
            yield $uri.' with an expired token' => [$uri, 'expired'];
        }
    }

    #[DataProvider('publicEndpointsAndTokens')]
    public function testThePublicApiIgnoresTokens(string $uri, ?string $token): void
    {
        $token = 'expired' === $token ? TestTokens::customer(['iat' => time() - 600, 'exp' => time() - 60]) : $token;

        $this->request('GET', $uri, token: $token);

        $this->assertStatus(200);
        self::assertSame([], FakeOidcProvider::$requests, 'Public requests do not validate tokens.');
    }

    public function testAProductIsPublicWithAGarbageToken(): void
    {
        $this->createProduct(['slug' => 'green-tea']);

        $this->request('GET', '/catalog/products/green-tea', token: 'garbage');

        $this->assertStatus(200);
    }

    /**
     * Public requests must not depend on the identity provider configuration.
     */
    public function testThePublicApiWorksWithoutTheIdentityProviderConfiguration(): void
    {
        foreach (['OIDC_STORE_ISSUER', 'OIDC_STORE_DISCOVERY_URL', 'OIDC_STORE_AUDIENCE', 'OIDC_STORE_CLIENTS'] as $name) {
            $value = $_SERVER[$name] ?? null;
            $this->environment[$name] = \is_string($value) ? $value : null;
            unset($_SERVER[$name], $_ENV[$name]);
        }
        self::ensureKernelShutdown();
        $this->client = static::createClient();

        $this->request('GET', '/catalog/products', token: 'garbage');
        $this->assertStatus(200);
        $this->request('GET', '/health');
        $this->assertStatus(200);
    }

    public function testTheCustomerApiRequiresABearerToken(): void
    {
        $this->request('GET', '/me');

        $this->assertProblem(401, 'A bearer token is required.');
        self::assertSame('Bearer', $this->client->getResponse()->headers->get('WWW-Authenticate'));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function invalidTokens(): iterable
    {
        return InvalidTokens::cases();
    }

    #[DataProvider('invalidTokens')]
    public function testRejectsAnInvalidToken(string $case): void
    {
        $token = InvalidTokens::make(TestKeys::STORE, $case);
        $this->request('GET', '/me', token: $token);

        $this->assertProblem(401, 'The bearer token is invalid.');
        self::assertSame('Bearer error="invalid_token"', $this->client->getResponse()->headers->get('WWW-Authenticate'));
        self::assertSame(0, $this->connection()->fetchOne('SELECT count(*) FROM customers_customer'), 'A rejected token registers nobody.');
    }

    public function testAnAdministratorTokenIsNotACustomerToken(): void
    {
        $this->request('GET', '/me', token: TestTokens::admin());

        $this->assertProblem(401);
        self::assertSame(0, $this->connection()->fetchOne('SELECT count(*) FROM customers_customer'));
    }

    public function testAcceptsACustomerToken(): void
    {
        $this->customer('GET', '/me');

        $this->assertStatus(200);
    }
}
