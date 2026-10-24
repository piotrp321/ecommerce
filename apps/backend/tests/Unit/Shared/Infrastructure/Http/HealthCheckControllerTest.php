<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Infrastructure\Http;

use App\Shared\Infrastructure\Http\HealthCheckController;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Driver\PDO\Exception as PdoDriverException;
use Doctrine\DBAL\Exception\ConnectionException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

final class HealthCheckControllerTest extends TestCase
{
    public function testReportsUnavailableDatabaseAndLogsTheCause(): void
    {
        $exception = new ConnectionException(PdoDriverException::new(new \PDOException('Connection refused')), null);
        $connection = $this->createStub(Connection::class);
        $connection->method('executeQuery')->willThrowException($exception);

        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())
            ->method('error')
            ->with('Health check: database is unavailable: {reason}', [
                'reason' => 'An exception occurred in the driver: Connection refused',
                'exception' => $exception,
            ]);

        $response = (new HealthCheckController($connection, $logger))();

        self::assertSame(503, $response->getStatusCode());
        self::assertJsonStringEqualsJsonString(
            '{"status":"error","database":"unavailable"}',
            (string) $response->getContent(),
        );
    }

    public function testDoesNotMaskApplicationErrorsAsDatabaseOutage(): void
    {
        $connection = $this->createStub(Connection::class);
        $connection->method('executeQuery')->willThrowException(new \LogicException('Bug in application code'));

        $this->expectException(\LogicException::class);

        (new HealthCheckController($connection, new NullLogger()))();
    }
}
