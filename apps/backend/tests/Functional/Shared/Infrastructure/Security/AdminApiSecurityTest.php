<?php

declare(strict_types=1);

namespace App\Tests\Functional\Shared\Infrastructure\Security;

use App\Tests\Support\ApiTestCase;
use App\Tests\Support\Security\InvalidTokens;
use App\Tests\Support\Security\TestKeys;
use App\Tests\Support\Security\TestTokens;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Firewall admin_api (^/admin/): access tokens of the admin realm, the
 * administrator role only from the admin API client's role "admin".
 */
final class AdminApiSecurityTest extends ApiTestCase
{
    private const string PRODUCT = '0192f0c4-7c2a-7c51-9b1e-2f3c4d5e6f70';

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function adminEndpoints(): iterable
    {
        foreach ([
            ['GET', '/admin/me'],
            ['GET', '/admin/catalog/products'],
            ['POST', '/admin/catalog/products'],
            ['GET', '/admin/catalog/products/'.self::PRODUCT],
            ['PUT', '/admin/catalog/products/'.self::PRODUCT],
            ['POST', '/admin/catalog/products/'.self::PRODUCT.'/activate'],
            ['POST', '/admin/catalog/products/'.self::PRODUCT.'/deactivate'],
            ['GET', '/admin/catalog/categories'],
            ['POST', '/admin/catalog/categories'],
            ['GET', '/admin/catalog/categories/'.self::PRODUCT],
            ['PUT', '/admin/catalog/categories/'.self::PRODUCT],
            ['DELETE', '/admin/catalog/categories/'.self::PRODUCT],
            ['POST', '/admin/catalog/categories/'.self::PRODUCT.'/move'],
            ['GET', '/admin/inventory/stock/'.self::PRODUCT],
            ['PUT', '/admin/inventory/stock/'.self::PRODUCT],
        ] as [$method, $uri]) {
            yield $method.' '.$uri => [$method, $uri];
        }
    }

    #[DataProvider('adminEndpoints')]
    public function testRequiresABearerToken(string $method, string $uri): void
    {
        $this->request($method, $uri, 'GET' === $method ? null : []);

        $this->assertProblem(401);
        self::assertSame('Bearer', $this->client->getResponse()->headers->get('WWW-Authenticate'));
    }

    #[DataProvider('adminEndpoints')]
    public function testForbidsAValidTokenWithoutTheAdministratorRole(string $method, string $uri): void
    {
        $this->request($method, $uri, 'GET' === $method ? null : [], token: TestTokens::admin(['resource_access' => null]));

        $this->assertProblem(403, 'Access denied.');
        self::assertSame('Bearer error="insufficient_scope"', $this->client->getResponse()->headers->get('WWW-Authenticate'));
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
        $token = InvalidTokens::make(TestKeys::ADMIN, $case);
        $this->request('GET', '/admin/catalog/products', token: $token);

        $this->assertProblem(401, 'The bearer token is invalid.');
        self::assertSame('Bearer error="invalid_token"', $this->client->getResponse()->headers->get('WWW-Authenticate'));
        self::assertSame(0, $this->adminUsers(), 'A rejected token registers nobody.');
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function malformedAuthorizationHeaders(): iterable
    {
        yield 'basic scheme' => ['Basic {token}'];
        yield 'token without scheme' => ['{token}'];
        yield 'empty bearer' => ['Bearer '];
    }

    #[DataProvider('malformedAuthorizationHeaders')]
    public function testRejectsMalformedCredentials(string $header): void
    {
        $this->client->request('GET', '/admin/catalog/products', server: [
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_AUTHORIZATION' => strtr($header, ['{token}' => TestTokens::admin()]),
        ]);

        $this->assertResponseMatchesContract('GET', '/admin/catalog/products');
        $this->assertProblem(401);
        self::assertSame(0, $this->adminUsers());
    }

    public function testAcceptsAnAdministratorToken(): void
    {
        $this->admin('GET', '/admin/catalog/products');

        $this->assertStatus(200);
    }

    /**
     * @return iterable<string, array{array<string, mixed>}>
     */
    public static function tokensWithoutTheAdministratorRole(): iterable
    {
        yield 'no client roles' => [['resource_access' => null]];
        yield 'other roles of the admin API client' => [['resource_access' => ['admin-api' => ['roles' => ['viewer']]]]];
        yield 'role "admin" of another client' => [['resource_access' => ['admin-bff' => ['roles' => ['admin']], 'account' => ['roles' => ['admin']]]]];
        yield 'only the realm role "admin"' => [['resource_access' => null, 'realm_access' => ['roles' => ['admin', 'default-roles-admin']]]];
        yield 'Symfony role name as a client role' => [['resource_access' => ['admin-api' => ['roles' => ['ROLE_ADMIN']]]]];
    }

    /**
     * @param array<string, mixed> $claims
     */
    #[DataProvider('tokensWithoutTheAdministratorRole')]
    public function testForbidsATokenWithoutTheClientRoleAdmin(array $claims): void
    {
        $this->request('POST', '/admin/catalog/categories', ['slug' => 'tea', 'name' => 'Tea'], token: TestTokens::admin($claims));

        $this->assertProblem(403, 'Access denied.');
        self::assertSame('Bearer error="insufficient_scope"', $this->client->getResponse()->headers->get('WWW-Authenticate'));
        self::assertSame(0, $this->adminUsers(), 'Only administrators are registered.');
        self::assertSame(0, $this->connection()->fetchOne('SELECT count(*) FROM catalog_category'));
    }

    public function testForbidsALocallyBlockedAdministrator(): void
    {
        $this->admin('GET', '/admin/me');
        $this->assertStatus(200);
        $this->connection()->executeStatement("UPDATE backoffice_admin_user SET status = 'blocked'");

        $this->admin('POST', '/admin/catalog/categories', ['slug' => 'tea', 'name' => 'Tea']);

        $this->assertProblem(403, 'Access denied.');
        self::assertSame('Bearer error="insufficient_scope"', $this->client->getResponse()->headers->get('WWW-Authenticate'));
        self::assertSame(0, $this->connection()->fetchOne('SELECT count(*) FROM catalog_category'));
    }

    public function testACustomerTokenIsNotAnAdministratorToken(): void
    {
        $this->request('GET', '/admin/catalog/products', token: TestTokens::customer());

        $this->assertProblem(401);
        self::assertSame(0, $this->adminUsers());
    }

    public function testThePublicApiNeedsNoToken(): void
    {
        $this->request('GET', '/catalog/products');

        $this->assertStatus(200);
    }

    /**
     * Guards against a write endpoint added outside the protected /admin/ prefix.
     */
    public function testEveryWriteEndpointIsAdministrative(): void
    {
        $router = self::getContainer()->get('router');

        foreach ($router->getRouteCollection() as $name => $route) {
            $writes = array_diff($route->getMethods() ?: ['ANY'], ['GET', 'HEAD']);
            if ([] !== $writes && !str_starts_with($name, '_')) {
                self::assertStringStartsWith('/admin/', $route->getPath(), \sprintf('Route "%s" changes data outside /admin/.', $name));
            }
        }
    }

    private function adminUsers(): int
    {
        $count = $this->connection()->fetchOne('SELECT count(*) FROM backoffice_admin_user');
        \assert(\is_int($count));

        return $count;
    }
}
