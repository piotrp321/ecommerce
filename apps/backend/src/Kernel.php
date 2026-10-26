<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\DependencyInjection\Compiler\CompilerPassInterface;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;

class Kernel extends BaseKernel implements CompilerPassInterface
{
    use MicroKernelTrait;

    /**
     * The OIDC discovery cache (cache.oidc, config/packages/cache.yaml) is used
     * without the stampede lock of Symfony Cache (LockRegistry, active outside the
     * CLI, e.g. in FrankenPHP). With the lock, concurrent requests wait in turn
     * for the request downloading the keys; a failed download is not cached, so
     * with a hanging identity provider each of them would retry after the
     * previous one and the n-th request would get its 401 only after n timeouts.
     * Without the lock every request makes its own bounded attempt.
     */
    public function process(ContainerBuilder $container): void
    {
        $container->getDefinition('cache.oidc')->addMethodCall('setCallbackWrapper', [null]);
    }

    /**
     * @return list<string> An array of allowed values for APP_ENV
     */
    private function getAllowedEnvs(): array
    {
        return ['prod', 'dev', 'test'];
    }
}
