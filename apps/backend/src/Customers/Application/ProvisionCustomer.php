<?php

declare(strict_types=1);

namespace App\Customers\Application;

use App\Customers\Domain\Customer;
use App\Customers\Domain\CustomerId;
use App\Customers\Domain\CustomerRepository;
use App\Shared\Domain\Identity\ExternalIdentity;
use Psr\Clock\ClockInterface;

/**
 * The customer behind a verified access token of the store realm: registered on
 * their first request (just in time), with the profile kept in sync with the
 * identity provider. Concurrent first requests end with one customer.
 */
final readonly class ProvisionCustomer
{
    public function __construct(
        private CustomerRepository $customers,
        private ClockInterface $clock,
    ) {
    }

    public function __invoke(ExternalIdentity $identity, ?string $email, bool $emailVerified): Customer
    {
        $now = $this->clock->now();

        $customer = $this->customers->findByIdentity($identity);
        if (null === $customer) {
            $this->customers->addIfAbsent(Customer::register(CustomerId::generate(), $identity, $email, $emailVerified, $now));
            $customer = $this->customers->findByIdentity($identity)
                ?? throw new \LogicException('The customer was neither added nor found.');
        }

        if ($customer->syncProfile($email, $emailVerified, $now)) {
            $this->customers->save($customer);
        }

        return $customer;
    }
}
