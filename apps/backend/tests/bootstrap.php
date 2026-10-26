<?php

use App\Tests\Support\Security\TestKeys;
use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

// Signing keys of the fake identity provider: new ones on every test run, so no
// key material is committed (tests/Support/Security).
TestKeys::generate();

(new Dotenv())->bootEnv(dirname(__DIR__).'/.env');

if ($_SERVER['APP_DEBUG']) {
    umask(0000);
}
