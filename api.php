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
            } else {
                throw new Exception('Ação POST desconhecida.');
            }
            break;

        case 'PUT':
            if ($action === 'update_field') {
                handleUpdateField($pdo, $input['tag'], $input['field'], $input['value']);
            } elseif ($action === 'start_maintenance') {
                handleStartMaintenance($pdo, $input['data']);
            } elseif ($action === 'add_maint_step') {
                handleAddHistory($pdo, $input['data']); // Simplesmente registra como histórico por enquanto
            } elseif ($action === 'end_maintenance') {
                handleEndMaintenance($pdo, $input['data']);
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
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro no Banco de Dados: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}


// =========================================================================
// FUNÇÕES DE MANIPULAÇÃO DO DB
// =========================================================================

function handleGetMachines($pdo) {
    
    // Busca máquinas com todas as colunas que você tem
    $stmt = $pdo->query("SELECT id, nome, tag, status, descricao, horas_uso FROM maquinas");
    $machines_db = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $history_data = $pdo->query("SELECT maquina_id, data_hora, descricao FROM historico")->fetchAll(PDO::FETCH_GROUP);
    $agendamento_data = $pdo->query("SELECT maquina_id, data_agendada, observacoes FROM agendamentos")->fetchAll(PDO::FETCH_GROUP);
    $manutencao_data = $pdo->query("SELECT maquina_id, data_servico, tipo_servico, observacoes FROM manutencoes")->fetchAll(PDO::FETCH_GROUP);

    $formattedMachines = array_map(function($m) use ($history_data, $agendamento_data, $manutencao_data) {
        $id_maquina_db = $m['id']; 
        
        $history = isset($history_data[$id_maquina_db]) ? 
            array_map(function($h) { 
                return [
                    'date' => (new DateTime($h['data_hora']))->format('d/m/Y H:i:s'), 
                    'text' => $h['descricao']
                ];
            }, $history_data[$id_maquina_db]) : 
            [['date' => date('d/m/Y H:i:s'), 'text' => 'Carregado do banco de dados.']];

        // Lida com a possibilidade de múltiplos agendamentos, pegando apenas o primeiro
        $nextMaint = isset($agendamento_data[$id_maquina_db][0]) ? 
            [
                'date' => $agendamento_data[$id_maquina_db][0]['data_agendada'], // YYYY-MM-DD
                'desc' => $agendamento_data[$id_maquina_db][0]['observacoes']
            ] : null;

        $maintenance_history = isset($manutencao_data[$id_maquina_db]) ? 
            array_map(function($maint) { 
                return [
                    'start_date' => $maint['data_servico'],
                    'type' => $maint['tipo_servico'],
                    'desc' => $maint['observacoes'],
                    // Propriedades do JS que não existem no DB (serão null)
                    'end_date' => $maint['data_servico'],
                    'steps' => []
                ];
            }, $manutencao_data[$id_maquina_db]) : [];

        // Retorna a máquina no formato esperado pelo JS
        return [
            'id' => $m['tag'], 
            'name' => $m['nome'],
            'capacity' => isset($m['descricao']) ? $m['descricao'] : 'N/A', // Mapeando 'descricao' do DB para 'capacity' no JS
            'manufacturer' => null, // Campo não existe no DB, retorna null
            'quantity' => (int)(isset($m['horas_uso']) ? $m['horas_uso'] : 1), // Mapeando 'horas_uso' do DB para 'quantity' no JS
            'status' => $m['status'],
            'maintenance' => $maintenance_history,
            'history' => $history,
            'nextMaint' => $nextMaint
        ];
    }, $machines_db);

    echo json_encode(['status' => 'success', 'machines' => $formattedMachines]);
}


function handleAddMachine($pdo, $data) {
    if (empty($data['id']) || empty($data['name'])) {
        throw new Exception('ID e Nome da máquina são obrigatórios.');
    }
    
    // CORRIGIDO: Usando apenas as colunas que existem no seu DB (nome, tag, descricao, horas_uso, status)
    $stmt = $pdo->prepare("INSERT INTO maquinas (nome, tag, descricao, horas_uso, status) 
                          VALUES (:nome, :tag, :descricao, :horas_uso, :status)");
                          
    $stmt->execute([
        'nome' => $data['name'],
        'tag' => $data['id'],
        'descricao' => isset($data['capacity']) ? $data['capacity'] : null, // Mapeado capacity do JS para descricao do DB
        'horas_uso' => isset($data['quantity']) ? $data['quantity'] : 1, // Mapeado quantity do JS para horas_uso do DB
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
    if ($field === 'capacity') $db_field = 'descricao'; // Mapeando capacity para descricao
    if ($field === 'quantity') $db_field = 'horas_uso'; // Mapeando quantity para horas_uso
    if ($field === 'manufacturer') $db_field = 'descricao'; // Não temos fabricante, usa descricao
    if ($field === 'status') $db_field = 'status';

    $allowed_fields = ['nome', 'descricao', 'horas_uso', 'status'];

    if (!in_array($db_field, $allowed_fields)) {
        // Exceção especial para 'nextMaint'
        if ($field === 'nextMaint') {
             // 1. Encontra o ID interno da máquina pela TAG
            $stmt = $pdo->prepare("SELECT id FROM maquinas WHERE tag = ?");
            $stmt->execute([$tag]);
            $maquina_id = $stmt->fetchColumn();

            if (!$maquina_id) {
                throw new Exception('Máquina não encontrada para agendamento.');
            }

            // Deleta agendamentos existentes (ou onde value é null)
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
    $stmt = $pdo->prepare("DELETE FROM maquinas WHERE tag = ?");
    $stmt->execute([$tag]);

    echo json_encode(['status' => 'success', 'message' => 'Máquina deletada.']);
}

// =========================================================================
// FUNÇÕES DE MANUTENÇÃO (CORRIGIDAS PARA SEU DB)
// =========================================================================

function handleStartMaintenance($pdo, $data) {
    // 1. Encontra o ID interno da máquina pela TAG
    $stmt = $pdo->prepare("SELECT id FROM maquinas WHERE tag = ?");
    $stmt->execute([$data['tag']]);
    $maquina_id = $stmt->fetchColumn();

    if (!$maquina_id) {
        throw new Exception('Máquina não encontrada.');
    }
    
    // 2. Registra o início da manutenção (seu DB não tem data de fim, então registra a data de início como data_servico)
    $stmt = $pdo->prepare("INSERT INTO manutencoes (maquina_id, data_servico, tipo_servico, observacoes) 
                          VALUES (?, ?, ?, ?)");
    $stmt->execute([
        $maquina_id, 
        $data['start_date'], 
        $data['type'], 
        $data['desc']
    ]);
    
    // O JS cuidará de chamar a atualização de STATUS para 'EM MANUTENÇÃO' separadamente.
    echo json_encode(['status' => 'success', 'message' => 'Manutenção iniciada.']);
}

function handleEndMaintenance($pdo, $data) {
    // Sua tabela 'manutencoes' não tem um campo 'end_date' para ser atualizado, nem um ID para identificar a manutenção ATIVA.
    // A lógica de "finalizar manutenção" será tratada apenas pelo JS, que chamará a atualização de status para 'OK'.
    echo json_encode(['status' => 'success', 'message' => 'Manutenção finalizada.']);
}

?>