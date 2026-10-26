<?php

declare(strict_types=1);

namespace App\Tests\Functional\Backoffice\Infrastructure\Http;

use App\Tests\Support\ApiTestCase;
use App\Tests\Support\Security\TestTokens;

/**
 * GET /admin/me: the administrator behind an admin token with the client role
 * "admin", registered just in time.
 */
final class AdminMeApiTest extends ApiTestCase
{
    public function testTheFirstRequestRegistersTheAdministrator(): void
    {
        $me = $this->admin('GET', '/admin/me');

        $this->assertStatus(200);
        self::assertIsString($me['id'] ?? null);
        self::assertSame(['id' => $me['id'], 'email' => 'ola@example.com', 'roles' => ['ROLE_ADMIN']], $me);
        self::assertSame([[
            'id' => $me['id'],
            'issuer' => TestTokens::env('OIDC_ADMIN_ISSUER'),
            'subject' => TestTokens::ADMIN_SUBJECT,
            'email' => 'ola@example.com',
            'status' => 'active',
        ]], $this->connection()->fetchAllAssociative('SELECT id, issuer, subject, email, status FROM backoffice_admin_user'));
    }

    public function testLaterRequestsFindTheSameAdministratorAndSyncTheEmail(): void
    {
        $first = $this->admin('GET', '/admin/me');

        $me = $this->request('GET', '/admin/me', token: TestTokens::admin(['email' => 'ola.kowalska@example.com']));

        self::assertSame(['id' => $first['id'], 'email' => 'ola.kowalska@example.com', 'roles' => ['ROLE_ADMIN']], $me);
        self::assertSame(1, $this->connection()->fetchOne('SELECT count(*) FROM backoffice_admin_user'));
    }

    public function testTheRoleComesFromEachToken(): void
    {
        $this->admin('GET', '/admin/me');
        $this->assertStatus(200);

        $this->request('GET', '/admin/me', token: TestTokens::admin(['resource_access' => null]));

        $this->assertProblem(403);
    }

    public function testABlockedAdministratorIsForbidden(): void
    {
        $this->admin('GET', '/admin/me');
        $this->connection()->executeStatement("UPDATE backoffice_admin_user SET status = 'blocked'");

        $this->admin('GET', '/admin/me');

        $this->assertProblem(403, 'Access denied.');
    }

    public function testTheApiKeepsNoSession(): void
    {
        $this->admin('GET', '/admin/me');

        $this->assertStatus(200);
        self::assertFalse($this->client->getResponse()->headers->has('Set-Cookie'));
    }
}
