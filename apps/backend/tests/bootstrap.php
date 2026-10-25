<?php

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

// The admin API token is a secret, so none is committed: each test run uses a
// random one (Dotenv does not override variables that are already set).
if (!isset($_SERVER['ADMIN_API_TOKEN'])) {
    $_SERVER['ADMIN_API_TOKEN'] = $_ENV['ADMIN_API_TOKEN'] = bin2hex(random_bytes(32));
}

(new Dotenv())->bootEnv(dirname(__DIR__).'/.env');

if ($_SERVER['APP_DEBUG']) {
    umask(0000);
}
