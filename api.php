<?php
// Configurações de cabeçalho para API
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); 
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ATENÇÃO: É NECESSÁRIO CRIAR O ARQUIVO 'conexao.php' com a conexão PDO!
require_once 'conexao.php'; // Inclui o arquivo de conexão

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);
$action = isset($input['action']) ? $input['action'] : null;

// =========================================================================
// ROTEAMENTO DE REQUISIÇÕES
// =========================================================================

try {
    switch ($method) {
        case 'GET':
            handleGetMachines($pdo);
            break;

        case 'POST':
            if ($action === 'add_machine') {
                handleAddMachine($pdo, $input['data']);
            } elseif ($action === 'add_history') {
                handleAddHistory($pdo, $input['data']);
            } elseif ($action === 'start_maintenance') {
                handleStartMaintenance($pdo, $input['data']);
            } else {
                throw new Exception('Ação POST desconhecida.');
            }
            break;

        case 'PUT':
            if ($action === 'update_field') {
                handleUpdateField($pdo, $input['tag'], $input['field'], $input['value']);
            } elseif ($action === 'add_maint_step') { 
                // A ação 'add_maint_step' foi mapeada para 'handleAddHistory' no script.js, 
                // mas você pode criar uma função dedicada para passos de manutenção se criar a tabela 'passos_manutencao'.
                // Por enquanto, apenas registramos no histórico geral.
                handleAddHistory($pdo, $input['data']); 
            } elseif ($action === 'end_maintenance') {
                handleEndMaintenance($pdo, $input['data']); // <-- CORRIGIDO AQUI
            } else {
                throw new Exception('Ação PUT desconhecida.');
            }
            break;

        case 'DELETE':
            if ($action === 'delete_machine') {
                handleDeleteMachine($pdo, $input['tag']);
            } else {
                throw new Exception('Ação DELETE desconhecida.');
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['status' => 'error', 'message' => 'Método HTTP não permitido.']);
            exit;
    }
} catch (PDOException $e) {
    // Captura o erro 1054 (Coluna não encontrada) e fornece uma mensagem mais clara
    if ($e->getCode() === '42S22') {
         $message = 'Erro no Banco de Dados: Coluna não encontrada (provavelmente "data_fim"). Execute o SQL: ALTER TABLE manutencoes ADD COLUMN data_fim DATE NULL;';
    } else {
         $message = 'Erro no Banco de Dados: ' . $e->getMessage();
    }
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $message]);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}


// =========================================================================
// FUNÇÕES DE MANIPULAÇÃO DO DB
// =========================================================================

// api.php (FUNÇÃO handleGetMachines CORRIGIDA)
function handleGetMachines($pdo) {
    
    // Busca máquinas com todas as colunas
    $stmt = $pdo->query("SELECT id, nome, tag, status, descricao, horas_uso FROM maquinas");
    $machines_db = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Busca dados agrupados por maquina_id
    $history_data = $pdo->query("SELECT maquina_id, data_hora, descricao FROM historico ORDER BY data_hora DESC")->fetchAll(PDO::FETCH_GROUP);
    $agendamento_data = $pdo->query("SELECT maquina_id, data_agendada, observacoes FROM agendamentos")->fetchAll(PDO::FETCH_GROUP);
    
    // NOVO: Busca todos os campos da tabela manutencoes.
    // O campo 'data_fim' DEVE EXISTIR AGORA (após a correção no DB).
    $manutencao_data = $pdo->query("SELECT id, maquina_id, data_servico, tipo_servico, observacoes, data_fim FROM manutencoes ORDER BY data_servico DESC")->fetchAll(PDO::FETCH_GROUP);


    $formattedMachines = array_map(function($m) use ($history_data, $agendamento_data, $manutencao_data) {
        $id_maquina_db = $m['id']; 
        
        // Mapeamento do Histórico (mantido o antigo para a aba de histórico geral)
        $history = isset($history_data[$id_maquina_db]) ? 
            array_map(function($h) { 
                return [
                    'date' => (new DateTime($h['data_hora']))->format('d/m/Y H:i:s'), 
                    'text' => $h['descricao']
                ];
            }, $history_data[$id_maquina_db]) : 
            [['date' => date('d/m/Y H:i:s'), 'text' => 'Carregado do banco de dados.']];

        // Mapeamento do Agendamento (mantido)
        $nextMaint = isset($agendamento_data[$id_maquina_db][0]) ? 
            [
                'date' => $agendamento_data[$id_maquina_db][0]['data_agendada'], // YYYY-MM-DD
                'desc' => $agendamento_data[$id_maquina_db][0]['observacoes']
            ] : null;

        // Mapeamento dos Registros de Manutenção para o Accordion
        $maintenance_history = isset($manutencao_data[$id_maquina_db]) ? 
            array_map(function($maint) { 
                // NOTA: Se você tiver uma tabela 'passos_manutencao', deverá fazer uma nova query aqui.
                // Por enquanto, steps[] será vazio, pois não há tabela de passos.
                return [
                    'id' => $maint['id'], // ID real da manutenção no DB
                    'start_date' => $maint['data_servico'],
                    'end_date' => $maint['data_fim'], // Usa a data de fim (será NULL para ativa)
                    'type' => $maint['tipo_servico'],
                    'desc' => $maint['observacoes'],
                    'steps' => [] // Vazio, pois não temos a tabela passos
                ];
            }, $manutencao_data[$id_maquina_db]) : [];

        // Retorna a máquina no formato esperado pelo JS
        return [
            'id' => $m['tag'], 
            'name' => $m['nome'],
            'capacity' => isset($m['descricao']) ? $m['descricao'] : 'N/A', 
            'manufacturer' => null, // Campo 'manufacturer' não existe no seu DB, mantido 'null'
            'quantity' => (int)(isset($m['horas_uso']) ? $m['horas_uso'] : 1), 
            'status' => $m['status'],
            'maintenance' => $maintenance_history, 
            'history' => $history,
            'nextMaint' => $nextMaint
        ];
    }, $machines_db);

    echo json_encode(['status' => 'success', 'machines' => $formattedMachines]);
}
// FIM da função handleGetMachines


