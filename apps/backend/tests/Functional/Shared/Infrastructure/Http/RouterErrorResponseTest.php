<?php

declare(strict_types=1);

namespace App\Tests\Functional\Shared\Infrastructure\Http;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Requests that match no route get RFC 9457 problem details (JSON clients) without
 * internal routing details: the backend runs behind the edge, so Symfony's router
 * messages would disclose the internal scheme, host and the path without /api.
 */
final class RouterErrorResponseTest extends WebTestCase
{
    public function testUnknownPathOfAJsonRequestIsAProblemWithoutRoutingDetails(): void
    {
        $client = static::createClient();

        $client->request('GET', '/admin/catalog/products/not-a-uuid', server: ['HTTP_ACCEPT' => 'application/json']);

        self::assertResponseStatusCodeSame(404);
        self::assertResponseHeaderSame('Content-Type', 'application/problem+json');
        self::assertJsonStringEqualsJsonString(
            '{"type":"about:blank","title":"Not Found","status":404,"detail":"Not Found"}',
            (string) $client->getResponse()->getContent(),
        );
    }

    public function testWrongMethodOfAJsonRequestIsAProblemWithTheAllowHeader(): void
    {
        $client = static::createClient();

        $client->request('POST', '/health', server: ['HTTP_ACCEPT' => 'application/json']);

        self::assertResponseStatusCodeSame(405);
        self::assertResponseHeaderSame('Content-Type', 'application/problem+json');
        self::assertResponseHeaderSame('Allow', 'GET');
        $content = (string) $client->getResponse()->getContent();
        self::assertStringNotContainsString('http', $content);
        self::assertStringContainsString('"detail":"Method Not Allowed"', $content);
    }

    public function testHtmlClientsStillGetTheHtmlErrorPage(): void
    {
        $client = static::createClient();

        $client->request('GET', '/admin/catalog/products/not-a-uuid', server: ['HTTP_ACCEPT' => 'text/html']);

        self::assertResponseStatusCodeSame(404);
        self::assertStringStartsWith('text/html', (string) $client->getResponse()->headers->get('Content-Type'));
    }
}
