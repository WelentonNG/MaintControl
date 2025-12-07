document.addEventListener('DOMContentLoaded', () => {
    
    // ======== SEGURANÇA: VERIFICAÇÃO DE LOGIN ========
    const isLoggedIn = localStorage.getItem('maintControl_session');
    
    // Se não estiver logado, redireciona para a pasta de login
    if (isLoggedIn !== 'true') {
        window.location.href = 'login/login.html';
        return; // Interrompe a execução
    }

    // Função de Logout
    const logoutSystem = () => {
        if(confirm) {
            localStorage.removeItem('maintControl_session');
            localStorage.removeItem('maintControl_user');
            window.location.href = 'login/login.html';
        }
    };

    // ======== ESTADO E CONSTANTES GLOBAIS ========
    const STATUS = ["OK", "EM OPERAÇÃO", "EM MANUTENÇÃO", "INOPERANTE", "ESPERANDO PEÇAS", "HORAS EXCEDENTES"];
    const API_URL = 'api.php'; 

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

    const escapeHtml = (str) => {
        if (str === null || str === undefined) return '';
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

        confirmModal.icon.className = 'icon';
        confirmModal.btnOk.className = 'btn';

        if (type === 'danger') {
            confirmModal.icon.classList.add('danger');
            confirmModal.icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            confirmModal.btnOk.classList.add('btn-confirm'); 
            confirmModal.btnOk.textContent = 'Sim, Excluir';
        } else if (type === 'warning') {
            confirmModal.icon.classList.add('warning');
            confirmModal.icon.innerHTML = '<i class="fa-solid fa-question-circle"></i>';
            confirmModal.btnOk.classList.add('btn'); 
            confirmModal.btnOk.textContent = 'Sim, Iniciar';
        }

        confirmModal.backdrop.classList.add('show');
    };

    const hideConfirm = () => {
        confirmModal.backdrop.classList.remove('show');
        confirmModal.onConfirm = null;
    };

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
    const loadState = async () => { 
        DOMElements.tableOverlay.innerHTML = '<div class="loader-spinner"></div><p>Carregando dados...</p>';
        DOMElements.tableOverlay.classList.remove('hidden');
        
        try {
            const data = await sendApiRequest(API_URL, 'GET');
            
            if (data.status === 'success' && Array.isArray(data.machines)) {
                state.machines = data.machines.map(m => {
                    m.maintenance = m.maintenance || [];
                    m.maintenance = m.maintenance.map(maint => {
                        maint.steps = maint.steps || [];
                        maint.id = maint.id || Date.now(); 
                        maint.tecnico = maint.tecnico || 'N/A';
                        maint.cost = maint.cost || null;
                        return maint;
                    });
                    m.history = m.history || [];
                    m.nextMaint = m.nextMaint || null;
                    m.quantity = Number(m.quantity) || 0; 
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

    const updateMachineField = async (machine, field, value) => { 
        const apiData = {
            action: 'update_field',
            tag: machine.id, 
            field: field,
            value: value
        };
        
        try {
            await sendApiRequest(API_URL, 'PUT', apiData);
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
            const response = await sendApiRequest(API_URL, 'POST', { action: 'add_history', data: historyEntry });
            machine.history = machine.history || [];
            machine.history.push({ date: new Date().toLocaleString('pt-BR'), text });
        } catch (e) {
            console.error("Falha ao salvar histórico:", e);
        }
    };

    // ======== LÓGICA DE ALERTA DE MANUTENÇÃO ========
    const getMaintAlertStatus = (machine) => {
        if (!machine.nextMaint || !machine.nextMaint.date) {
            return null; 
        }
        
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
        return null; 
    };

    // ======== REFERÊNCIAS DO DOM (ATUALIZADAS) ========
    const DOMElements = {
        tbody: document.querySelector('#machinesTable tbody'),
        tableOverlay: document.getElementById('table-overlay'), 
        searchEl: document.getElementById('search'),
        filterEl: document.getElementById('filterStatus'),
        totalCount: document.getElementById('totalCount'),
        metricTotal: document.getElementById('metricTotalDisplay'),
        metricOp: document.getElementById('metricOpDisplay'),
        metricMaint: document.getElementById('metricMaintDisplay'),
        metricInop: document.getElementById('metricInopDisplay'),
        metricNextMaint: document.getElementById('metricNextMaintDisplay'),
        metricQtyTotal: document.getElementById('metricQtyTotalDisplay'),
        metricActiveMaint: document.getElementById('metricActiveMaintDisplay'),
        metricDoneMaint: document.getElementById('metricDoneMaintDisplay'),
        pager: document.getElementById('pager'),
        showingRange: document.getElementById('showingRange'),
        backdrop: document.getElementById('modalBackdrop'),
        modalTitle: document.getElementById('modalTitle'),
        modalAlert: document.getElementById('modalAlert'), 
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
                if (state.sortBy === 'quantity') {
                    const A = a.quantity || 0;
                    const B = b.quantity || 0;
                    return state.sortDir === 'asc' ? A - B : B - A;
                }
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

        DOMElements.tableOverlay.classList.add('hidden');
        
        items.forEach(m => {
            const indexInState = state.machines.findIndex(x => x.id === m.id);
            const tr = document.createElement('tr');
            tr.className = 'row';

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
                
                <td contenteditable="true" data-field="quantity" data-idx="${indexInState}" class="editable" title="Horas de Uso. Clique para editar ou use o modal.">
                    ${m.quantity}
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
        
        const today = new Date();
        today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        const todayStr = today.toISOString().slice(0, 10);
        
        const date30DaysAgo = new Date(new Date().setDate(today.getDate() - 30));
        const date30DaysAgoStr = date30DaysAgo.toISOString().slice(0, 10);
        
        const next30Days = new Date(new Date().setDate(today.getDate() + 30));
        const next30DaysStr = next30Days.toISOString().slice(0, 10);

        let upcomingMaint = 0;
        let activeMaintCount = 0;
        let completedLast30dCount = 0;
        
        state.machines.forEach(m => {
            if (m.nextMaint && m.nextMaint.date) {
                const maintDate = m.nextMaint.date;
                if (maintDate >= todayStr && maintDate <= next30DaysStr) {
                    upcomingMaint++;
                }
            }
            (m.maintenance || []).forEach(maint => {
                if (!maint.end_date) {
                    activeMaintCount++;
                } else if (maint.end_date >= date30DaysAgoStr) {
                    completedLast30dCount++;
                }
            });
        });

        DOMElements.totalCount.textContent = total;
        DOMElements.metricTotal.textContent = total;
        DOMElements.metricOp.textContent = state.machines.filter(m => m.status === 'EM OPERAÇÃO').length;
        DOMElements.metricMaint.textContent = state.machines.filter(m => m.status === 'EM MANUTENÇÃO').length;
        DOMElements.metricInop.textContent = state.machines.filter(m => m.status === 'INOPERANTE').length;
        DOMElements.metricQtyTotal.textContent = qtyTotal;
        DOMElements.metricNextMaint.textContent = upcomingMaint;
        DOMElements.metricActiveMaint.textContent = activeMaintCount;
        DOMElements.metricDoneMaint.textContent = completedLast30dCount;
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

    // ======== LÓGICA DO MODAL (ATUALIZADA) ========
    const openModal = (index) => {
        state.editingIndex = Number(index);
        const m = state.machines[index];
        if (!m) return;

        DOMElements.modalAlert.style.display = 'none';
        DOMElements.modalAlert.className = 'modal-alert';
        
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
        DOMElements.mQtd.textContent = m.quantity || 0; 
        DOMElements.mStatus.textContent = m.status;
        DOMElements.mStatus.className = `pill ${getStatusClass(m.status)}`;

        renderMaintenanceTab();
        renderHistoryTab();
        renderScheduleTab();

        document.getElementById('logHoursForm').onsubmit = async (e) => {
            e.preventDefault();
            const hoursInput = document.getElementById('hoursToAdd');
            const reasonInput = document.getElementById('hoursReason');
            
            const hoursToAdd = Number(hoursInput.value);
            const reason = reasonInput.value.trim();

            if (hoursToAdd <= 0 || !reason) {
                notify('Informe horas válidas e um motivo.', 'error');
                return;
            }

            const currentHours = m.quantity || 0;
            const newHours = currentHours + hoursToAdd;

            if (await updateMachineField(m, 'quantity', newHours)) {
                await addHistory(m, `Registrado ${hoursToAdd}h de uso. Motivo: ${reason}. (Total: ${newHours}h)`);
                notify('Horas registradas com sucesso!', 'success');
                DOMElements.mQtd.textContent = newHours; 
                hoursInput.value = 1;
                reasonInput.value = '';
                render(); 
            }
        };

        DOMElements.backdrop.classList.add('show');
        document.querySelector('.tab[data-tab="view"]').click();
    };

    const closeModal = () => {
        DOMElements.backdrop.classList.remove('show');
        state.editingIndex = null;
    };

    const renderMaintenanceTab = () => {
        const machine = state.machines[state.editingIndex];
        const allMaintRecords = (machine.maintenance || []).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
        
        const activeMaint = allMaintRecords.find(m => !m.end_date);
        const pastMaint = allMaintRecords.filter(m => m.end_date);
        
        let content = '';

        if (!activeMaint) {
            content += `
                <form id="maintFormNew">
                    <h4><i class="fa-solid fa-plus-circle"></i> Iniciar Nova Manutenção</h4>
                    <div class="add-form" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label>Tipo de intervenção</label>
                            <select id="maintType"><option value="Preventiva">Preventiva</option><option value="Corretiva">Corretiva</option></select>
                        </div>
                        <div>
                            <label>Técnico Responsável</label>
                            <input id="maintTecnico" type="text" placeholder="Nome do técnico" required />
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label>Data de Início</label>
                            <input id="maintStartDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required />
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label>Descrição do Problema/Serviço</label>
                            <textarea id="maintDesc" rows="2" placeholder="Descreva o que será feito..." required></textarea>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:12px">
                        <button class="btn" type="submit"><i class="fa-solid fa-screwdriver-wrench"></i> Iniciar Manutenção</button>
                    </div>
                </form>
                <div class="separator"></div>
            `;
        }

        content += `<h4>Histórico de Manutenções (${allMaintRecords.length})</h4>`;
        content += '<div class="accordion-maint">';

        if (activeMaint) {
            content += renderMaintAccordionItem(activeMaint, true);
        }

        if (pastMaint.length > 0) {
            pastMaint.forEach(maint => {
                content += renderMaintAccordionItem(maint, false);
            });
        } else if (!activeMaint) {
             content += '<p>Nenhum registro de manutenção encontrado.</p>';
        }

        content += '</div>';

        DOMElements.tabMaintenance.innerHTML = content;
        addMaintenanceEventListeners(); 
    };

    const renderMaintAccordionItem = (maint, isOpen) => {
        const isActive = !maint.end_date;
        const steps = maint.steps || [];
        
        let costDisplay = 'N/A';
        if (maint.cost !== null && maint.cost > 0) {
            costDisplay = `R$ ${parseFloat(maint.cost).toFixed(2).replace('.', ',')}`;
        } else if (isActive) {
            costDisplay = 'Pendente';
        }

        return `
        <details ${isOpen ? 'open' : ''}>
            <summary>
                <div>
                    <strong>${maint.type}</strong> (${isActive ? 'Em Andamento' : 'Concluída'})
                    <div class="small">${formatDate(maint.start_date)} ${maint.end_date ? ' - ' + formatDate(maint.end_date) : ''}</div>
                </div>
                ${isActive ? '<span class="pill maint" style="padding: 5px 10px; font-size: 10px;">ATIVA</span>' : ''}
            </summary>
            
            <div class="maint-details-grid">
                <p><strong>Descrição Inicial</strong> ${escapeHtml(maint.desc)}</p>
                <p><strong>Técnico</strong> ${escapeHtml(maint.tecnico)}</p>
                <p><strong>Custo Total</strong> ${costDisplay}</p>
            </div>
            
            ${isActive ? `
                <form id="maintFormStep" style="padding: 16px; border-top: 1px solid var(--border-color);">
                    <label>Adicionar Etapa/Ação</label>
                    <textarea id="stepDesc" rows="2" placeholder="Ex: Troca da Correia A30..." required></textarea>
                    <div style="display:flex;gap:8px;margin-top:12px">
                        <button class="btn secondary" type="submit"><i class="fa-solid fa-plus"></i> Registrar Etapa</button>
                        <button id="endMaint" class="btn" type="button" data-maint-id="${maint.id}"><i class="fa-solid fa-check"></i> Finalizar Manutenção</button>
                    </div>
                </form>
            ` : ''}

            <h5 style="padding: 16px 16px 0; margin:0; border-top: 1px solid var(--border-color);">Etapas Executadas (${steps.length})</h5>
            <ul class="maint-steps-list">
                ${steps.length > 0 ? steps.map(s => `
                    <li>
                        <span class="small">${s.date}</span>
                        <p>${escapeHtml(s.description)}</p>
                    </li>
                `).join('') : '<li>Nenhuma etapa registrada.</li>'}
            </ul>
        </details>
        `;
    };

    const renderScheduleTab = () => {
        const machine = state.machines[state.editingIndex];
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
            startBtn.style.display = 'inline-flex'; 
        } else {
            display.textContent = 'N/A';
            dateInput.value = '';
            descTextarea.value = '';
            startBtn.style.display = 'none'; 
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
                machine.nextMaint = newMaint; 
                await addHistory(machine, `Próxima manutenção agendada para: ${formatDate(date)}`);
                notify('Agendamento salvo!', 'success');
                renderScheduleTab(); 
                render(); 
                openModal(state.editingIndex); 
            }
        };

        clearBtn.onclick = async () => { 
            if (!machine.nextMaint) return;
            
            if (await updateMachineField(machine, 'nextMaint', null)) {
                machine.nextMaint = null; 
                await addHistory(machine, `Agendamento de próxima manutenção cancelado.`);
                notify('Agendamento cancelado.', 'info');
                renderScheduleTab(); 
                render(); 
                openModal(state.editingIndex); 
            }
        };

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

            showConfirm(
                'Iniciar Manutenção?',
                'Deseja iniciar a manutenção agendada agora? O status da máquina será alterado para "EM MANUTENÇÃO".',
                async () => { 
                    const schedule = machine.nextMaint;
                    const newMaintData = {
                        tag: machine.id,
                        type: 'Preventiva',
                        desc: schedule.desc || 'Manutenção Agendada',
                        start_date: new Date().toISOString().slice(0, 10),
                        tecnico: 'Agendado' 
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
                            tecnico: newMaintData.tecnico, 
                            cost: null, 
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
                'warning' 
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
                            label: (c) => ` ${c.label}: ${c.raw} (${(state.machines.length > 0 ? (c.raw / state.machines.length) * 100 : 0).toFixed(1)}%)`
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
            showConfirm(
                'ID Duplicado',
                `Já existe uma máquina com ID "${id}". Deseja adicionar mesmo assim? (Pode causar conflitos)`,
                () => { 
                    _executeAddMachine();
                },
                'warning' 
            );
            return; 
        }
        
        _executeAddMachine(); 
    };
    
    const _executeAddMachine = async () => {
        const id = document.getElementById('idItem').value.trim();
        const name = document.getElementById('nomeMaquina').value.trim();
        
        const newMachine = {
            id, name,
            capacity: document.getElementById('capacidade').value.trim(),
            manufacturer: document.getElementById('fabricante').value.trim(),
            quantity: Number(document.getElementById('quantidade').value) || 0,
            status: 'OK',
            maintenance: [], history: [], nextMaint: null
        };
        
        try {
            const apiData = {
                action: 'add_machine',
                data: newMachine
            };
            await sendApiRequest(API_URL, 'POST', apiData);
            
            newMachine.history = [{ date: new Date().toLocaleString('pt-BR'), text: 'Máquina registrada no sistema.' }];
            
            state.machines.unshift(newMachine);
            DOMElements.machineForm.reset();
            document.getElementById('quantidade').value = 0; 
            notify('Máquina adicionada com sucesso!', 'success');
            render();
            
            await addHistory(newMachine, 'Máquina registrada no sistema.');

        } catch (e) {
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

    // ======== EVENT LISTENERS ========
    const addEventListeners = () => {
        
        DOMElements.machineForm.addEventListener('submit', e => { e.preventDefault(); addMachine(); });
        document.getElementById('resetForm').addEventListener('click', () => {
            DOMElements.machineForm.reset();
            document.getElementById('quantidade').value = 0; 
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

        // Adicionando listener para Logout (Segurança)
        const btnLogout = document.getElementById('btnLogout');
        if(btnLogout) {
            btnLogout.addEventListener('click', logoutSystem);
        }

        setupExtraFeatures();
    };

    const addDynamicTableEventListeners = () => {
        document.querySelectorAll('.btn-view').forEach(b => b.addEventListener('click', e => openModal(e.currentTarget.dataset.idx)));
        
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
                let oldValue = machine[field] || '';
                
                const targetEl = e.currentTarget.querySelector('span') || e.currentTarget;
                let newValue = targetEl.textContent.trim();

                if (field === 'quantity') {
                    oldValue = Number(oldValue) || 0;
                    newValue = Number(newValue.replace(/[^0-9.]/g, '')) || 0;
                }

                if (oldValue !== newValue) {
                    if (await updateMachineField(machine, field, newValue)) {
                        await addHistory(machine, `Campo "${field}" alterado de "${oldValue}" para "${newValue}".`);
                        notify('Alteração salva!', 'success');
                    } else {
                        targetEl.textContent = oldValue; 
                    }
                }
                targetEl.textContent = machine[field]; 
            });
        });
    };

    const addMaintenanceEventListeners = () => {
        
        document.getElementById('maintFormNew')?.addEventListener('submit', async (e) => { 
            e.preventDefault();
            const i = state.editingIndex;
            const machine = state.machines[i];
            
            const type = document.getElementById('maintType').value;
            const desc = document.getElementById('maintDesc').value.trim();
            const startDate = document.getElementById('maintStartDate').value;
            const tecnico = document.getElementById('maintTecnico').value.trim(); 
            
            if (!desc || !tecnico) { 
                notify('Descrição e Técnico são obrigatórios.', 'error'); 
                return; 
            }

            const newMaintData = { 
                tag: machine.id, 
                type, 
                desc, 
                start_date: startDate, 
                tecnico: tecnico 
            };
            
            try {
                const apiResponse = await sendApiRequest(API_URL, 'POST', { action: 'start_maintenance', data: newMaintData });
                const newMaintId = apiResponse.maint_id; 

                machine.maintenance = machine.maintenance || [];
                machine.maintenance.push({ 
                    id: newMaintId, 
                    type, 
                    desc, 
                    start_date: startDate, 
                    tecnico: tecnico, 
                    cost: null, 
                    end_date: null, 
                    steps: [] 
                }); 
                
                await addHistory(machine, `Manutenção (${type}) INICIADA. Técnico: ${tecnico}. Motivo: ${desc}`);
                
                if (await updateMachineField(machine, 'status', 'EM MANUTENÇÃO')) {
                    notify('Manutenção registrada com sucesso!', 'success');
                    render();
                    openModal(i); 
                } 

            } catch(e) { }
        });

        document.getElementById('maintFormStep')?.addEventListener('submit', async (e) => { 
            e.preventDefault();
            const i = state.editingIndex;
            const machine = state.machines[i];
            const stepDescEl = document.getElementById('stepDesc');
            const stepDesc = stepDescEl.value.trim();
            if (!stepDesc) { 
                notify('A descrição da etapa é obrigatória.', 'error'); 
                return; 
            }
            
            const activeMaint = (machine.maintenance || []).find(x => !x.end_date);
            if (!activeMaint) return; 

            const newStepData = {
                tag: machine.id, 
                description: stepDesc, 
                maint_id: activeMaint.id 
            };
            
            try {
                const response = await sendApiRequest(API_URL, 'PUT', { action: 'add_maint_step', data: newStepData });

                activeMaint.steps.push(response.new_step); 
                
                await addHistory(machine, `Etapa de Manutenção registrada: ${stepDesc}`);
                
                notify('Etapa registrada!', 'info');
                stepDescEl.value = '';
                renderMaintenanceTab(); 
            } catch(e) { }
        });

        document.getElementById('endMaint')?.addEventListener('click', async (e) => { 
            const i = state.editingIndex;
            const machine = state.machines[i];
            const activeMaint = (machine.maintenance || []).find(x => !x.end_date);
            const maintId = e.currentTarget.dataset.maintId; 

            if (!activeMaint || !maintId) return;

            const endDate = prompt("Informe a data de finalização (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
            if (!endDate) return; 

            const cost = prompt("Informe o Custo Total da Manutenção (ex: 150.99):");
            if (cost === null) return; 

            const finishData = { 
                tag: machine.id, 
                end_date: endDate, 
                maint_id: maintId,
                cost: cost || 0 
            };
            
            try {
                await sendApiRequest(API_URL, 'PUT', { action: 'end_maintenance', data: finishData });

                activeMaint.end_date = endDate;
                activeMaint.cost = parseFloat(cost) || 0; 
                
                await addHistory(machine, `Manutenção (${activeMaint.type}) FINALIZADA em ${formatDate(endDate)}. Custo: R$ ${activeMaint.cost.toFixed(2)}. Teve ${activeMaint.steps.length} etapas.`);
                
                if (await updateMachineField(machine, 'status', 'OK')) {
                    notify('Manutenção finalizada! Status da máquina alterado para "OK".', 'success');
                    render();
                    closeModal();
                } 
            } catch(e) { }
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
        
        const handleChartResize = () => {
            setTimeout(() => {
                if (chart) {
                    chart.resize();
                    chart.update(); 
                }
            }, 0);
        }
        
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

        const importFile = document.getElementById('importFile');
        document.getElementById('importBtn').addEventListener('click', () => importFile.click());
        
        importFile.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            
            reader.onload = async (ev) => {
                try {
                    const importedMachines = JSON.parse(ev.target.result);
                    if (!Array.isArray(importedMachines)) throw new Error("O arquivo não contém um array JSON.");

                    if (confirm(`Deseja importar e salvar ${importedMachines.length} máquinas no banco de dados? (IDs existentes serão atualizados)`)) {
                        
                        const machinesToSave = importedMachines.map(m => {
                            m.maintenance = m.maintenance || [];
                            m.history = m.history || [];
                            m.nextMaint = m.nextMaint || null;
                            m.id = m.id || `import_${Date.now()}`;
                            m.name = m.name || 'Sem Nome';
                            m.status = m.status || 'OK';
                            m.quantity = Number(m.quantity) || 0; 
                            return m;
                        });

                        DOMElements.tableOverlay.innerHTML = '<div class="loader-spinner"></div><p>Importando dados...</p>';
                        DOMElements.tableOverlay.classList.remove('hidden');

                        try {
                            const response = await sendApiRequest(API_URL, 'POST', {
                                action: 'batch_add_machines',
                                data: machinesToSave
                            });
                            
                            notify(response.message, 'success'); 
                            
                            await loadState(); 
                            render(); 
                            
                        } catch (apiError) {
                            DOMElements.tableOverlay.classList.add('hidden');
                        }
                    }
                } catch (err) {
                    notify('Arquivo JSON inválido ou corrompido.', 'error');
                }
            };
            reader.readText(file);
            e.target.value = ''; 
        });
        
        document.getElementById('toggleTheme').addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme();
        });
        
        const setFilterAndRender = (status) => {
            state.filter = status;
            DOMElements.filterEl.value = status;
            state.page = 1;
            render();
            document.getElementById('machinesTable').scrollIntoView({ behavior: 'smooth' });
        };

        document.getElementById('metricTotal').addEventListener('click', () => setFilterAndRender('all'));
        document.getElementById('metricOp').addEventListener('click', () => setFilterAndRender('EM OPERAÇÃO'));
        document.getElementById('metricMaint').addEventListener('click', () => setFilterAndRender('EM MANUTENÇÃO'));
        document.getElementById('metricInop').addEventListener('click', () => setFilterAndRender('INOPERANTE'));

        document.getElementById('metricNextMaint').addEventListener('click', () => {
             notify('Filtro por agendamentos futuros ainda em desenvolvimento.', 'info');
        });
        
        applyTheme();
    };

    const getStatusClass = (s) => ({
        "OK": 'ok', "EM OPERAÇÃO": 'op', "EM MANUTENÇÃO": 'maint',
        "INOPERANTE": 'inop', "ESPERANDO PEÇAS": 'wait', "HORAS EXCEDENTES": 'exc'
    }[s] || 'ok');

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateString.split('-');
            return `${day}/${month}/${year}`;
        }
        try {
            if (dateString.includes('T') || dateString.includes(' ')) {
                 return new Date(dateString).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            }
            return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
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

//TODO:Mudar o sistema de grafio para um painel pra ser melhor de visualizar
//TODO:Adicionar sistema de notificações por email para manutenções agendadas
//TODO:Fazer menuzinho onde apareca usuario logado