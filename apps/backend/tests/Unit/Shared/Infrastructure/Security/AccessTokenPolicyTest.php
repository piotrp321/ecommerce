<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Infrastructure\Security;

use App\Shared\Infrastructure\Security\AccessTokenPolicy;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;

final class AccessTokenPolicyTest extends TestCase
{
    #[TestWith(['store-bff'])]
    #[TestWith(['mobile-app'])]
    public function testAcceptsAnAccessTokenOfAnAllowedClient(string $client): void
    {
        $badge = new UserBadge('sub-1', null, ['typ' => 'Bearer', 'azp' => $client]);

        self::assertSame($badge, (new AccessTokenPolicy(' store-bff, mobile-app ,', new NullLogger()))->check($badge));
    }

    /**
     * @param array<string, mixed> $claims
     */
    #[TestWith([['typ' => 'ID', 'azp' => 'store-bff']])]
    #[TestWith([['typ' => 'Refresh', 'azp' => 'store-bff']])]
    #[TestWith([['typ' => 'Logout', 'azp' => 'store-bff']])]
    #[TestWith([['typ' => 'bearer', 'azp' => 'store-bff']])]
    #[TestWith([['azp' => 'store-bff']])]
    #[TestWith([['typ' => 'Bearer', 'azp' => 'admin-bff']])]
    #[TestWith([['typ' => 'Bearer', 'azp' => '']])]
    #[TestWith([['typ' => 'Bearer']])]
    #[TestWith([['typ' => 'Bearer', 'azp' => ['store-bff']]])]
    public function testRejectsOtherTokens(array $claims): void
    {
        $this->expectException(BadCredentialsException::class);

        (new AccessTokenPolicy('store-bff', new NullLogger()))->check(new UserBadge('sub-1', null, $claims));
    }

    public function testWithoutAllowedClientsNothingIsAccepted(): void
    {
        $this->expectException(BadCredentialsException::class);

        (new AccessTokenPolicy(' , ', new NullLogger()))->check(new UserBadge('sub-1', null, ['typ' => 'Bearer', 'azp' => '']));
    }
}
