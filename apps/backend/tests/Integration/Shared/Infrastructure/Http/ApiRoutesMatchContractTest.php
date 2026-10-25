<?php

declare(strict_types=1);

namespace App\Tests\Integration\Shared\Infrastructure\Http;

use App\Tests\Support\Contract\OpenApiContract;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * Every Symfony route is a documented operation of docs/api/openapi.yaml, and every
 * documented operation has a route: no undocumented endpoints, no stale contract.
 */
final class ApiRoutesMatchContractTest extends KernelTestCase
{
    public function testRoutesAndContractOperationsAreTheSame(): void
    {
        $router = self::getContainer()->get('router');

        $routes = [];
        foreach ($router->getRouteCollection() as $name => $route) {
            self::assertNotSame([], $route->getMethods(), \sprintf('Route "%s" must declare its HTTP methods.', $name));
            foreach ($route->getMethods() as $method) {
                $routes[] = $method.' '.OpenApiContract::normalisePath($route->getPath());
            }
        }
        sort($routes);

        $operations = OpenApiContract::get()->operations();

        self::assertSame([], array_values(array_diff($routes, $operations)), 'Routes missing from docs/api/openapi.yaml');
        self::assertSame([], array_values(array_diff($operations, $routes)), 'Documented operations without a route');
    }
}
