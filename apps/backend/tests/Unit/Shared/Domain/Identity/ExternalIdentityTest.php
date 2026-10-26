<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Domain\Identity;

use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Identity\ExternalIdentity;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;

final class ExternalIdentityTest extends TestCase
{
    private const string STORE = 'https://auth.example.com/realms/store';

    public function testIsTheSubjectWithinItsIssuer(): void
    {
        $identity = new ExternalIdentity(self::STORE, 'f3c1a2b4');

        self::assertSame(self::STORE, $identity->issuer);
        self::assertSame('f3c1a2b4', $identity->subject);
        self::assertTrue($identity->equals(new ExternalIdentity(self::STORE, 'f3c1a2b4')));
    }

    public function testTheSameSubjectOfAnotherIssuerIsAnotherIdentity(): void
    {
        $identity = new ExternalIdentity(self::STORE, 'f3c1a2b4');

        self::assertFalse($identity->equals(new ExternalIdentity('https://auth.example.com/realms/admin', 'f3c1a2b4')));
        self::assertFalse($identity->equals(new ExternalIdentity(self::STORE, 'F3C1A2B4')));
    }

    #[TestWith(['', 'subject'])]
    #[TestWith([self::STORE, ''])]
    public function testRejectsEmptyParts(string $issuer, string $subject): void
    {
        $this->expectException(InvalidValue::class);

        new ExternalIdentity($issuer, $subject);
    }

    public function testAcceptsPartsUpToTheColumnLength(): void
    {
        $identity = new ExternalIdentity(str_repeat('i', ExternalIdentity::MAX_LENGTH), str_repeat('s', ExternalIdentity::MAX_LENGTH));

        self::assertSame(ExternalIdentity::MAX_LENGTH, \strlen($identity->subject));
    }

    public function testRejectsPartsLongerThanTheColumns(): void
    {
        $this->expectException(InvalidValue::class);

        new ExternalIdentity(self::STORE, str_repeat('s', ExternalIdentity::MAX_LENGTH + 1));
    }
}
