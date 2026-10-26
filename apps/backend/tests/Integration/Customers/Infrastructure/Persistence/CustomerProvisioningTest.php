<?php

declare(strict_types=1);

namespace App\Tests\Integration\Customers\Infrastructure\Persistence;

use App\Customers\Application\ProvisionCustomer;
use App\Customers\Domain\Customer;
use App\Customers\Domain\CustomerId;
use App\Customers\Domain\CustomerRepository;
use App\Customers\Infrastructure\Persistence\Doctrine\DoctrineCustomerRepository;
use App\Shared\Domain\Identity\ExternalIdentity;
use App\Tests\Support\DatabaseTestCase;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\DriverException;
use Symfony\Component\Clock\MockClock;

/**
 * Just-in-time registration against the database, including a concurrent first
 * request simulated by a second, independent connection.
 */
final class CustomerProvisioningTest extends DatabaseTestCase
{
    private const string ISSUER = 'https://auth.example.com/realms/store';
    private const string LOCK_NOT_AVAILABLE = '55P03';

    private Connection $second;

    protected function setUp(): void
    {
        parent::setUp();
        $this->second = self::secondConnection();
    }

    protected function tearDown(): void
    {
        while ($this->second->isTransactionActive()) {
            $this->second->rollBack();
        }
        $this->second->close();
        self::connection()->executeStatement('RESET lock_timeout');
        parent::tearDown();
    }

    public function testRegistersOnceAndSyncsTheProfile(): void
    {
        $provision = self::provision();
        $identity = new ExternalIdentity(self::ISSUER, 'sub-1');

        $first = $provision($identity, 'anna@example.com', false);
        self::entityManager()->clear();
        $second = $provision($identity, 'anna.nowak@example.com', true);
        self::entityManager()->clear();

        self::assertTrue($first->id()->equals($second->id()));
        self::assertSame([[
            'id' => $first->id()->value,
            'issuer' => self::ISSUER,
            'subject' => 'sub-1',
            'email' => 'anna.nowak@example.com',
            'email_verified' => true,
        ]], self::connection()->fetchAllAssociative('SELECT id, issuer, subject, email, email_verified FROM customers_customer'));
    }

    public function testDoesNotWriteAnUnchangedProfile(): void
    {
        $provision = self::provision();
        $identity = new ExternalIdentity(self::ISSUER, 'sub-1');
        $provision($identity, 'anna@example.com', true);
        self::connection()->executeStatement("UPDATE customers_customer SET updated_at = '2020-01-01 00:00:00+00'");
        self::entityManager()->clear();

        $provision($identity, 'anna@example.com', true);

        self::assertSame('2020-01-01 00:00:00+00', self::connection()->fetchOne('SELECT updated_at FROM customers_customer'));
    }

    public function testTheSameSubjectOfAnotherIssuerIsAnotherCustomer(): void
    {
        $provision = self::provision();

        $provision(new ExternalIdentity(self::ISSUER, 'sub-1'), null, false);
        $provision(new ExternalIdentity('https://auth.example.com/realms/other', 'sub-1'), null, false);

        self::assertSame(2, self::connection()->fetchOne('SELECT count(*) FROM customers_customer'));
    }

    /**
     * Two first requests at the same time: both looked the customer up and found
     * nothing. The later insert waits for the earlier transaction (it does not
     * fail and does not create a second row) and then reads the earlier customer.
     */
    public function testConcurrentFirstRequestsEndWithOneCustomer(): void
    {
        $identity = new ExternalIdentity(self::ISSUER, 'sub-1');
        $other = CustomerId::generate();

        $this->second->beginTransaction();
        $this->insertWithSecondConnection($other, $identity);

        self::connection()->executeStatement("SET lock_timeout = '300ms'");
        try {
            self::repository()->addIfAbsent(self::customer($identity));
            self::fail('The insert should wait for the concurrent transaction.');
        } catch (DriverException $exception) {
            self::assertSame(self::LOCK_NOT_AVAILABLE, $exception->getSQLState());
        }
        self::connection()->executeStatement('RESET lock_timeout');
        $this->second->commit();

        // The lookup of this request ran before the other one committed.
        $customer = new ProvisionCustomer(self::missingOnFirstLookup(self::repository()), new MockClock())($identity, 'anna@example.com', true);

        self::assertTrue($customer->id()->equals($other));
        self::assertSame(1, self::connection()->fetchOne('SELECT count(*) FROM customers_customer'));
    }

    public function testAddIfAbsentKeepsTheExistingCustomer(): void
    {
        $identity = new ExternalIdentity(self::ISSUER, 'sub-1');
        $other = CustomerId::generate();
        $this->insertWithSecondConnection($other, $identity);
        $repository = self::repository();

        $repository->addIfAbsent(self::customer($identity));

        self::assertTrue($repository->findByIdentity($identity)?->id()->equals($other));
        self::assertSame(1, self::connection()->fetchOne('SELECT count(*) FROM customers_customer'));
    }

    private static function repository(): DoctrineCustomerRepository
    {
        return new DoctrineCustomerRepository(self::entityManager());
    }

    private static function provision(): ProvisionCustomer
    {
        return new ProvisionCustomer(self::repository(), new MockClock());
    }

    private function insertWithSecondConnection(CustomerId $id, ExternalIdentity $identity): void
    {
        $this->second->executeStatement(
            "INSERT INTO customers_customer (id, issuer, subject, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, NULL, false, now(), now())",
            [$id->value, $identity->issuer, $identity->subject],
        );
    }

    private static function customer(ExternalIdentity $identity): Customer
    {
        return Customer::register(CustomerId::generate(), $identity, 'anna@example.com', true, new \DateTimeImmutable());
    }

    private static function missingOnFirstLookup(CustomerRepository $repository): CustomerRepository
    {
        return new class($repository) implements CustomerRepository {
            private bool $looked = false;

            public function __construct(private readonly CustomerRepository $repository)
            {
            }

            public function findByIdentity(ExternalIdentity $identity): ?Customer
            {
                if (!$this->looked) {
                    $this->looked = true;

                    return null;
                }

                return $this->repository->findByIdentity($identity);
            }

            public function addIfAbsent(Customer $customer): void
            {
                $this->repository->addIfAbsent($customer);
            }

            public function save(Customer $customer): void
            {
                $this->repository->save($customer);
            }
        };
    }
}
