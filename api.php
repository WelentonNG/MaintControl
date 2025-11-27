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
            } elseif ($action === 'batch_add_machines') { 
                handleBatchAddMachines($pdo, $input['data']);
            } else {
                throw new Exception('Ação POST desconhecida.');
            }
            break;

        case 'PUT':
            if ($action === 'update_field') {
                handleUpdateField($pdo, $input['tag'], $input['field'], $input['value']);
            } elseif ($action === 'add_maint_step') { 
                // <-- NOVO PONTO DE ENTRADA PARA PASSOS
                handleAddMaintStep($pdo, $input['data']);
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
    if ($e->getCode() === '42S22') {
         $message = 'Erro no Banco de Dados: Coluna não encontrada (provavelmente "tecnico" ou "custo_total"). Execute o SQL da atualização.';
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

// api.php (FUNÇÃO handleGetMachines ATUALIZADA)
function handleGetMachines($pdo) {
    
    // Busca máquinas
    $stmt = $pdo->query("SELECT id, nome, tag, status, descricao, horas_uso FROM maquinas");
    $machines_db = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Busca dados agrupados
    $history_data = $pdo->query("SELECT maquina_id, data_hora, descricao FROM historico ORDER BY data_hora DESC")->fetchAll(PDO::FETCH_GROUP);
    $agendamento_data = $pdo->query("SELECT maquina_id, data_agendada, observacoes FROM agendamentos")->fetchAll(PDO::FETCH_GROUP);
    
    // Busca manutenções (AGORA COM TECNICO E CUSTO)
    $manutencao_data = $pdo->query("SELECT id, maquina_id, data_servico, tipo_servico, observacoes, tecnico, data_fim, custo_total FROM manutencoes ORDER BY data_servico DESC")->fetchAll(PDO::FETCH_GROUP);

    // NOVO: Busca todos os passos de manutenção agrupados pelo ID da manutenção
    $passos_data = $pdo->query("SELECT manutencao_id, data_hora, descricao FROM passos_manutencao ORDER BY data_hora ASC")->fetchAll(PDO::FETCH_GROUP);


    $formattedMachines = array_map(function($m) use ($history_data, $agendamento_data, $manutencao_data, $passos_data) {
        $id_maquina_db = $m['id']; 
        
        // Mapeamento do Histórico
        $history = isset($history_data[$id_maquina_db]) ? 
            array_map(function($h) { 
                return [
                    'date' => (new DateTime($h['data_hora']))->format('d/m/Y H:i:s'), 
                    'text' => $h['descricao']
                ];
            }, $history_data[$id_maquina_db]) : 
            [['date' => date('d/m/Y H:i:s'), 'text' => 'Carregado do banco de dados.']];

        // Mapeamento do Agendamento
        $nextMaint = isset($agendamento_data[$id_maquina_db][0]) ? 
            [
                'date' => $agendamento_data[$id_maquina_db][0]['data_agendada'],
                'desc' => $agendamento_data[$id_maquina_db][0]['observacoes']
            ] : null;

        // Mapeamento dos Registros de Manutenção (ATUALIZADO)
        $maintenance_history = isset($manutencao_data[$id_maquina_db]) ? 
            array_map(function($maint) use ($passos_data) { 
                
                $id_manutencao_db = $maint['id'];

                // Mapeia os passos reais da tabela 'passos_manutencao'
                $steps = isset($passos_data[$id_manutencao_db]) ?
                    array_map(function($p) {
                         return [
                            'date' => (new DateTime($p['data_hora']))->format('d/m/Y H:i:s'), 
                            'description' => $p['descricao']
                        ];
                    }, $passos_data[$id_manutencao_db]) : [];

                return [
                    'id' => $id_manutencao_db,
                    'start_date' => $maint['data_servico'],
                    'end_date' => $maint['data_fim'],
                    'type' => $maint['tipo_servico'],
                    'desc' => $maint['observacoes'],
                    'tecnico' => $maint['tecnico'], // NOVO
                    'cost' => $maint['custo_total'], // NOVO
                    'steps' => $steps // ATUALIZADO
                ];
            }, $manutencao_data[$id_maquina_db]) : [];

        // Retorna a máquina no formato esperado pelo JS
        return [
            'id' => $m['tag'], 
            'name' => $m['nome'],
            'capacity' => isset($m['descricao']) ? $m['descricao'] : 'N/A', 
            'manufacturer' => null, 
            'quantity' => (int)(isset($m['horas_uso']) ? $m['horas_uso'] : 1), // Campo 'horas_uso' agora é 'quantity' no JS
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
    // ... (Função sem alterações)
    if (empty($data['id']) || empty($data['name'])) {
        throw new Exception('ID e Nome da máquina são obrigatórios.');
    }
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
    // ... (Função sem alterações)
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
    // ... (Função sem alterações na lógica principal)
    
    // Mapeamento de campo JS para campo DB
    $db_field = $field;
    if ($field === 'name') $db_field = 'nome';
    if ($field === 'capacity') $db_field = 'descricao'; 
    if ($field === 'quantity') $db_field = 'horas_uso'; // 'quantity' do JS é 'horas_uso' no DB
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
    // ... (Função sem alterações)
    $stmt = $pdo->prepare("DELETE FROM maquinas WHERE tag = ?");
    $stmt->execute([$tag]);
    echo json_encode(['status' => 'success', 'message' => 'Máquina deletada.']);
}

// =========================================================================
// FUNÇÕES DE MANUTENÇÃO (ATUALIZADAS)
// =========================================================================

function handleStartMaintenance($pdo, $data) {
    // Requer: tag, type, desc, start_date, tecnico
    if (empty($data['tag']) || empty($data['type'])) {
        throw new Exception('Tag e Tipo da manutenção são obrigatórios.');
    }
    
    $stmt = $pdo->prepare("SELECT id FROM maquinas WHERE tag = ?");
    $stmt->execute([$data['tag']]);
    $maquina_id = $stmt->fetchColumn();
    if (!$maquina_id) {
        throw new Exception('Máquina não encontrada.');
    }
    
    // AGORA INCLUI O CAMPO 'tecnico'
    $stmt = $pdo->prepare("INSERT INTO manutencoes (maquina_id, data_servico, tipo_servico, observacoes, tecnico) 
                          VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([
        $maquina_id, 
        $data['start_date'], 
        $data['type'], 
        $data['desc'],
        isset($data['tecnico']) ? $data['tecnico'] : null // NOVO
    ]);
    
    $maint_id = $pdo->lastInsertId();
    echo json_encode(['status' => 'success', 'message' => 'Manutenção iniciada.', 'maint_id' => $maint_id]);
}

function handleEndMaintenance($pdo, $data) {
    // Requer: tag, end_date, maint_id, cost
    if (empty($data['tag']) || empty($data['end_date']) || empty($data['maint_id'])) {
        throw new Exception('Dados de finalização incompletos.');
    }
    
    $stmt = $pdo->prepare("SELECT id FROM maquinas WHERE tag = ?");
    $stmt->execute([$data['tag']]);
    $maquina_id = $stmt->fetchColumn();
    if (!$maquina_id) {
        throw new Exception('Máquina não encontrada.');
    }

    // Converte o custo para número, ou null se não for válido
    $custo = isset($data['cost']) ? (float)str_replace(',', '.', $data['cost']) : null;
    if ($custo < 0) {
        $custo = null;
    }

    // AGORA ATUALIZA data_fim e custo_total
    $stmt = $pdo->prepare("UPDATE manutencoes SET data_fim = :end_date, custo_total = :cost 
                          WHERE id = :maint_id AND maquina_id = :maquina_id AND data_fim IS NULL");
    
    $stmt->execute([
        'end_date' => $data['end_date'], 
        'cost' => $custo, // NOVO
        'maint_id' => $data['maint_id'], 
        'maquina_id' => $maquina_id
    ]);
    
    if ($stmt->rowCount() === 0) {
        throw new Exception('Nenhuma manutenção ativa encontrada com o ID fornecido.');
    }
    
    echo json_encode(['status' => 'success', 'message' => 'Manutenção finalizada.']);
}

// =========================================================================
// FUNÇÃO DE IMPORTAÇÃO EM LOTE
// =========================================================================
function handleBatchAddMachines($pdo, $machines) {
    // ... (Função sem alterações)
    if (!is_array($machines) || empty($machines)) {
        throw new Exception('Nenhum dado de máquina válido fornecido.');
    }
    $stmt = $pdo->prepare("INSERT INTO maquinas (nome, tag, descricao, horas_uso, status) 
                          VALUES (:nome, :tag, :descricao, :horas_uso, :status)
                          ON DUPLICATE KEY UPDATE 
                          nome = VALUES(nome), 
                          descricao = VALUES(descricao), 
                          horas_uso = VALUES(horas_uso), 
                          status = VALUES(status)");
    $count = 0;
    $pdo->beginTransaction();
    try {
        foreach ($machines as $data) {
            if (empty($data['id']) || empty($data['name'])) {
                continue; 
            }
            $stmt->execute([
                'nome' => $data['name'],
                'tag' => $data['id'],
                'descricao' => isset($data['capacity']) ? $data['capacity'] : null, 
                'horas_uso' => isset($data['quantity']) ? (int)$data['quantity'] : 1, 
                'status' => isset($data['status']) ? $data['status'] : 'OK'
            ]);
            $count++;
        }
        $pdo->commit();
        echo json_encode(['status' => 'success', 'message' => "$count máquinas importadas/atualizadas com sucesso."]);

    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e; 
    }
}

// =========================================================================
// NOVA FUNÇÃO PARA PASSOS DE MANUTENÇÃO
// =========================================================================
function handleAddMaintStep($pdo, $data) {
    // Requer: maint_id (ID da manutenção), description
    if (empty($data['maint_id']) || empty($data['description'])) {
        throw new Exception('ID da Manutenção e Descrição são obrigatórios.');
    }

    // Insere na nova tabela 'passos_manutencao'
    $stmt = $pdo->prepare("INSERT INTO passos_manutencao (manutencao_id, descricao) VALUES (?, ?)");
    $stmt->execute([
        $data['maint_id'], 
        $data['description']
    ]);

    $step_id = $pdo->lastInsertId();
    $new_step_date = $pdo->query("SELECT data_hora FROM passos_manutencao WHERE id = $step_id")->fetchColumn();

    echo json_encode([
        'status' => 'success', 
        'message' => 'Passo adicionado.',
        'new_step' => [ // Retorna o passo formatado para o JS
             'date' => (new DateTime($new_step_date))->format('d/m/Y H:i:s'),
             'description' => $data['description']
        ]
    ]);
}

?>