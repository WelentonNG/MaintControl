<?php

define('DB_HOST', '127.0.0.1');       // HOST DO BANCO
define('DB_NAME', 'maintcontrol_db'); // NOME DO BANCO
define('DB_USER', 'root');            // USUÁRIO DO BANCO
define('DB_PASS', '');                // SENHA DO BANCO


try {
    $pdo = @new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Falha na conexão com o banco de dados. Detalhe: ' . $e->getMessage()
    ]);
    exit;
}