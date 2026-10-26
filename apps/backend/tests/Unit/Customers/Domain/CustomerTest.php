<?php

declare(strict_types=1);

namespace App\Tests\Unit\Customers\Domain;

use App\Customers\Domain\Customer;
use App\Customers\Domain\CustomerId;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Identity\ExternalIdentity;
use PHPUnit\Framework\TestCase;

final class CustomerTest extends TestCase
{
    private const string ISSUER = 'https://auth.example.com/realms/store';

    public function testRegistersTheCustomerOfAnExternalIdentity(): void
    {
        $now = new \DateTimeImmutable('2026-10-26 10:00:00');
        $id = CustomerId::generate();

        $customer = Customer::register($id, new ExternalIdentity(self::ISSUER, 'sub-1'), 'anna@example.com', true, $now);

        self::assertTrue($customer->id()->equals($id));
        self::assertTrue($customer->identity()->equals(new ExternalIdentity(self::ISSUER, 'sub-1')));
        self::assertSame('anna@example.com', $customer->email());
        self::assertTrue($customer->emailVerified());
        self::assertEquals($now, $customer->createdAt());
        self::assertEquals($now, $customer->updatedAt());
    }

    public function testWithoutAnEmailNothingIsVerified(): void
    {
        $customer = Customer::register(CustomerId::generate(), new ExternalIdentity(self::ISSUER, 'sub-1'), '  ', true, new \DateTimeImmutable());

        self::assertNull($customer->email());
        self::assertFalse($customer->emailVerified());
    }

    public function testSyncsAChangedProfile(): void
    {
        $customer = $this->customer('anna@example.com', false);
        $later = new \DateTimeImmutable('2026-10-27 08:00:00');

        self::assertTrue($customer->syncProfile('anna.nowak@example.com', true, $later));

        self::assertSame('anna.nowak@example.com', $customer->email());
        self::assertTrue($customer->emailVerified());
        self::assertEquals($later, $customer->updatedAt());
        self::assertEquals(new \DateTimeImmutable('2026-10-26 10:00:00'), $customer->createdAt());
    }

    public function testAnUnchangedProfileNeedsNoSaving(): void
    {
        $customer = $this->customer('anna@example.com', true);

        self::assertFalse($customer->syncProfile('anna@example.com', true, new \DateTimeImmutable('2026-10-27 08:00:00')));

        self::assertEquals(new \DateTimeImmutable('2026-10-26 10:00:00'), $customer->updatedAt());
    }

    public function testTheVerificationAloneIsAChange(): void
    {
        $customer = $this->customer('anna@example.com', false);

        self::assertTrue($customer->syncProfile('anna@example.com', true, new \DateTimeImmutable()));
        self::assertTrue($customer->emailVerified());
    }

    public function testRejectsAnEmailLongerThanTheColumn(): void
    {
        $this->expectException(InvalidValue::class);

        $this->customer(str_repeat('a', Customer::EMAIL_MAX_LENGTH - 11).'@example.com', true);
    }

    private function customer(?string $email, bool $emailVerified): Customer
    {
        return Customer::register(
            CustomerId::generate(),
            new ExternalIdentity(self::ISSUER, 'sub-1'),
            $email,
            $emailVerified,
            new \DateTimeImmutable('2026-10-26 10:00:00'),
        );
    }
}
