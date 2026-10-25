<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Infrastructure\Security;

use App\Shared\Infrastructure\Security\AdminApiTokenHandler;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;

final class AdminApiTokenHandlerTest extends TestCase
{
    private const string TOKEN = '0123456789abcdef0123456789abcdef';

    public function testAcceptsTheConfiguredToken(): void
    {
        $badge = (new AdminApiTokenHandler(self::TOKEN, new NullLogger()))->getUserBadgeFrom(self::TOKEN);

        self::assertSame(AdminApiTokenHandler::USER, $badge->getUserIdentifier());
        self::assertSame([AdminApiTokenHandler::ROLE], $badge->getUser()->getRoles());
    }

    /**
     * Without a usable configured token nothing matches, not even the same value.
     */
    #[TestWith([null, ''])]
    #[TestWith([null, 'anything'])]
    #[TestWith(['', ''])]
    #[TestWith(['0123456789abcdef0123456789abcde', '0123456789abcdef0123456789abcde'])] // 31 characters
    public function testDeniesEverythingWithoutAUsableConfiguredToken(?string $expected, string $given): void
    {
        $this->expectException(BadCredentialsException::class);

        (new AdminApiTokenHandler($expected, new NullLogger()))->getUserBadgeFrom($given);
    }

    #[TestWith([''])]
    #[TestWith(['0123456789abcdef0123456789abcdeF'])]
    #[TestWith(['0123456789abcdef0123456789abcdef '])]
    public function testRejectsOtherTokens(string $given): void
    {
        $this->expectException(BadCredentialsException::class);

        (new AdminApiTokenHandler(self::TOKEN, new NullLogger()))->getUserBadgeFrom($given);
    }
}
