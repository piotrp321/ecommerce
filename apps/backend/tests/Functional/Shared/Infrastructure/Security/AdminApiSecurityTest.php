<?php

declare(strict_types=1);

namespace App\Tests\Functional\Shared\Infrastructure\Security;

use App\Shared\Infrastructure\Security\AdminApiTokenHandler;
use App\Tests\Support\ApiTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Security\Core\User\InMemoryUser;

final class AdminApiSecurityTest extends ApiTestCase
{
    private const string PRODUCT = '0192f0c4-7c2a-7c51-9b1e-2f3c4d5e6f70';

    /** @var array{mixed, mixed}|null */
    private ?array $originalToken = null;

    protected function tearDown(): void
    {
        if (null !== $this->originalToken) {
            [$_SERVER['ADMIN_API_TOKEN'], $_ENV['ADMIN_API_TOKEN']] = $this->originalToken;
        }
        parent::tearDown();
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function adminEndpoints(): iterable
    {
        foreach ([
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
        $this->client->request($method, $uri, server: ['CONTENT_TYPE' => 'application/json'], content: '{}');

        $this->assertProblem(401);
        self::assertSame('Bearer', $this->client->getResponse()->headers->get('WWW-Authenticate'));
    }

    #[DataProvider('adminEndpoints')]
    public function testRejectsAWrongToken(string $method, string $uri): void
    {
        $this->client->request($method, $uri, server: [
            'HTTP_AUTHORIZATION' => 'Bearer '.strrev(self::adminToken()),
            'CONTENT_TYPE' => 'application/json',
        ], content: '{}');

        $this->assertProblem(401, 'invalid');
        self::assertSame('Bearer error="invalid_token"', $this->client->getResponse()->headers->get('WWW-Authenticate'));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function invalidAuthorizationHeaders(): iterable
    {
        yield 'token prefix' => ['Bearer {token-prefix}'];
        yield 'token with suffix' => ['Bearer {token}x'];
        yield 'basic scheme' => ['Basic {token}'];
        yield 'token without scheme' => ['{token}'];
        yield 'empty bearer' => ['Bearer '];
    }

    #[DataProvider('invalidAuthorizationHeaders')]
    public function testRejectsMalformedCredentials(string $header): void
    {
        $header = strtr($header, ['{token-prefix}' => substr(self::adminToken(), 0, 32), '{token}' => self::adminToken()]);

        $this->client->request('GET', '/admin/catalog/products', server: ['HTTP_AUTHORIZATION' => $header]);

        $this->assertProblem(401);
    }

    public function testAcceptsTheConfiguredToken(): void
    {
        $this->admin('GET', '/admin/catalog/products');

        $this->assertStatus(200);
    }

    public function testDeniesEverythingWithoutAConfiguredToken(): void
    {
        $this->configureToken('');

        $this->client->request('GET', '/admin/catalog/products', server: ['HTTP_AUTHORIZATION' => 'Bearer ']);
        $this->assertProblem(401);
        $this->client->request('GET', '/admin/catalog/products', server: ['HTTP_AUTHORIZATION' => 'Bearer x']);
        $this->assertProblem(401);
    }

    public function testDeniesEverythingWhenTheTokenIsNotConfiguredAtAll(): void
    {
        $this->configureToken(null);

        $this->client->request('GET', '/admin/catalog/products', server: ['HTTP_AUTHORIZATION' => 'Bearer x']);

        $this->assertProblem(401);
    }

    public function testDeniesEverythingWithATooShortConfiguredToken(): void
    {
        $shortToken = str_repeat('a', AdminApiTokenHandler::MIN_TOKEN_LENGTH - 1);
        $this->configureToken($shortToken);

        $this->client->request('GET', '/admin/catalog/products', server: ['HTTP_AUTHORIZATION' => 'Bearer '.$shortToken]);

        $this->assertProblem(401);
    }

    public function testForbidsAnAuthenticatedCallerWithoutTheAdminRole(): void
    {
        $this->client->loginUser(new InMemoryUser('customer', null, ['ROLE_USER']), 'admin_api');

        $this->client->request('POST', '/admin/catalog/categories', server: ['CONTENT_TYPE' => 'application/json'], content: '{"slug":"tea","name":"Tea"}');

        $this->assertProblem(403);
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

    private function configureToken(?string $token): void
    {
        $this->originalToken = [$_SERVER['ADMIN_API_TOKEN'] ?? null, $_ENV['ADMIN_API_TOKEN'] ?? null];
        if (null === $token) {
            unset($_SERVER['ADMIN_API_TOKEN'], $_ENV['ADMIN_API_TOKEN']);
        } else {
            $_SERVER['ADMIN_API_TOKEN'] = $_ENV['ADMIN_API_TOKEN'] = $token;
        }
        self::ensureKernelShutdown();
        $this->client = static::createClient();
    }
}
