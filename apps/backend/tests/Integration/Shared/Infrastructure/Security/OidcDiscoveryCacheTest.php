<?php

declare(strict_types=1);

namespace App\Tests\Integration\Shared\Infrastructure\Security;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Cache\Adapter\AbstractAdapter;
use Symfony\Component\Cache\Adapter\FilesystemAdapter;
use Symfony\Component\Cache\LockRegistry;

/**
 * cache.oidc must not use the stampede lock (LockRegistry). Outside the CLI
 * (FrankenPHP) Symfony Cache would otherwise make concurrent requests wait for
 * the one downloading the keys; with a hanging identity provider each waiting
 * request would then retry in turn, so the n-th 401 would come after n timeouts.
 *
 * PHPUnit runs in the CLI, where Symfony Cache never locks, so the test checks
 * the configured callback wrapper instead of timing concurrent requests: without
 * the configuration (src/Kernel.php) the wrapper is not set until the first get()
 * and then becomes LockRegistry::compute() under FrankenPHP.
 */
final class OidcDiscoveryCacheTest extends KernelTestCase
{
    public function testTheDiscoveryCacheIsFilesystemWithoutTheStampedeLock(): void
    {
        $pool = self::getContainer()->get('cache.oidc');
        self::assertSame(FilesystemAdapter::class, $pool::class, 'The same adapter as in production.');

        $property = new \ReflectionProperty(AbstractAdapter::class, 'callbackWrapper');
        self::assertTrue($property->isInitialized($pool), 'The callback wrapper is configured when the pool is created.');
        $wrapper = $property->getValue($pool);

        self::assertInstanceOf(\Closure::class, $wrapper);
        self::assertNotSame(LockRegistry::class, (new \ReflectionFunction($wrapper))->getClosureScopeClass()?->getName());
    }
}
