<?php

declare(strict_types=1);

namespace App\Tests\Support;

use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * HTTP tests of the JSON API on an emptied test database.
 */
abstract class ApiTestCase extends WebTestCase
{
    protected KernelBrowser $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->client = static::createClient();
        Database::reset(static::getContainer()->get('doctrine.dbal.default_connection'));
    }

    /**
     * @param array<mixed>|null $body
     *
     * @return array<mixed>
     */
    protected function request(string $method, string $uri, ?array $body = null, bool $admin = false): array
    {
        $server = ['HTTP_ACCEPT' => 'application/json'];
        if (null !== $body) {
            $server['CONTENT_TYPE'] = 'application/json';
        }
        if ($admin) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.self::adminToken();
        }
        $this->client->request($method, $uri, server: $server, content: null === $body ? null : json_encode($body, \JSON_THROW_ON_ERROR));

        return $this->responseJson();
    }

    /**
     * @param array<mixed>|null $body
     *
     * @return array<mixed>
     */
    protected function admin(string $method, string $uri, ?array $body = null): array
    {
        return $this->request($method, $uri, $body, admin: true);
    }

    /**
     * @return array<mixed>
     */
    protected function responseJson(): array
    {
        $content = (string) $this->client->getResponse()->getContent();
        if ('' === $content) {
            return [];
        }
        $json = json_decode($content, true, flags: \JSON_THROW_ON_ERROR);
        \assert(\is_array($json));

        return $json;
    }

    /**
     * Value at a path in decoded JSON, e.g. at($tree, 'items', 0, 'children', 0, 'id').
     *
     * @param array<mixed> $json
     */
    protected static function at(array $json, string|int ...$path): mixed
    {
        $value = $json;
        foreach ($path as $key) {
            self::assertIsArray($value);
            self::assertArrayHasKey($key, $value);
            $value = $value[$key];
        }

        return $value;
    }

    protected function assertStatus(int $status): void
    {
        self::assertSame($status, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
    }

    /**
     * Asserts an RFC 9457 problem response.
     */
    protected function assertProblem(int $status, ?string $detail = null): void
    {
        $this->assertStatus($status);
        self::assertSame('application/problem+json', $this->client->getResponse()->headers->get('Content-Type'));
        $problem = $this->responseJson();
        self::assertSame($status, $problem['status'] ?? null);
        if (null !== $detail) {
            self::assertIsString($problem['detail'] ?? null);
            self::assertStringContainsString($detail, $problem['detail']);
        }
    }

    protected static function adminToken(): string
    {
        $token = $_SERVER['ADMIN_API_TOKEN'] ?? null;
        \assert(\is_string($token));

        return $token;
    }

    /**
     * Creates an active product through the admin API and returns its id.
     *
     * @param array<string, mixed> $overrides
     */
    protected function createProduct(array $overrides = [], bool $active = true, ?int $onHand = null): string
    {
        $product = $this->admin('POST', '/admin/catalog/products', $overrides + [
            'sku' => 'TEA-001',
            'slug' => 'green-tea',
            'name' => 'Green tea',
            'description' => 'Loose leaf',
            'netPrice' => '8.13',
            'vatRate' => 23,
            'categoryId' => null,
        ]);
        $this->assertStatus(201);
        \assert(\is_string($product['id']));
        if ($active) {
            $this->admin('POST', '/admin/catalog/products/'.$product['id'].'/activate');
            $this->assertStatus(200);
        }
        if (null !== $onHand) {
            $this->admin('PUT', '/admin/inventory/stock/'.$product['id'], ['onHand' => $onHand]);
            $this->assertStatus(200);
        }

        return $product['id'];
    }

    protected function createCategory(string $slug, string $name, ?string $parentId = null): string
    {
        $category = $this->admin('POST', '/admin/catalog/categories', ['slug' => $slug, 'name' => $name, 'parentId' => $parentId]);
        $this->assertStatus(201);
        \assert(\is_string($category['id']));

        return $category['id'];
    }
}
