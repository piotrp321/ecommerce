<?php

declare(strict_types=1);

namespace App\Tests\Unit\Customers\Application;

use App\Customers\Application\ProvisionCustomer;
use App\Shared\Domain\Identity\ExternalIdentity;
use App\Tests\Support\Customers\InMemoryCustomerRepository;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Clock\MockClock;

final class ProvisionCustomerTest extends TestCase
{
    private const string ISSUER = 'https://auth.example.com/realms/store';

    private InMemoryCustomerRepository $customers;
    private ProvisionCustomer $provision;

    protected function setUp(): void
    {
        $this->customers = new InMemoryCustomerRepository();
        $this->provision = new ProvisionCustomer($this->customers, new MockClock('2026-10-26 10:00:00'));
    }

    public function testRegistersTheCustomerOnTheFirstRequest(): void
    {
        $customer = ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'anna@example.com', true);

        self::assertCount(1, $this->customers->all());
        self::assertSame($customer, $this->customers->all()[0]);
        self::assertSame('anna@example.com', $customer->email());
    }

    public function testFindsTheSameCustomerLater(): void
    {
        $first = ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'anna@example.com', true);
        $second = ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'anna@example.com', true);

        self::assertTrue($first->id()->equals($second->id()));
        self::assertCount(1, $this->customers->all());
        self::assertSame(0, $this->customers->saves, 'An unchanged profile is not written.');
    }

    public function testSyncsTheEmailFromTheToken(): void
    {
        ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'anna@example.com', true);

        $customer = ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), 'anna.nowak@example.com', false);

        self::assertSame('anna.nowak@example.com', $customer->email());
        self::assertFalse($customer->emailVerified());
        self::assertSame(1, $this->customers->saves);
    }

    public function testTheSameSubjectOfAnotherIssuerIsAnotherCustomer(): void
    {
        ($this->provision)(new ExternalIdentity(self::ISSUER, 'sub-1'), null, false);
        ($this->provision)(new ExternalIdentity('https://auth.example.com/realms/other', 'sub-1'), null, false);

        self::assertCount(2, $this->customers->all());
    }
}
