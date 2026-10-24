<?php

declare(strict_types=1);

namespace App\Tests\Functional\Shared\Infrastructure\Http;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class HealthCheckControllerTest extends WebTestCase
{
    public function testReportsHealthyApplicationAndDatabase(): void
    {
        $client = static::createClient();

        $client->request('GET', '/health');

        self::assertResponseStatusCodeSame(200);
        self::assertResponseHeaderSame('Content-Type', 'application/json');
        self::assertJsonStringEqualsJsonString(
            '{"status":"ok","database":"ok"}',
            (string) $client->getResponse()->getContent(),
        );
    }

    public function testRejectsNonGetMethods(): void
    {
        $client = static::createClient();

        $client->request('POST', '/health');

        self::assertResponseStatusCodeSame(405);
    }
}
