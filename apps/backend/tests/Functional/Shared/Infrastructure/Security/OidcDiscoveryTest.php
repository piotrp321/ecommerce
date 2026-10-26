<?php

declare(strict_types=1);

namespace App\Tests\Functional\Shared\Infrastructure\Security;

use App\Tests\Support\ApiTestCase;
use App\Tests\Support\Security\FakeOidcProvider;
use App\Tests\Support\Security\TestTokens;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;
use Symfony\Component\Security\Http\AccessToken\AccessTokenHandlerInterface;

/**
 * Keys of both realms come from OIDC discovery: cached, and an unavailable
 * identity provider means 401 within 3 seconds (never 500 or a hanging request).
 */
final class OidcDiscoveryTest extends ApiTestCase
{
    private const float MAX_DURATION = 1.5;
    private const float IDLE_TIMEOUT = 1.0;

    /**
     * The keys are cached in the cache.oidc pool (filesystem outside the tests)
     * for the provider's max-age. The test pool is an array that the kernel
     * empties between HTTP requests, so the firewalls' token handlers are
     * called directly here.
     */
    public function testDownloadsTheKeysOfARealmOnce(): void
    {
        $store = self::handler('store_api');
        $admin = self::handler('admin_api');

        self::assertSame(TestTokens::CUSTOMER_SUBJECT, $store->getUserBadgeFrom(TestTokens::customer())->getUserIdentifier());
        self::assertSame('c0ffee00-1111-4222-8333-444455556666', $store->getUserBadgeFrom(TestTokens::customer(['sub' => 'c0ffee00-1111-4222-8333-444455556666']))->getUserIdentifier());
        $store->getUserBadgeFrom(TestTokens::customer(['email' => 'anna.nowak@example.com']));
        self::assertSame(1, FakeOidcProvider::jwksRequests());

        $admin->getUserBadgeFrom(TestTokens::admin());
        $admin->getUserBadgeFrom(TestTokens::admin(['email' => 'ola.kowalska@example.com']));
        self::assertSame(2, FakeOidcProvider::jwksRequests(), 'One download per realm.');
    }

    public function testAFailedDownloadIsNotCached(): void
    {
        $store = self::handler('store_api');
        FakeOidcProvider::$mode = FakeOidcProvider::UNREACHABLE;
        try {
            $store->getUserBadgeFrom(TestTokens::customer());
            self::fail('The token cannot be verified without the keys.');
        } catch (BadCredentialsException) {
        }

        FakeOidcProvider::$mode = FakeOidcProvider::AVAILABLE;

        self::assertSame(TestTokens::CUSTOMER_SUBJECT, $store->getUserBadgeFrom(TestTokens::customer())->getUserIdentifier());
    }

    private static function handler(string $firewall): AccessTokenHandlerInterface
    {
        $handler = self::getContainer()->get('security.access_token_handler.'.$firewall);
        \assert($handler instanceof AccessTokenHandlerInterface);

        return $handler;
    }

    /**
     * The time budget of an unavailable provider: the mocked HTTP client answers
     * at once, so the limits are checked on the options of every discovery
     * request. Discovery makes two sequential requests (the discovery document,
     * then the JWKS), each limited to 1.5 s: at most 3 s per firewall.
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
