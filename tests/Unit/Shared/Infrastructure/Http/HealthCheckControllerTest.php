<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Infrastructure\Http;

use App\Shared\Infrastructure\Http\HealthCheckController;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;

final class HealthCheckControllerTest extends TestCase
{
    public function testReportsUnavailableDatabaseWhenQueryFails(): void
    {
        $connection = $this->createStub(Connection::class);
        $connection->method('executeQuery')->willThrowException(new \RuntimeException('Connection refused'));

        $response = (new HealthCheckController($connection))();

        self::assertSame(503, $response->getStatusCode());
        self::assertJsonStringEqualsJsonString(
            '{"status":"error","database":"unavailable"}',
            (string) $response->getContent(),
        );
    }
}
