<?php

declare(strict_types=1);

namespace App\Tests\Functional\Shared\Infrastructure\Security;

use App\Tests\Support\ApiTestCase;
use App\Tests\Support\Security\FakeOidcProvider;
use App\Tests\Support\Security\TestTokens;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Keys of both realms come from OIDC discovery: cached in cache.oidc across
 * requests, and an unavailable identity provider means 401 (never 500).
 */
final class OidcDiscoveryTest extends ApiTestCase
{
    /**
     * Discovery makes two sequential requests (the discovery document, then the
     * JWKS), each limited to 1.5 s: at most 3 s per firewall before the 401.
     */
    private const float MAX_DURATION = 1.5;
    private const float IDLE_TIMEOUT = 1.0;

    public function testDownloadsTheKeysOfARealmOnce(): void
    {
        $this->customer('GET', '/me');
        $this->assertStatus(200);
        $this->customer('GET', '/me', ['email' => 'anna.nowak@example.com']);
        $this->assertStatus(200);
        $this->request('GET', '/me', token: TestTokens::customer(['sub' => 'c0ffee00-1111-4222-8333-444455556666']));
        $this->assertStatus(200);

        self::assertSame(1, FakeOidcProvider::jwksRequests());

        $this->admin('GET', '/admin/me');
        $this->assertStatus(200);
        $this->admin('GET', '/admin/catalog/products');
        $this->assertStatus(200);

        self::assertSame(2, FakeOidcProvider::jwksRequests(), 'One download per realm.');
    }

    public function testAFailedDownloadIsNotCached(): void
    {
        FakeOidcProvider::$mode = FakeOidcProvider::UNREACHABLE;
        $this->customer('GET', '/me');
        $this->assertProblem(401);

        FakeOidcProvider::$mode = FakeOidcProvider::AVAILABLE;
        $this->customer('GET', '/me');

        $this->assertStatus(200);
    }

    /**
     * The time budget of an unavailable provider: the mocked HTTP client answers
     * at once, so the limits are checked on the options of every discovery request.
     */
    public function testTheDiscoveryOfAFirewallTakesAtMostThreeSeconds(): void
    {
        $this->customer('GET', '/me');
        $store = FakeOidcProvider::$requests;
        FakeOidcProvider::reset();
        $this->admin('GET', '/admin/me');
        $admin = FakeOidcProvider::$requests;

        foreach (['store' => $store, 'admin' => $admin] as $realm => $requests) {
            self::assertCount(2, $requests, $realm.': discovery document and JWKS');
            foreach ($requests as $request) {
                self::assertEquals(self::IDLE_TIMEOUT, $request['timeout'], $request['url']);
                self::assertEquals(self::MAX_DURATION, $request['max_duration'], $request['url']);
            }
            self::assertLessThanOrEqual(3.0, \count($requests) * self::MAX_DURATION);
        }
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function unavailableProviders(): iterable
    {
        foreach ([FakeOidcProvider::UNREACHABLE, FakeOidcProvider::FAILING, FakeOidcProvider::SILENT] as $mode) {
            yield 'store, '.$mode => [$mode, 'store'];
            yield 'admin, '.$mode => [$mode, 'admin'];
        }
    }

    /**
     * Maps every kind of failure to 401 (the duration is bounded by the options,
     * see testTheDiscoveryOfAFirewallTakesAtMostThreeSeconds).
     */
    #[DataProvider('unavailableProviders')]
    public function testAnUnavailableIdentityProviderMeans401(string $mode, string $realm): void
    {
        FakeOidcProvider::$mode = $mode;

        if ('store' === $realm) {
            $this->customer('GET', '/me');
        } else {
            $this->admin('GET', '/admin/me');
        }

        $this->assertProblem(401, 'The bearer token is invalid.');
        self::assertSame('Bearer error="invalid_token"', $this->client->getResponse()->headers->get('WWW-Authenticate'));
        self::assertSame(0, $this->connection()->fetchOne('SELECT count(*) FROM customers_customer'));
        self::assertSame(0, $this->connection()->fetchOne('SELECT count(*) FROM backoffice_admin_user'));
    }
}
