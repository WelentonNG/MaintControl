document.addEventListener('DOMContentLoaded', () => {
    // ======== ESTADO E CONSTANTES GLOBAIS ========
    const STATUS = ["OK", "EM OPERAÇÃO", "EM MANUTENÇÃO", "INOPERANTE", "ESPERANDO PEÇAS", "HORAS EXCEDENTES"];
    const API_URL = 'api.php'; // PONTO DE ENTRADA DA COMUNICAÇÃO COM O PHP

    let state = {
        machines: [],
        search: '',
        filter: 'all',
        sortBy: 'id',
        sortDir: 'asc',
        page: 1,
        perPage: 8,
        editingIndex: null
    };

    // ======== FUNÇÕES AUXILIARES DE API E NOTIFICAÇÃO ========
    const notify = (text, type = 'info') => {
        const toasts = document.getElementById('toasts');
        const d = document.createElement('div');
        d.className = `toast ${type}`;
        d.textContent = text;
        toasts.appendChild(d);
        setTimeout(() => d.remove(), 3500);
    };

    // FUNÇÃO QUE ESTAVA FALTANDO, ADICIONADA AQUI
    const escapeHtml = (str) => {
        if (str === null || str === undefined) return '';
        // Converte para String e então escapa os caracteres
        return String(str).replace(/[&<>"']/g, (match) => {
            const escape = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return escape[match];
        });
    };

    // Função genérica para comunicação com a API PHP
    const sendApiRequest = async (url, method, data = null) => {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const jsonResponse = await response.json();

            if (!response.ok || jsonResponse.status === 'error') {
                const errorMsg = jsonResponse.message || 'Erro de rede desconhecido.';
                notify(`Falha na operação: ${errorMsg}`, 'error');
                throw new Error(errorMsg);
            }
            return jsonResponse;
        } catch (e) {
            if (e.message.startsWith("Failed to fetch")) {
                 notify("Falha de conexão com o servidor. Verifique o API_URL.", 'error');
            }
            throw e;
        }
    };

    // ======== LÓGICA DO MODAL DE CONFIRMAÇÃO ========
    const confirmModal = {
        backdrop: document.getElementById('confirmModalBackdrop'),
        title: document.getElementById('confirmTitle'),
        message: document.getElementById('confirmMessage'),
        btnOk: document.getElementById('confirmBtnOk'),
        btnCancel: document.getElementById('confirmBtnCancel'),
        icon: document.getElementById('confirmIcon'),
        onConfirm: null
    };

    const showConfirm = (title, message, onConfirm, type = 'danger') => {
        confirmModal.title.textContent = title;
        confirmModal.message.textContent = message;
        confirmModal.onConfirm = onConfirm;

        // Resetar classes
        confirmModal.icon.className = 'icon';
        confirmModal.btnOk.className = 'btn';

        if (type === 'danger') {
            confirmModal.icon.classList.add('danger');
            confirmModal.icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            confirmModal.btnOk.classList.add('btn-confirm'); // Estilo vermelho
            confirmModal.btnOk.textContent = 'Sim, Excluir';
        } else if (type === 'warning') {
            confirmModal.icon.classList.add('warning');
            confirmModal.icon.innerHTML = '<i class="fa-solid fa-question-circle"></i>';
            confirmModal.btnOk.classList.add('btn'); // Estilo padrão azul
            confirmModal.btnOk.textContent = 'Sim, Iniciar';
        }

        confirmModal.backdrop.classList.add('show');
    };

    const hideConfirm = () => {
        confirmModal.backdrop.classList.remove('show');
        confirmModal.onConfirm = null;
    };

    // Listeners do Modal de Confirmação
    confirmModal.btnOk.addEventListener('click', () => {
        if (confirmModal.onConfirm) {
            confirmModal.onConfirm();
        }
        hideConfirm();
    });
    confirmModal.btnCancel.addEventListener('click', hideConfirm);
    confirmModal.backdrop.addEventListener('click', (e) => {
        if (e.target === confirmModal.backdrop) hideConfirm();
    });


    // ======== FUNÇÕES DE DADOS (CARREGAR/SALVAR) ========
    const loadState = async () => { // AGORA É ASSÍNCRONA E CARREGA DO DB VIA API
        DOMElements.tableOverlay.innerHTML = '<div class="loader-spinner"></div><p>Carregando dados...</p>';
        DOMElements.tableOverlay.classList.remove('hidden');
        
        try {
            const data = await sendApiRequest(API_URL, 'GET');
            
            if (data.status === 'success' && Array.isArray(data.machines)) {
                state.machines = data.machines.map(m => {
                    // Garante que todas as propriedades do JS existam
                    m.maintenance = m.maintenance || [];
                    // CORREÇÃO: Garante que os passos (steps) dentro de CADA manutenção existam.
                    m.maintenance = m.maintenance.map(maint => {
                        maint.steps = maint.steps || [];
                        // O ID agora vem do DB, mas se faltar, cria um placeholder
                        maint.id = maint.id || Date.now(); 
                        return maint;
                    });
                    m.history = m.history || [];
                    m.nextMaint = m.nextMaint || null;
                    m.quantity = Number(m.quantity) || 1;
                    return m;
                });
                
            } else {
                 notify(`Erro ao carregar dados: ${data.message || 'Formato de dados inválido.'}`, 'error');
                 state.machines = [];
            }
        } catch (e) {
            console.error("Falha ao carregar dados do banco de dados", e);
            state.machines = [];
        }
    };

    const saveState = () => { 
        console.warn("saveState() não faz mais nada. As ações devem chamar a API.");
    };

    const updateMachineField = async (machine, field, value) => { 
        const apiData = {
            action: 'update_field',
            tag: machine.id, 
            field: field,
            value: value
        };
        
        try {
            await sendApiRequest(API_URL, 'PUT', apiData);
            // Atualiza o estado local apenas após o sucesso da API
            machine[field] = value; 
            return true;
        } catch (e) {
            return false;
        }
    };

    const addHistory = async (machine, text) => { 
        if (!machine) return;
        
        const historyEntry = { 
            tag: machine.id, 
            description: text, 
        };
        
        try {
            await sendApiRequest(API_URL, 'POST', { action: 'add_history', data: historyEntry });
            machine.history = machine.history || [];
            // Adiciona ao histórico local com a data/hora atual, formatado para o BR
            machine.history.push({ date: new Date().toLocaleString('pt-BR'), text });
        } catch (e) {
            console.error("Falha ao salvar histórico:", e);
        }
    };

    // ======== LÓGICA DE ALERTA DE MANUTENÇÃO ========
    const getMaintAlertStatus = (machine) => {
        if (!machine.nextMaint || !machine.nextMaint.date) {
            return null; // Sem agendamento
        }
        
        // Pega a data de hoje (YYYY-MM-DD) no fuso horário local
        const today = new Date();
        today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        const todayStr = today.toISOString().slice(0, 10);
        
        const maintDate = machine.nextMaint.date;

        if (maintDate < todayStr) {
            return { type: 'danger', text: 'MANUTENÇÃO ATRASADA!' };
        }
        if (maintDate === todayStr) {
            return { type: 'warning', text: 'Manutenção agendada para HOJE.' };
        }
        return null; // Agendamento futuro
    };

    // ======== REFERÊNCIAS DO DOM ========
    const DOMElements = {
        tbody: document.querySelector('#machinesTable tbody'),
        tableOverlay: document.getElementById('table-overlay'), // NOVO
        searchEl: document.getElementById('search'),
        filterEl: document.getElementById('filterStatus'),
        totalCount: document.getElementById('totalCount'),
        // Métricas atualizadas
        metricTotal: document.getElementById('metricTotalDisplay'),
        metricOp: document.getElementById('metricOpDisplay'),
        metricMaint: document.getElementById('metricMaintDisplay'),
        metricInop: document.getElementById('metricInopDisplay'),
        metricNextMaint: document.getElementById('metricNextMaintDisplay'),
        metricQtyTotal: document.getElementById('metricQtyTotalDisplay'),
        // Fim Métricas
        pager: document.getElementById('pager'),
        showingRange: document.getElementById('showingRange'),
        backdrop: document.getElementById('modalBackdrop'),
        modalTitle: document.getElementById('modalTitle'),
        modalAlert: document.getElementById('modalAlert'), // NOVO
        mId: document.getElementById('mId'),
        mName: document.getElementById('mName'),
        mCap: document.getElementById('mCap'),
        mFab: document.getElementById('mFab'),
        mQtd: document.getElementById('mQtd'),
        mStatus: document.getElementById('mStatus'),
        historyList: document.getElementById('historyList'),
        tabMaintenance: document.getElementById('tabMaintenance'),
        tabSchedule: document.getElementById('tabSchedule'),
        machineForm: document.getElementById('machineForm')
    };

    // ======== FUNÇÕES DE RENDERIZAÇÃO ========

    const populateFilter = () => {
        STATUS.forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            DOMElements.filterEl.appendChild(option);
        });
    };

    const render = () => {
        const processedItems = getProcessedItems();
        const total = processedItems.length;
        const pages = Math.max(1, Math.ceil(total / state.perPage));
        if (state.page > pages && pages > 0) state.page = pages;
        const start = (state.page - 1) * state.perPage;
        const pagedItems = processedItems.slice(start, start + state.perPage);

        renderTable(pagedItems);
        updateMetrics();
        renderPager(pages);
        updateShowingRange(total, start, pagedItems.length);
        renderChart();
    };

    const getProcessedItems = () => {
        return state.machines
            .filter(m => (state.filter === 'all' || m.status === state.filter))
            .filter(m => {
                const q = state.search.trim().toLowerCase();
                if (!q) return true;
                return ['id', 'name', 'manufacturer'].some(field => (m[field] || '').toLowerCase().includes(q));
            })
            .sort((a, b) => {
                const A = (a[state.sortBy] || '').toString().toLowerCase();
                const B = (b[state.sortBy] || '').toString().toLowerCase();
                if (A < B) return state.sortDir === 'asc' ? -1 : 1;
                if (A > B) return state.sortDir === 'asc' ? 1 : -1;
                return 0;
            });
    };

    const renderTable = (items) => {
        DOMElements.tbody.innerHTML = '';
        
        if (items.length === 0) {
            // Mostra o estado vazio
            const emptyIcon = state.filter !== 'all' || state.search ? 'fa-solid fa-magnifying-glass' : 'fa-solid fa-box-open';
            const emptyTitle = state.filter !== 'all' || state.search ? 'Nenhum Resultado' : 'Nenhuma Máquina';
            const emptyText = state.filter !== 'all' || state.search ? 'Tente ajustar sua busca ou filtros.' : 'Adicione sua primeira máquina no painel ao lado.';
            
            DOMElements.tableOverlay.innerHTML = `
                <div class="empty-state">
                    <i class="${emptyIcon}"></i>
                    <h4>${emptyTitle}</h4>
                    <p>${emptyText}</p>
                </div>
            `;
            DOMElements.tableOverlay.classList.remove('hidden');
            return;
        }

        // Esconde o overlay se tivermos itens
        DOMElements.tableOverlay.classList.add('hidden');
        
        items.forEach(m => {
            const indexInState = state.machines.findIndex(x => x.id === m.id);
            const tr = document.createElement('tr');
            tr.className = 'row';

            // Verifica Alerta de Manutenção
            const alertStatus = getMaintAlertStatus(m);
            let alertBadgeHTML = '';
            if (alertStatus) {
                alertBadgeHTML = `<span class="maint-alert-badge ${alertStatus.type}" title="${alertStatus.text}"></span>`;
            }

            tr.innerHTML = `
                <td>${escapeHtml(m.id)}</td>
                <td contenteditable="true" data-field="name" data-idx="${indexInState}" class="editable" style="display:flex; align-items:center;">
                    ${alertBadgeHTML}
                    <span>${escapeHtml(m.name)}</span>
                </td>
                <td contenteditable="true" data-field="capacity" data-idx="${indexInState}" class="editable">${escapeHtml(m.capacity || '')}</td>
                <td contenteditable="true" data-field="manufacturer" data-idx="${indexInState}" class="editable">${escapeHtml(m.manufacturer || '')}</td>
                <td style="display:flex;gap:4px;align-items:center;">
                    <button class="btn secondary btn-qty-dec" data-idx="${indexInState}" title="Diminuir Qtd" style="padding: 6px; font-size:12px;"><i class="fa-solid fa-minus"></i></button>
                    <input data-idx="${indexInState}" data-field="quantity" type="number" min="1" value="${m.quantity}" style="width:50px;padding: 6px;text-align:center;"/>
                    <button class="btn secondary btn-qty-inc" data-idx="${indexInState}" title="Aumentar Qtd" style="padding: 6px; font-size:12px;"><i class="fa-solid fa-plus"></i></button>
                </td>
                <td><select data-idx="${indexInState}" class="statusSel">${STATUS.map(s => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
                <td class="actions">
                    <button class="btn secondary btn-view" data-idx="${indexInState}" title="Ver Detalhes"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn secondary btn-delete" data-idx="${indexInState}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            DOMElements.tbody.appendChild(tr);
        });
        addDynamicTableEventListeners();
    };

    const updateMetrics = () => {
        const total = state.machines.length;
        const qtyTotal = state.machines.reduce((acc, m) => acc + (m.quantity || 0), 0);
        
        // Pega a data de hoje e data daqui a 30 dias (ignorando fuso)
        const today = new Date();
        today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        const todayStr = today.toISOString().slice(0, 10);
        
        const next30Days = new Date(today.setDate(today.getDate() + 30));
        const next30DaysStr = next30Days.toISOString().slice(0, 10);

        const upcomingMaint = state.machines.filter(m => {
            if (!m.nextMaint || !m.nextMaint.date) return false;
            const maintDate = m.nextMaint.date;
            // Verifica se a manutenção está entre hoje e os próximos 30 dias
            return maintDate >= todayStr && maintDate <= next30DaysStr;
        }).length;

        DOMElements.totalCount.textContent = total;
        DOMElements.metricTotal.textContent = total;
        DOMElements.metricOp.textContent = state.machines.filter(m => m.status === 'EM OPERAÇÃO').length;
        DOMElements.metricMaint.textContent = state.machines.filter(m => m.status === 'EM MANUTENÇÃO').length;
        DOMElements.metricInop.textContent = state.machines.filter(m => m.status === 'INOPERANTE').length;
        DOMElements.metricQtyTotal.textContent = qtyTotal;
        DOMElements.metricNextMaint.textContent = upcomingMaint;
    };

    const renderPager = (pages) => {
        DOMElements.pager.innerHTML = '';
        if (pages <= 1) return;
        for (let p = 1; p <= pages; p++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${p === state.page ? 'active' : ''}`;
            btn.textContent = p;
            btn.addEventListener('click', () => { state.page = p; render(); });
            DOMElements.pager.appendChild(btn);
        }
    };

    const updateShowingRange = (total, start, pagedLength) => {
        const startNum = total === 0 ? 0 : start + 1;
        const endNum = Math.min(start + pagedLength, total);
        DOMElements.showingRange.innerHTML = `<b>${startNum}-${endNum}</b> de <b>${total}</b>`;
    };

    // ======== LÓGICA DO MODAL ========
    const openModal = (index) => {
        state.editingIndex = Number(index);
        const m = state.machines[index];
        if (!m) return;

        // Limpa alerta anterior
        DOMElements.modalAlert.style.display = 'none';
        DOMElements.modalAlert.className = 'modal-alert';
        
        // Verifica se há um novo alerta
        const alertStatus = getMaintAlertStatus(m);
        if (alertStatus) {
            DOMElements.modalAlert.textContent = alertStatus.text;
            DOMElements.modalAlert.classList.add(alertStatus.type);
            DOMElements.modalAlert.style.display = 'block';
        }

        DOMElements.modalTitle.textContent = `Detalhes — ${m.name}`;
        DOMElements.mId.textContent = m.id;
        DOMElements.mName.textContent = m.name;
        DOMElements.mCap.textContent = m.capacity || '-';
        DOMElements.mFab.textContent = m.manufacturer || '-';
        DOMElements.mQtd.textContent = m.quantity || 1;
        DOMElements.mStatus.textContent = m.status;
        DOMElements.mStatus.className = `pill ${getStatusClass(m.status)}`;

        // Recarrega as abas
        renderMaintenanceTab();
        renderHistoryTab();
        renderScheduleTab();

        DOMElements.backdrop.classList.add('show');
        document.querySelector('.tab[data-tab="view"]').click();
    };

    const closeModal = () => {
        DOMElements.backdrop.classList.remove('show');
        state.editingIndex = null;
    };

    // Renderiza a aba de Manutenção (com histórico de etapas)
    const renderMaintenanceTab = () => {
        const machine = state.machines[state.editingIndex];
        // Encontra a primeira manutenção que ainda NÃO tem data de fim (end_date é null)
        const activeMaint = (machine.maintenance || []).find(m => !m.end_date);
        let content = '';

        if (activeMaint) {
            // Se houver manutenção ativa, exibe detalhes e formulário para novas etapas
            content = `
                <div style="background:var(--bg);padding:15px;border-radius:8px;margin-bottom:15px;">
                    <p style="margin:0;font-weight:600;">Manutenção Ativa (${activeMaint.type})</p>
                    <p class="small" style="margin:5px 0;">Início: ${formatDate(activeMaint.start_date)} | Descrição Inicial: ${escapeHtml(activeMaint.desc)}</p>
                    <button id="endMaint" class="btn" data-maint-id="${activeMaint.id}"><i class="fa-solid fa-check"></i> Finalizar Manutenção</button>
                </div>
                
                <h4>Etapas da Manutenção (${(activeMaint.steps || []).length})</h4>
                <ul id="maintStepsList" style="list-style-type: none; padding: 0; max-height: 150px; overflow-y: auto;">
                    ${(activeMaint.steps || []).map(s => 
                        `<li><span class="small">${s.date}</span>: ${escapeHtml(s.description)}</li>`
                    ).join('') || '<li>Nenhuma etapa registrada ainda.</li>'}
                </ul>

                <form id="maintFormStep" style="margin-top:15px;">
                    <label>Adicionar Etapa/Ação</label>
                    <textarea id="stepDesc" rows="2" placeholder="Ex: Troca da Correia A30..." required></textarea>
                    <div style="display:flex;gap:8px;margin-top:12px">
                        <button class="btn secondary" type="submit"><i class="fa-solid fa-plus"></i> Registrar Etapa</button>
                    </div>
                </form>
                `;
        } else {
            // Se não houver, exibe o formulário para iniciar uma nova
            content = `
                <h4>Histórico de Manutenções (${(machine.maintenance || []).length})</h4>
                 <ul style="list-style-type: none; padding: 0; max-height: 200px; overflow-y: auto; margin-bottom: 20px;">
                    ${(machine.maintenance || []).map(m => 
                        `<li style="margin-bottom: 10px; border-left: 3px solid var(--primary); padding-left: 10px;">
                            <strong>${m.type}</strong>: ${escapeHtml(m.desc)} <br/>
                            <span class="small">Início: ${formatDate(m.start_date)} | Fim: ${formatDate(m.end_date)}</span>
                        </li>`
                    ).join('') || '<li>Nenhuma manutenção registrada.</li>'}
                </ul>
                <form id="maintFormNew">
                    <h4>Iniciar Nova Manutenção</h4>
                    <label>Tipo de intervenção</label>
                    <select id="maintType"><option value="Preventiva">Preventiva</option><option value="Corretiva">Corretiva</option></select>
                    <label style="margin-top:8px">Data de Início</label>
                    <input id="maintStartDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required />
                    <label style="margin-top:8px">Descrição do Problema/Serviço</label>
                    <textarea id="maintDesc" rows="3" placeholder="Descreva o que será feito..." required></textarea>
                    <div style="display:flex;gap:8px;margin-top:12px">
                        <button class="btn" type="submit"><i class="fa-solid fa-screwdriver-wrench"></i> Iniciar Manutenção</button>
                    </div>
                </form>`;
        }
        DOMElements.tabMaintenance.innerHTML = content;
        addMaintenanceEventListeners();
    };

    // Renderiza a aba de Agendamento
    const renderScheduleTab = () => {
        const machine = state.machines[state.editingIndex];
        // Encontra os elementos dentro da aba de agendamento (DOM do HTML principal)
        const display = document.getElementById('nextMaintDisplay');
        const dateInput = document.getElementById('nextMaintDate');
        const descTextarea = document.getElementById('nextMaintDesc');
        const scheduleForm = document.getElementById('scheduleForm');
        const clearBtn = document.getElementById('clearSchedule');
        const startBtn = document.getElementById('startScheduleBtn');

        if (machine.nextMaint && machine.nextMaint.date) {
            display.innerHTML = `${formatDate(machine.nextMaint.date)} (${escapeHtml(machine.nextMaint.desc)})`;
            dateInput.value = machine.nextMaint.date;
            descTextarea.value = machine.nextMaint.desc;
            startBtn.style.display = 'inline-flex'; // MOSTRA o botão "Iniciar"
        } else {
            display.textContent = 'N/A';
            dateInput.value = '';
            descTextarea.value = '';
            startBtn.style.display = 'none'; // ESCONDE o botão "Iniciar"
        }
        
        scheduleForm.onsubmit = async (e) => { 
            e.preventDefault();
            const date = dateInput.value;
            const desc = descTextarea.value.trim();

            if (!date) {
                notify('A data de agendamento é obrigatória.', 'error');
                return;
            }

            const newMaint = { date, desc };

            if (await updateMachineField(machine, 'nextMaint', JSON.stringify(newMaint))) {
                machine.nextMaint = newMaint; // Atualiza o estado local
                await addHistory(machine, `Próxima manutenção agendada para: ${formatDate(date)}`);
                notify('Agendamento salvo!', 'success');
                renderScheduleTab(); // Recarrega a aba
                render(); // Atualiza as métricas (ex: Próx. Maint.)
                openModal(state.editingIndex); // Reabre o modal para mostrar o alerta, se houver
            }
        };

        clearBtn.onclick = async () => { 
            if (!machine.nextMaint) return;
            
            if (await updateMachineField(machine, 'nextMaint', null)) {
                machine.nextMaint = null; // Atualiza o estado local
                await addHistory(machine, `Agendamento de próxima manutenção cancelado.`);
                notify('Agendamento cancelado.', 'info');
                renderScheduleTab(); // Recarrega a aba
                render(); // Atualiza as métricas
                openModal(state.editingIndex); // Reabre o modal para limpar o alerta
            }
        };

        // ===== NOVA LÓGICA PARA O BOTÃO "INICIAR AGORA" =====
        startBtn.onclick = async () => {
            const i = state.editingIndex;
            const machine = state.machines[i];
            
            if (!machine.nextMaint) {
                notify('Nenhum agendamento para iniciar.', 'error');
                return;
            }
            
            const activeMaint = (machine.maintenance || []).find(m => !m.end_date);
            if (activeMaint) {
                notify('Já existe uma manutenção ativa. Finalize-a antes de iniciar a agendada.', 'error');
                return;
            }

            // USA O NOVO MODAL
            showConfirm(
                'Iniciar Manutenção?',
                'Deseja iniciar a manutenção agendada agora? O status da máquina será alterado para "EM MANUTENÇÃO".',
                async () => { // A lógica assíncrona vai aqui dentro
                    const schedule = machine.nextMaint;
                    const newMaintData = {
                        tag: machine.id,
                        type: 'Preventiva',
                        desc: schedule.desc || 'Manutenção Agendada',
                        start_date: new Date().toISOString().slice(0, 10)
                    };

                    try {
                        const apiResponse = await sendApiRequest(API_URL, 'POST', { action: 'start_maintenance', data: newMaintData });
                        const newMaintId = apiResponse.maint_id; 
                        
                        machine.maintenance = machine.maintenance || [];
                        machine.maintenance.push({
                            id: newMaintId,
                            type: newMaintData.type,
                            desc: newMaintData.desc,
                            start_date: newMaintData.start_date,
                            end_date: null,
                            steps: []
                        });

                        await addHistory(machine, `Manutenção (Agendada) INICIADA. Motivo: ${newMaintData.desc}`);
                        await updateMachineField(machine, 'nextMaint', null);
                        
                        if (await updateMachineField(machine, 'status', 'EM MANUTENÇÃO')) {
                            notify('Manutenção agendada iniciada com sucesso!', 'success');
                            render(); 
                            openModal(i); 
                            document.querySelector('.tab[data-tab="maintenance"]').click(); 
                        }
                    } catch (e) {
                        console.error("Falha ao iniciar manutenção agendada:", e);
                        notify('Erro ao iniciar manutenção.', 'error');
                    }
                },
                'warning' // Tipo 'warning' (azul)
            );
        };
    };

    const renderHistoryTab = () => {
        const machine = state.machines[state.editingIndex];
        DOMElements.historyList.innerHTML = (machine.history || []).slice().reverse().map(h =>
            `<li><span class="small">${h.date}</span><p style="margin:2px 0 10px">${escapeHtml(h.text)}</p></li>`
        ).join('') || '<li>Nenhum histórico registrado.</li>';
    };

    // ======== LÓGICA DO GRÁFICO (CHART.JS) ========
    let chart = null;
    const renderChart = () => {
        const counts = STATUS.reduce((acc, s) => { acc[s] = 0; return acc; }, {});
        state.machines.forEach(m => { counts[m.status]++; });

        const labels = STATUS;
        const data = labels.map(l => counts[l]);
        const backgroundColors = ['#16a34a', '#4f46e5', '#d97706', '#dc2626', '#64748b', '#f97316'];

        const ctx = document.getElementById('statusChart').getContext('2d');
        if (chart) {
            chart.data.labels = labels;
            chart.data.datasets[0].data = data;
            chart.options.plugins.legend.labels.color = getComputedStyle(document.body).getPropertyValue('--text');
            chart.update();
            return;
        }
        chart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: backgroundColors, borderWidth: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { padding: 15, color: getComputedStyle(document.body).getPropertyValue('--text') } },
                    tooltip: {
                        callbacks: {
                            label: (c) => ` ${c.label}: ${c.raw} (${((c.raw / state.machines.length) * 100).toFixed(1)}%)`
                        }
                    }
                }
            }
        });
    };

    // ======== FUNÇÕES DE AÇÃO (ADICIONAR/EXCLUIR/ETC) ========
    const addMachine = async () => { 
        const id = document.getElementById('idItem').value.trim();
        const name = document.getElementById('nomeMaquina').value.trim();
        if (!id || !name) {
            notify('ID e Nome são obrigatórios!', 'error');
            return;
        }
        if (state.machines.some(m => m.id === id)) {
            // Usa o novo modal de confirmação
            showConfirm(
                'ID Duplicado',
                `Já existe uma máquina com ID "${id}". Deseja adicionar mesmo assim?`,
                () => { // Só executa a adição se o usuário confirmar
                    _executeAddMachine();
                },
                'warning' // Tipo 'warning' (azul)
            );
            return; // Espera a confirmação
        }
        
        _executeAddMachine(); // Adiciona direto se o ID não for duplicado
    };
    
    // Função auxiliar para a lógica de adição (para evitar repetição)
    const _executeAddMachine = async () => {
        const id = document.getElementById('idItem').value.trim();
        const name = document.getElementById('nomeMaquina').value.trim();
        
        const newMachine = {
            id, name,
            capacity: document.getElementById('capacidade').value.trim(),
            manufacturer: document.getElementById('fabricante').value.trim(),
            quantity: Number(document.getElementById('quantidade').value) || 1,
            status: 'OK',
            maintenance: [], history: [], nextMaint: null
        };
        
        try {
            const apiData = {
                action: 'add_machine',
                data: newMachine
            };
            await sendApiRequest(API_URL, 'POST', apiData);
            
            await addHistory(newMachine, 'Máquina registrada no sistema.');
            
            // Adiciona localmente apenas após o sucesso da API
            state.machines.unshift(newMachine);
            DOMElements.machineForm.reset();
            document.getElementById('quantidade').value = 1;
            notify('Máquina adicionada com sucesso!', 'success');
            render();
        } catch (e) {
            // A notificação de erro já é tratada por sendApiRequest
        }
    };

    const deleteMachine = async (index) => { 
        const machine = state.machines[index];
        if (!machine) return;

        try {
            const apiData = {
                action: 'delete_machine',
                tag: machine.id 
            };
            await sendApiRequest(API_URL, 'DELETE', apiData);
            
            state.machines.splice(index, 1);
            notify('Máquina removida.', 'info');
            render();
            if (state.editingIndex !== null) closeModal();
        } catch (e) {
        }
    };

    const updateQuantity = async (index, change) => { 
        const machine = state.machines[index];
        const oldQty = machine.quantity;
        const newQty = Math.max(1, oldQty + change);

        if (oldQty !== newQty) {
            if (await updateMachineField(machine, 'quantity', newQty)) {
                await addHistory(machine, `Quantidade alterada de ${oldQty} para ${newQty}.`);
                notify('Quantidade atualizada', 'success');
                render();
            }
        }
    };

    // ======== EVENT LISTENERS ========
    const addEventListeners = () => {
        
        DOMElements.machineForm.addEventListener('submit', e => { e.preventDefault(); addMachine(); });
        document.getElementById('resetForm').addEventListener('click', () => {
            DOMElements.machineForm.reset();
            document.getElementById('quantidade').value = 1;
        });

        DOMElements.searchEl.addEventListener('input', () => { state.search = DOMElements.searchEl.value; state.page = 1; render(); });
        DOMElements.filterEl.addEventListener('change', () => { state.filter = DOMElements.filterEl.value; state.page = 1; render(); });

        document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (state.sortBy === key) {
                state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortBy = key;
                state.sortDir = 'asc';
            }
            render();
        }));

        document.getElementById('modalClose').addEventListener('click', closeModal);
        DOMElements.backdrop.addEventListener('click', e => { if (e.target === DOMElements.backdrop) closeModal(); });
        
        // ATUALIZADO: Botão de excluir no modal
        document.getElementById('modalDelete').addEventListener('click', () => {
            const machine = state.machines[state.editingIndex];
            showConfirm(
                'Excluir Máquina?', 
                `Tem certeza que deseja excluir "${machine.name}"? Esta ação é permanente.`,
                () => { deleteMachine(state.editingIndex); },
                'danger'
            );
        });

        document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
            document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const tabName = e.currentTarget.dataset.tab;
            ['view', 'maintenance', 'history', 'schedule'].forEach(id => {
                document.getElementById(`tab${id.charAt(0).toUpperCase() + id.slice(1)}`).style.display = (tabName === id) ? 'block' : 'none';
            });
            if (tabName === 'maintenance') renderMaintenanceTab();
            if (tabName === 'history') renderHistoryTab();
            if (tabName === 'schedule') renderScheduleTab();
        }));

        setupExtraFeatures();
    };

    const addDynamicTableEventListeners = () => {
        document.querySelectorAll('.btn-view').forEach(b => b.addEventListener('click', e => openModal(e.currentTarget.dataset.idx)));
        
        // ATUALIZADO: Botão de excluir na tabela
        document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', e => {
            const index = +e.currentTarget.dataset.idx;
            const machine = state.machines[index];
            showConfirm(
                'Excluir Máquina?', 
                `Tem certeza que deseja excluir "${machine.name}"? Esta ação é permanente.`,
                () => { deleteMachine(index); },
                'danger'
            );
        }));
        
        document.querySelectorAll('.btn-qty-inc').forEach(b => b.addEventListener('click', e => updateQuantity(+e.currentTarget.dataset.idx, 1)));
        document.querySelectorAll('.btn-qty-dec').forEach(b => b.addEventListener('click', e => updateQuantity(+e.currentTarget.dataset.idx, -1)));

        document.querySelectorAll('input[data-field="quantity"]').forEach(inp => inp.addEventListener('change', async e => { 
            const index = +e.currentTarget.dataset.idx;
            const machine = state.machines[index];
            const oldQty = machine.quantity;
            const newQty = Math.max(1, Number(e.currentTarget.value) || 1);
            
            if (oldQty !== newQty) {
                if (await updateMachineField(machine, 'quantity', newQty)) {
                    await addHistory(machine, `Quantidade alterada de ${oldQty} para ${newQty}.`);
                    notify('Quantidade atualizada', 'success');
                }
            }
            e.currentTarget.value = machine.quantity; 
            render();
        }));

        document.querySelectorAll('.statusSel').forEach(s => s.addEventListener('change', async e => { 
            const index = +e.currentTarget.dataset.idx;
            const machine = state.machines[index];
            const oldStatus = machine.status;
            const newStatus = e.currentTarget.value;
            
            if (await updateMachineField(machine, 'status', newStatus)) {
                await addHistory(machine, `Status alterado de "${oldStatus}" para "${newStatus}".`);
                render();
            } else {
                 e.currentTarget.value = oldStatus; 
            }
        }));

        document.querySelectorAll('.editable').forEach(td => {
            td.addEventListener('keydown', e => { if(e.key === 'Enter') { e.preventDefault(); e.target.blur(); }});
            td.addEventListener('blur', async e => { 
                const idx = +e.currentTarget.dataset.idx;
                const machine = state.machines[idx];
                const field = e.currentTarget.dataset.field;
                const oldValue = machine[field] || '';
                // Pega o span de dentro do TD, se houver (para o campo nome com badge)
                const targetEl = e.currentTarget.querySelector('span') || e.currentTarget;
                const newValue = targetEl.textContent.trim();

                if (oldValue !== newValue) {
                    if (await updateMachineField(machine, field, newValue)) {
                        await addHistory(machine, `Campo "${field}" alterado de "${oldValue}" para "${newValue}".`);
                        notify('Alteração salva!', 'success');
                    } else {
                        targetEl.textContent = oldValue; 
                    }
                }
            });
        });
    };

    const addMaintenanceEventListeners = () => {
        // Iniciar Manutenção
        document.getElementById('maintFormNew')?.addEventListener('submit', async (e) => { 
            e.preventDefault();
            const i = state.editingIndex;
            const machine = state.machines[i];
            const type = document.getElementById('maintType').value;
            const desc = document.getElementById('maintDesc').value.trim();
            const startDate = document.getElementById('maintStartDate').value;
            if (!desc) { notify('A descrição é obrigatória.', 'error'); return; }

            const newMaintData = { tag: machine.id, type, desc, start_date: startDate };
            
            try {
                const apiResponse = await sendApiRequest(API_URL, 'POST', { action: 'start_maintenance', data: newMaintData });
                const newMaintId = apiResponse.maint_id; // Pega o ID REAL do DB

                machine.maintenance = machine.maintenance || [];
                // Adiciona o ID real do DB e a lista de steps vazia no estado local.
                machine.maintenance.push({ id: newMaintId, type, desc, start_date: startDate, end_date: null, steps: [] }); 
                
                await addHistory(machine, `Manutenção (${type}) INICIADA. Motivo: ${desc}`);
                if (await updateMachineField(machine, 'status', 'EM MANUTENÇÃO')) {
                    notify('Manutenção registrada com sucesso!', 'success');
                    render();
                    openModal(i); // Recarrega o modal para mostrar a aba de Etapas
                } else {
                    // Se falhar a atualização de status, é necessário reverter localmente
                    machine.maintenance.pop();
                    machine.history.pop();
                }

            } catch(e) { /* A notificação de erro já é tratada por sendApiRequest */ }
        });

        // Registrar Etapa
        document.getElementById('maintFormStep')?.addEventListener('submit', async (e) => { 
            e.preventDefault();
            const i = state.editingIndex;
            const machine = state.machines[i];
            const stepDesc = document.getElementById('stepDesc').value.trim();
            if (!stepDesc) { notify('A descrição da etapa é obrigatória.', 'error'); return; }
            
            const activeMaint = (machine.maintenance || []).find(x => !x.end_date);
            if (!activeMaint) return;

            const newStep = {
                tag: machine.id, 
                description: stepDesc, 
                maint_id: activeMaint.id // ID real da manutenção no DB
            };
            
            // NOTE: 'add_maint_step' está mapeado para handleAddHistory (Histórico Geral) no PHP.
            try {
                await sendApiRequest(API_URL, 'PUT', { action: 'add_maint_step', data: newStep });

                activeMaint.steps.push({ date: new Date().toLocaleString('pt-BR'), description: stepDesc });
                await addHistory(machine, `Etapa de Manutenção registrada: ${stepDesc}`);
                notify('Etapa registrada!', 'info');
                document.getElementById('stepDesc').value = '';
                renderMaintenanceTab(); 
            } catch(e) { /* A notificação de erro já é tratada por sendApiRequest */ }
        });

        // Finalizar Manutenção
        document.getElementById('endMaint')?.addEventListener('click', async (e) => { 
            const i = state.editingIndex;
            const machine = state.machines[i];
            const activeMaint = (machine.maintenance || []).find(x => !x.end_date);
            const maintId = e.currentTarget.dataset.maintId; // ID real da manutenção no DB

            if (!activeMaint || !maintId) return;

            const endDate = prompt("Informe a data de finalização (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
            if (endDate) {
                const finishData = { 
                    tag: machine.id, 
                    end_date: endDate, 
                    maint_id: maintId 
                };
                
                try {
                    // 1. Envia a requisição para ATUALIZAR a coluna data_fim no DB
                    await sendApiRequest(API_URL, 'PUT', { action: 'end_maintenance', data: finishData });

                    // 2. Atualiza o estado local e adiciona histórico
                    activeMaint.end_date = endDate;
                    await addHistory(machine, `Manutenção (${activeMaint.type}) FINALIZADA em ${formatDate(endDate)}. Teve ${activeMaint.steps ? activeMaint.steps.length : 0} etapas.`);
                    
                    // 3. Atualiza o status da máquina para 'OK'
                    if (await updateMachineField(machine, 'status', 'OK')) {
                        notify('Manutenção finalizada! Status da máquina alterado para "OK".', 'success');
                        render();
                        closeModal();
                    } else {
                        // Se falhar a atualização de status, reverte o estado local (opcional)
                        activeMaint.end_date = null;
                        machine.history.pop();
                    }
                } catch(e) { /* A notificação de erro já é tratada por sendApiRequest */ }
            }
        });
    };

    const setupExtraFeatures = () => {
        const applyTheme = () => {
            const theme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', theme);
            if (chart) {
                chart.options.plugins.legend.labels.color = getComputedStyle(document.body).getPropertyValue('--text');
                chart.update();
            }
        };
        
        // 💡 CORREÇÃO PRINCIPAL: Função auxiliar para lidar com o redimensionamento do Chart
        const handleChartResize = () => {
            // Usa setTimeout(0) para garantir que o navegador complete o layout
            // após a transição CSS antes de redimensionar o Chart.js.
            setTimeout(() => {
                if (chart) {
                    chart.resize();
                    chart.update(); 
                }
            }, 0);
        }
        
        // CORREÇÃO: Usar transitionend combinado com setTimeout(0)
        document.getElementById('toggleChartFullscreen').addEventListener('click', function() {
            const chartPanel = document.getElementById('chartPanel');
            const toggleChartIcon = this.querySelector('i');
            const isFullscreen = chartPanel.classList.toggle('fullscreen');

            if (isFullscreen) {
                toggleChartIcon.classList.replace('fa-expand', 'fa-compress');
                this.title = 'Sair da Tela Cheia';
    
                
            } else {
                toggleChartIcon.classList.replace('fa-compress', 'fa-expand');
                this.title = 'Tela Cheia';
                window.location.reload();
                render(); 
            }

            chartPanel.removeEventListener('transitionend', handleChartResize);
            chartPanel.addEventListener('transitionend', handleChartResize, { once: true });
        });


        // Exportação de JSON
        document.getElementById('exportJson').addEventListener('click', () => {
            const dataStr = JSON.stringify(state.machines, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `maintcontrol_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            notify('Dados exportados.', 'info');
        });

        // =================================================================
        // INÍCIO DA ALTERAÇÃO: Importação de JSON
        // =================================================================
        const importFile = document.getElementById('importFile');
        document.getElementById('importBtn').addEventListener('click', () => importFile.click());
        
        importFile.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            
            // Tornamos o onload assíncrono para usar await
            reader.onload = async (ev) => {
                try {
                    const importedMachines = JSON.parse(ev.target.result);
                    if (!Array.isArray(importedMachines)) throw new Error("O arquivo não contém um array JSON.");

                    // Mensagem de confirmação atualizada
                    if (confirm(`Deseja importar e salvar ${importedMachines.length} máquinas no banco de dados? (IDs existentes serão atualizados)`)) {
                        
                        // Normaliza os dados para garantir que campos essenciais existam
                        const machinesToSave = importedMachines.map(m => {
                            m.maintenance = m.maintenance || [];
                            m.history = m.history || [];
                            m.nextMaint = m.nextMaint || null;
                            m.id = m.id || `import_${Date.now()}`;
                            m.name = m.name || 'Sem Nome';
                            m.status = m.status || 'OK';
                            m.quantity = Number(m.quantity) || 1;
                            return m;
                        });

                        // Mostra um spinner de carregamento
                        DOMElements.tableOverlay.innerHTML = '<div class="loader-spinner"></div><p>Importando dados...</p>';
                        DOMElements.tableOverlay.classList.remove('hidden');

                        try {
                            // CHAMA A NOVA AÇÃO DA API
                            const response = await sendApiRequest(API_URL, 'POST', {
                                action: 'batch_add_machines',
                                data: machinesToSave
                            });
                            
                            notify(response.message, 'success'); // Ex: "15 máquinas importadas..."
                            
                            // RECARREGA TUDO DO BANCO DE DADOS
                            await loadState(); 
                            render(); // Renderiza a tabela com os novos dados
                            
                        } catch (apiError) {
                            // O erro da API já é notificado por sendApiRequest
                            // Apenas esconde o overlay
                            DOMElements.tableOverlay.classList.add('hidden');
                        }
                    }
                } catch (err) {
                    notify('Arquivo JSON inválido ou corrompido.', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Limpa o input para permitir reimportar o mesmo arquivo
        });
        // =================================================================
        // FIM DA ALTERAÇÃO
        // =================================================================
        
        document.getElementById('toggleTheme').addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme();
        });
        
        // ===== NOVO: Dashboard Interativo =====
        const setFilterAndRender = (status) => {
            state.filter = status;
            DOMElements.filterEl.value = status;
            state.page = 1;
            render();
            // Scroll suave de volta para a tabela
            document.getElementById('machinesTable').scrollIntoView({ behavior: 'smooth' });
        };

        document.getElementById('metricTotal').addEventListener('click', () => setFilterAndRender('all'));
        document.getElementById('metricOp').addEventListener('click', () => setFilterAndRender('EM OPERAÇÃO'));
        document.getElementById('metricMaint').addEventListener('click', () => setFilterAndRender('EM MANUTENÇÃO'));
        document.getElementById('metricInop').addEventListener('click', () => setFilterAndRender('INOPERANTE'));

        document.getElementById('metricNextMaint').addEventListener('click', () => {
             notify('Filtro por agendamentos futuros ainda em desenvolvimento.', 'info');
             // Aqui você poderia criar um filtro customizado
        });
        
        applyTheme();
    };

    // ======== FUNÇÕES AUXILIARES DE FORMATAÇÃO ========
    const getStatusClass = (s) => ({
        "OK": 'ok', "EM OPERAÇÃO": 'op', "EM MANUTENÇÃO": 'maint',
        "INOPERANTE": 'inop', "ESPERANDO PEÇAS": 'wait', "HORAS EXCEDENTES": 'exc'
    }[s] || 'ok');

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        // Formato AAAA-MM-DD
        if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateString.split('-');
            return `${day}/${month}/${year}`;
        }
        // Tentativa de outros formatos (data/hora completa)
        try {
            return new Date(dateString).toLocaleDateString('pt-BR');
        } catch (e) {
            return dateString;
        }
    };

    // ======== INICIALIZAÇÃO ========
    const init = async () => { 
        await loadState();
        populateFilter();
        addEventListeners();
        render();
    };

    init();
});