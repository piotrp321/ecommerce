<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Http;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception as DbalException;
use Psr\Log\LoggerInterface;
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
        private LoggerInterface $logger,
    ) {
    }

    #[Route('/health', name: 'health_check', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        try {
            $this->connection->executeQuery('SELECT 1');
        } catch (DbalException $exception) {
            // Only database errors mean "database unavailable"; anything else is an
            // application error and must surface as such (HTTP 500).
            $this->logger->error('Health check: database is unavailable: {reason}', [
                'reason' => $exception->getMessage(),
                'exception' => $exception,
            ]);

            return new JsonResponse(
                ['status' => 'error', 'database' => 'unavailable'],
                Response::HTTP_SERVICE_UNAVAILABLE,
            );
        }

        return new JsonResponse(['status' => 'ok', 'database' => 'ok']);
    }
}
