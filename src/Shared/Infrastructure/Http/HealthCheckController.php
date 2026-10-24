<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Http;

use Doctrine\DBAL\Connection;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Reports whether the application can serve requests and reach its database.
 */
#[AsController]
final readonly class HealthCheckController
{
    public function __construct(
        private Connection $connection,
    ) {
    }

    #[Route('/health', name: 'health_check', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        try {
            $this->connection->executeQuery('SELECT 1');
        } catch (\Throwable) {
            return new JsonResponse(
                ['status' => 'error', 'database' => 'unavailable'],
                Response::HTTP_SERVICE_UNAVAILABLE,
            );
        }

        return new JsonResponse(['status' => 'ok', 'database' => 'ok']);
    }
}
