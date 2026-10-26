<?php

declare(strict_types=1);

namespace App\Customers\Infrastructure\Persistence\Doctrine;

use App\Customers\Domain\Customer;
use App\Customers\Domain\CustomerRepository;
use App\Shared\Domain\Identity\ExternalIdentity;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineCustomerRepository implements CustomerRepository
{
    public function __construct(private EntityManagerInterface $entityManager)
    {
    }

    public function findByIdentity(ExternalIdentity $identity): ?Customer
    {
        return $this->entityManager->getRepository(Customer::class)->findOneBy([
            'issuer' => $identity->issuer,
            'subject' => $identity->subject,
        ]);
    }

    /**
     * One statement, so concurrent first requests of a customer neither fail nor
     * create two rows: the unique (issuer, subject) index makes the later insert
     * wait for the earlier transaction and then do nothing.
     */
    public function addIfAbsent(Customer $customer): void
    {
        $identity = $customer->identity();
        $this->entityManager->getConnection()->executeStatement(
            'INSERT INTO customers_customer (id, issuer, subject, email, email_verified, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (issuer, subject) DO NOTHING',
            [$customer->id()->value, $identity->issuer, $identity->subject, $customer->email(), $customer->emailVerified(), $customer->createdAt(), $customer->updatedAt()],
            [Types::GUID, Types::STRING, Types::STRING, Types::STRING, Types::BOOLEAN, Types::DATETIMETZ_IMMUTABLE, Types::DATETIMETZ_IMMUTABLE],
        );
    }

    public function save(Customer $customer): void
    {
        $this->entityManager->persist($customer);
        $this->entityManager->flush();
    }
}
