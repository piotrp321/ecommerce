<?php

declare(strict_types=1);

namespace App\Customers\Domain;

use App\Shared\Domain\Identity\ExternalIdentity;

interface CustomerRepository
{
    public function findByIdentity(ExternalIdentity $identity): ?Customer;

    /**
     * Adds a newly registered customer unless a customer with the same external
     * identity already exists, e.g. registered by a concurrent first request.
     * Never fails because of that customer: read it back with findByIdentity().
     */
    public function addIfAbsent(Customer $customer): void;

    public function save(Customer $customer): void;
}