function handleAddMachine($pdo, $data) {
    if (empty($data['id']) || empty($data['name'])) {
        throw new Exception('ID e Nome da máquina são obrigatórios.');
    }
    
    // Usando as colunas que existem no seu DB (nome, tag, descricao, horas_uso, status)
    $stmt = $pdo->prepare("INSERT INTO maquinas (nome, tag, descricao, horas_uso, status) 
                          VALUES (:nome, :tag, :descricao, :horas_uso, :status)");
                          
    $stmt->execute([
        'nome' => $data['name'],
        'tag' => $data['id'],
        'descricao' => isset($data['capacity']) ? $data['capacity'] : null, 
        'horas_uso' => isset($data['quantity']) ? $data['quantity'] : 1, 
        'status' => isset($data['status']) ? $data['status'] : 'OK'
    ]);
    
    echo json_encode(['status' => 'success', 'message' => 'Máquina adicionada com sucesso.']);
}

function handleAddHistory($pdo, $data) {
    if (empty($data['tag']) || empty($data['description'])) {
        throw new Exception('Tag da máquina e descrição do histórico são obrigatórios.');
    }

    $stmt = $pdo->prepare("SELECT id FROM maquinas WHERE tag = ?");
    $stmt->execute([$data['tag']]);
    $maquina_id = $stmt->fetchColumn();

    if (!$maquina_id) {
        throw new Exception('Máquina não encontrada para adicionar histórico.');
    }

    $stmt = $pdo->prepare("INSERT INTO historico (maquina_id, descricao) VALUES (?, ?)");
    $stmt->execute([$maquina_id, $data['description']]);

    echo json_encode(['status' => 'success', 'message' => 'Histórico adicionado.']);
}

function handleUpdateField($pdo, $tag, $field, $value) {
    
    // Mapeamento de campo JS para campo DB
    $db_field = $field;
    if ($field === 'name') $db_field = 'nome';
    if ($field === 'capacity') $db_field = 'descricao'; 
    if ($field === 'quantity') $db_field = 'horas_uso'; 
    if ($field === 'manufacturer') $db_field = 'descricao'; 
    if ($field === 'status') $db_field = 'status';

    $allowed_fields = ['nome', 'descricao', 'horas_uso', 'status'];

    if (!in_array($db_field, $allowed_fields)) {
        // Exceção especial para 'nextMaint' (Agendamento)
        if ($field === 'nextMaint') {
             // 1. Encontra o ID interno da máquina pela TAG
            $stmt = $pdo->prepare("SELECT id FROM maquinas WHERE tag = ?");
            $stmt->execute([$tag]);
            $maquina_id = $stmt->fetchColumn();

            if (!$maquina_id) {
                throw new Exception('Máquina não encontrada para agendamento.');
            }

            // Deleta agendamentos existentes
            $pdo->prepare("DELETE FROM agendamentos WHERE maquina_id = ?")->execute([$maquina_id]);

            if ($value && $value !== 'null') {
                $maintData = json_decode($value, true);
                if (isset($maintData['date'])) {
                    $stmt = $pdo->prepare("INSERT INTO agendamentos (maquina_id, data_agendada, observacoes) VALUES (?, ?, ?)");
                    $stmt->execute([$maquina_id, $maintData['date'], $maintData['desc']]);
                }
            }
            echo json_encode(['status' => 'success', 'message' => 'Agendamento atualizado.']);
            return;
        }

        throw new Exception("Campo '$field' não permitido para atualização.");
    }

    $sql = "UPDATE maquinas SET $db_field = :value WHERE tag = :tag";
    $stmt = $pdo->prepare($sql);
    
    $stmt->execute([
        'value' => $value,
        'tag' => $tag
    ]);

    echo json_encode(['status' => 'success', 'message' => 'Campo atualizado.']);
}

function handleDeleteMachine($pdo, $tag) {
    // É recomendado deletar dependências (historico, agendamentos, manutencoes) primeiro, 
    // ou usar ON DELETE CASCADE no DB. Aqui, só deleta a máquina.
    $stmt = $pdo->prepare("DELETE FROM maquinas WHERE tag = ?");
    $stmt->execute([$tag]);

    echo json_encode(['status' => 'success', 'message' => 'Máquina deletada.']);
}

// =========================================================================
// FUNÇÕES DE MANUTENÇÃO
// =========================================================================

function handleStartMaintenance($pdo, $data) {
    // Requer: tag, type, desc, start_date
    if (empty($data['tag']) || empty($data['type'])) {
        throw new Exception('Tag e Tipo da manutenção são obrigatórios.');
    }
    
    // 1. Encontra o ID interno da máquina pela TAG
    $stmt = $pdo->prepare("SELECT id FROM maquinas WHERE tag = ?");
    $stmt->execute([$data['tag']]);
    $maquina_id = $stmt->fetchColumn();

    if (!$maquina_id) {
        throw new Exception('Máquina não encontrada.');
    }
    
    // 2. Registra o início da manutenção (data_fim será NULL por padrão)
    $stmt = $pdo->prepare("INSERT INTO manutencoes (maquina_id, data_servico, tipo_servico, observacoes) 
                          VALUES (?, ?, ?, ?)");
    $stmt->execute([
        $maquina_id, 
        $data['start_date'], 
        $data['type'], 
        $data['desc']
    ]);
    
    // Retorna o ID da manutenção recém-criada para o JS, se necessário (opcional, mas bom)
    $maint_id = $pdo->lastInsertId();
    echo json_encode(['status' => 'success', 'message' => 'Manutenção iniciada.', 'maint_id' => $maint_id]);
}

function handleEndMaintenance($pdo, $data) {
    // Requer: tag, end_date, maint_id
    if (empty($data['tag']) || empty($data['end_date']) || empty($data['maint_id'])) {
        throw new Exception('Dados de finalização incompletos.');
    }
    
    // 1. Encontra o ID interno da máquina pela TAG (para validação)
    $stmt = $pdo->prepare("SELECT id FROM maquinas WHERE tag = ?");
    $stmt->execute([$data['tag']]);
    $maquina_id = $stmt->fetchColumn();

    if (!$maquina_id) {
        throw new Exception('Máquina não encontrada.');
    }

    // 2. Atualiza a coluna data_fim na tabela manutencoes usando o maint_id
    $stmt = $pdo->prepare("UPDATE manutencoes SET data_fim = :end_date 
                          WHERE id = :maint_id AND maquina_id = :maquina_id AND data_fim IS NULL");
    
    $stmt->execute([
        'end_date' => $data['end_date'], 
        'maint_id' => $data['maint_id'], 
        'maquina_id' => $maquina_id
    ]);
    
    if ($stmt->rowCount() === 0) {
        throw new Exception('Nenhuma manutenção ativa encontrada com o ID fornecido.');
    }
    
    echo json_encode(['status' => 'success', 'message' => 'Manutenção finalizada.']);
}

?>