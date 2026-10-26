<?php

declare(strict_types=1);

namespace App\Tests\Support\Customers;

use App\Customers\Domain\Customer;
use App\Customers\Domain\CustomerRepository;
use App\Shared\Domain\Identity\ExternalIdentity;

final class InMemoryCustomerRepository implements CustomerRepository
{
    /** @var array<string, Customer> */
    private array $customers = [];

    public int $saves = 0;

    public function findByIdentity(ExternalIdentity $identity): ?Customer
    {
        return $this->customers[self::key($identity)] ?? null;
    }

    public function addIfAbsent(Customer $customer): void
    {
        $this->customers[self::key($customer->identity())] ??= $customer;
    }

    public function save(Customer $customer): void
    {
        ++$this->saves;
        $this->customers[self::key($customer->identity())] = $customer;
    }

    /**
     * @return list<Customer>
     */
    public function all(): array
    {
        return array_values($this->customers);
    }

    private static function key(ExternalIdentity $identity): string
    {
        return $identity->issuer."\n".$identity->subject;
    }
}
