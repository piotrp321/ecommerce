<?php

declare(strict_types=1);

namespace App\Tests\Functional\Customers\Infrastructure\Http;

use App\Tests\Support\ApiTestCase;
use App\Tests\Support\Security\TestTokens;

/**
 * GET /me: the customer behind a store token, registered just in time.
 */
final class MeApiTest extends ApiTestCase
{
    public function testTheFirstRequestRegistersTheCustomer(): void
    {
        $me = $this->customer('GET', '/me');

        $this->assertStatus(200);
        self::assertIsString($me['id'] ?? null);
        self::assertSame(['id' => $me['id'], 'email' => 'anna@example.com', 'emailVerified' => true], $me);
        self::assertSame([[
            'id' => $me['id'],
            'issuer' => TestTokens::env('OIDC_STORE_ISSUER'),
            'subject' => TestTokens::CUSTOMER_SUBJECT,
            'email' => 'anna@example.com',
            'email_verified' => true,
        ]], $this->connection()->fetchAllAssociative('SELECT id, issuer, subject, email, email_verified FROM customers_customer'));
    }

    public function testLaterRequestsFindTheSameCustomer(): void
    {
        $first = $this->customer('GET', '/me');
        $second = $this->customer('GET', '/me');

        self::assertSame($first['id'], $second['id']);
        self::assertSame(1, $this->connection()->fetchOne('SELECT count(*) FROM customers_customer'));
    }

    public function testSyncsTheEmailFromTheToken(): void
    {
        $first = $this->customer('GET', '/me', ['email' => 'anna@example.com', 'email_verified' => false]);

        $me = $this->customer('GET', '/me', ['email' => 'anna.nowak@example.com', 'email_verified' => true]);

        self::assertSame(['id' => $first['id'], 'email' => 'anna.nowak@example.com', 'emailVerified' => true], $me);
        self::assertSame(
            [['email' => 'anna.nowak@example.com', 'email_verified' => true]],
            $this->connection()->fetchAllAssociative('SELECT email, email_verified FROM customers_customer'),
        );
    }

    public function testACustomerWithoutAnEmail(): void
    {
        $me = $this->customer('GET', '/me', ['email' => null, 'email_verified' => null]);

        $this->assertStatus(200);
        self::assertNull($me['email']);
        self::assertFalse($me['emailVerified']);
    }

    public function testEachSubjectIsAnotherCustomer(): void
    {
        $anna = $this->customer('GET', '/me');
        $jan = $this->customer('GET', '/me', ['sub' => 'c0ffee00-1111-4222-8333-444455556666', 'email' => 'jan@example.com']);

        self::assertNotSame($anna['id'], $jan['id']);
        self::assertSame(2, $this->connection()->fetchOne('SELECT count(*) FROM customers_customer'));
    }

    public function testTheApiKeepsNoSession(): void
    {
        $this->customer('GET', '/me');

        $this->assertStatus(200);
        self::assertFalse($this->client->getResponse()->headers->has('Set-Cookie'));
        self::assertSame([], $this->client->getResponse()->headers->getCookies());
    }
}
