document.addEventListener('DOMContentLoaded', () => {
    // ======== ESTADO E CONSTANTES GLOBAIS ========
    const STATUS = ["OK", "EM OPERAÇÃO", "EM MANUTENÇÃO", "INOPERANTE", "ESPERANDO PEÇAS", "HORAS EXCEDENTES"];

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

    // ======== FUNÇÕES DE DADOS (CARREGAR/SALVAR) ========
    const loadState = () => {
        try {
            state.machines = JSON.parse(localStorage.getItem('machines') || '[]').map(m => {
                // Garantir que as novas propriedades existam no objeto ao carregar
                m.maintenance = m.maintenance || [];
                m.history = m.history || [];
                m.nextMaint = m.nextMaint || null;
                return m;
            });
        } catch (e) {
            console.error("Falha ao carregar dados do localStorage", e);
            state.machines = [];
        }
    };

    const saveState = () => {
        localStorage.setItem('machines', JSON.stringify(state.machines));
    };

    const addHistory = (index, text) => {
        const machine = state.machines[index];
        if (!machine) return;
        machine.history = machine.history || [];
        machine.history.push({ date: new Date().toLocaleString('pt-BR'), text });
    };

    // ======== REFERÊNCIAS DO DOM ========
    const DOMElements = {
        tbody: document.querySelector('#machinesTable tbody'),
        searchEl: document.getElementById('search'),
        filterEl: document.getElementById('filterStatus'),
        totalCount: document.getElementById('totalCount'),
        metricTotal: document.getElementById('metricTotal'),
        metricOp: document.getElementById('metricOp'),
        metricMaint: document.getElementById('metricMaint'),
        metricInop: document.getElementById('metricInop'),
        metricNextMaint: document.getElementById('metricNextMaint'), // Nova Métrica
        metricQtyTotal: document.getElementById('metricQtyTotal'),   // Nova Métrica
        pager: document.getElementById('pager'),
        showingRange: document.getElementById('showingRange'),
        backdrop: document.getElementById('modalBackdrop'),
        modalTitle: document.getElementById('modalTitle'),
        mId: document.getElementById('mId'),
        mName: document.getElementById('mName'),
        mCap: document.getElementById('mCap'),
        mFab: document.getElementById('mFab'),
        mQtd: document.getElementById('mQtd'),
        mStatus: document.getElementById('mStatus'),
        historyList: document.getElementById('historyList'),
        tabMaintenance: document.getElementById('tabMaintenance'),
        tabSchedule: document.getElementById('tabSchedule'), // Nova Aba
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
            DOMElements.tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px">Nenhuma máquina encontrada.</td></tr>';
            return;
        }
        items.forEach(m => {
            const indexInState = state.machines.findIndex(x => x.id === m.id);
            const tr = document.createElement('tr');
            tr.className = 'row';
            // Novo: Botões de + e - para a Quantidade
            tr.innerHTML = `
                <td>${escapeHtml(m.id)}</td>
                <td contenteditable="true" data-field="name" data-idx="${indexInState}" class="editable">${escapeHtml(m.name)}</td>
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
        const next30Days = new Date();
        next30Days.setDate(next30Days.getDate() + 30);
        const upcomingMaint = state.machines.filter(m => {
            if (!m.nextMaint || !m.nextMaint.date) return false;
            const maintDate = new Date(m.nextMaint.date + 'T00:00:00'); // Adiciona T00:00:00 para evitar problemas de fuso horário
            return maintDate >= new Date() && maintDate <= next30Days;
        }).length;

        DOMElements.totalCount.textContent = total;
        DOMElements.metricTotal.textContent = total;
        DOMElements.metricOp.textContent = state.machines.filter(m => m.status === 'EM OPERAÇÃO').length;
        DOMElements.metricMaint.textContent = state.machines.filter(m => m.status === 'EM MANUTENÇÃO').length;
        DOMElements.metricInop.textContent = state.machines.filter(m => m.status === 'INOPERANTE').length;
        DOMElements.metricQtyTotal.textContent = qtyTotal; // Nova Métrica
        DOMElements.metricNextMaint.textContent = upcomingMaint; // Nova Métrica
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

        DOMElements.modalTitle.textContent = `Detalhes — ${m.name}`;
        DOMElements.mId.textContent = m.id;
        DOMElements.mName.textContent = m.name;
        DOMElements.mCap.textContent = m.capacity || '-';
        DOMElements.mFab.textContent = m.manufacturer || '-';
        DOMElements.mQtd.textContent = m.quantity || 1;
        DOMElements.mStatus.textContent = m.status;
        DOMElements.mStatus.className = `pill ${getStatusClass(m.status)}`;

        renderMaintenanceTab();
        renderHistoryTab();
        renderScheduleTab(); // Renderiza a nova aba

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
        const activeMaint = (machine.maintenance || []).find(m => !m.end_date);
        let content = '';

        if (activeMaint) {
            // Se houver manutenção ativa, exibe detalhes e formulário para novas etapas
            content = `
                <div style="background:var(--bg);padding:15px;border-radius:8px;margin-bottom:15px;">
                    <p style="margin:0;font-weight:600;">Manutenção Ativa (${activeMaint.type})</p>
                    <p class="small" style="margin:5px 0;">Início: ${formatDate(activeMaint.start_date)} | Descrição Inicial: ${escapeHtml(activeMaint.desc)}</p>
                    <button id="endMaint" class="btn"><i class="fa-solid fa-check"></i> Finalizar Manutenção</button>
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
        const display = document.getElementById('nextMaintDisplay');
        const dateInput = document.getElementById('nextMaintDate');
        const descTextarea = document.getElementById('nextMaintDesc');
        const scheduleForm = document.getElementById('scheduleForm');
        const clearBtn = document.getElementById('clearSchedule');

        if (machine.nextMaint && machine.nextMaint.date) {
            // Exibe a data no formato DD/MM/YYYY
            display.innerHTML = `**${formatDate(machine.nextMaint.date)}** (${escapeHtml(machine.nextMaint.desc)})`;
            // Define o valor do input (que deve ser YYYY-MM-DD)
            dateInput.value = machine.nextMaint.date;
            descTextarea.value = machine.nextMaint.desc;
        } else {
            display.textContent = 'N/A';
            dateInput.value = '';
            descTextarea.value = '';
        }
        
        scheduleForm.onsubmit = (e) => {
            e.preventDefault();
            const date = dateInput.value;
            const desc = descTextarea.value.trim();

            if (!date) {
                notify('A data de agendamento é obrigatória.', 'error');
                return;
            }

            machine.nextMaint = { date, desc };
            addHistory(state.editingIndex, `Próxima manutenção agendada para: ${formatDate(date)}`);
            saveState();
            notify('Agendamento salvo!', 'success');
            renderScheduleTab();
            render();
        };

        clearBtn.onclick = () => {
            if (!machine.nextMaint) return;
            machine.nextMaint = null;
            addHistory(state.editingIndex, `Agendamento de próxima manutenção cancelado.`);
            saveState();
            notify('Agendamento limpo.', 'info');
            renderScheduleTab();
            render();
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
            // A cor do texto da legenda pode mudar com o tema, atualizamos aqui
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
    const addMachine = () => {
        const id = document.getElementById('idItem').value.trim();
        const name = document.getElementById('nomeMaquina').value.trim();
        if (!id || !name) {
            notify('ID e Nome são obrigatórios!', 'error');
            return;
        }
        if (state.machines.some(m => m.id === id)) {
            if (!confirm(`Já existe uma máquina com ID "${id}". Deseja adicionar mesmo assim?`)) return;
        }

        const newMachine = {
            id, name,
            capacity: document.getElementById('capacidade').value.trim(),
            manufacturer: document.getElementById('fabricante').value.trim(),
            quantity: Number(document.getElementById('quantidade').value) || 1,
            status: 'OK',
            maintenance: [], history: [{ date: new Date().toLocaleString('pt-BR'), text: 'Máquina registrada no sistema.' }],
            nextMaint: null
        };
        state.machines.unshift(newMachine);
        saveState();
        DOMElements.machineForm.reset();
        document.getElementById('quantidade').value = 1;
        notify('Máquina adicionada com sucesso!', 'success');
        render();
    };

    const deleteMachine = (index) => {
        addHistory(index, `Máquina removida do sistema.`);
        state.machines.splice(index, 1);
        saveState();
        notify('Máquina removida.', 'info');
        render();
    };

    // Função de atualização de quantidade (agora chamada pelos botões)
    const updateQuantity = (index, change) => {
        const machine = state.machines[index];
        const oldQty = machine.quantity;
        const newQty = Math.max(1, oldQty + change);

        if (oldQty !== newQty) {
            machine.quantity = newQty;
            addHistory(index, `Quantidade alterada de ${oldQty} para ${newQty}.`);
            saveState();
            notify('Quantidade atualizada', 'success');
            render();
        }
    };

    // ======== EVENT LISTENERS ========
    const addEventListeners = () => {
        // ... (Seus event listeners existentes)
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
        document.getElementById('modalDelete').addEventListener('click', () => {
            if (confirm('Tem certeza que deseja excluir esta máquina permanentemente?')) {
                deleteMachine(state.editingIndex);
                closeModal();
            }
        });

        document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
            document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const tabName = e.currentTarget.dataset.tab;
            ['view', 'maintenance', 'history', 'schedule'].forEach(id => {
                document.getElementById(`tab${id.charAt(0).toUpperCase() + id.slice(1)}`).style.display = (tabName === id) ? 'block' : 'none';
            });
            // Recarrega o conteúdo das abas dinâmicas
            if (tabName === 'maintenance') renderMaintenanceTab();
            if (tabName === 'history') renderHistoryTab();
            if (tabName === 'schedule') renderScheduleTab();
        }));

        setupExtraFeatures();
    };

    const addDynamicTableEventListeners = () => {
        document.querySelectorAll('.btn-view').forEach(b => b.addEventListener('click', e => openModal(e.currentTarget.dataset.idx)));
        document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', e => {
            if (confirm('Tem certeza que deseja excluir esta máquina?')) deleteMachine(+e.currentTarget.dataset.idx);
        }));
        
        // Novo: Eventos para botões de Quantidade
        document.querySelectorAll('.btn-qty-inc').forEach(b => b.addEventListener('click', e => updateQuantity(+e.currentTarget.dataset.idx, 1)));
        document.querySelectorAll('.btn-qty-dec').forEach(b => b.addEventListener('click', e => updateQuantity(+e.currentTarget.dataset.idx, -1)));

        document.querySelectorAll('input[data-field="quantity"]').forEach(inp => inp.addEventListener('change', e => {
            const index = +e.currentTarget.dataset.idx;
            const oldQty = state.machines[index].quantity;
            const newQty = Math.max(1, Number(e.currentTarget.value) || 1);
            if (oldQty !== newQty) {
                state.machines[index].quantity = newQty;
                addHistory(index, `Quantidade alterada de ${oldQty} para ${newQty}.`);
                saveState();
                notify('Quantidade atualizada', 'success');
            }
            e.currentTarget.value = newQty;
            render(); // Renderiza para atualizar as métricas
        }));

        document.querySelectorAll('.statusSel').forEach(s => s.addEventListener('change', e => {
            const index = +e.currentTarget.dataset.idx;
            const oldStatus = state.machines[index].status;
            const newStatus = e.currentTarget.value;
            state.machines[index].status = newStatus;
            addHistory(index, `Status alterado de "${oldStatus}" para "${newStatus}".`);
            saveState();
            render();
        }));

        document.querySelectorAll('.editable').forEach(td => {
            td.addEventListener('keydown', e => { if(e.key === 'Enter') { e.preventDefault(); e.target.blur(); }});
            td.addEventListener('blur', e => {
                const idx = +e.currentTarget.dataset.idx;
                const field = e.currentTarget.dataset.field;
                const oldValue = state.machines[idx][field] || '';
                const newValue = e.currentTarget.textContent.trim();

                if (oldValue !== newValue) {
                    state.machines[idx][field] = newValue;
                    addHistory(idx, `Campo "${field}" alterado de "${oldValue}" para "${newValue}".`);
                    saveState();
                    notify('Alteração salva!', 'success');
                }
            });
        });
    };

    const addMaintenanceEventListeners = () => {
        // Iniciar Manutenção
        document.getElementById('maintFormNew')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const i = state.editingIndex;
            const type = document.getElementById('maintType').value;
            const desc = document.getElementById('maintDesc').value.trim();
            const startDate = document.getElementById('maintStartDate').value;
            if (!desc) { notify('A descrição é obrigatória.', 'error'); return; }

            const machine = state.machines[i];
            machine.maintenance = machine.maintenance || [];
            machine.maintenance.push({ type, desc, start_date: startDate, end_date: null, steps: [] }); // Adiciona array de 'steps'

            addHistory(i, `Manutenção (${type}) INICIADA. Motivo: ${desc}`);
            machine.status = 'EM MANUTENÇÃO';
            saveState();
            notify('Manutenção registrada com sucesso!', 'success');
            render();
            openModal(i); // Reabre o modal para mostrar a nova aba de etapas
        });

        // Registrar Etapa (Novo)
        document.getElementById('maintFormStep')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const i = state.editingIndex;
            const stepDesc = document.getElementById('stepDesc').value.trim();
            if (!stepDesc) { notify('A descrição da etapa é obrigatória.', 'error'); return; }
            
            const machine = state.machines[i];
            const activeMaint = (machine.maintenance || []).find(x => !x.end_date);
            if (!activeMaint) return;

            activeMaint.steps.push({ date: new Date().toLocaleString('pt-BR'), description: stepDesc });

            addHistory(i, `Etapa de Manutenção registrada: ${stepDesc}`);
            saveState();
            notify('Etapa registrada!', 'info');
            document.getElementById('stepDesc').value = '';
            renderMaintenanceTab(); // Atualiza a aba
        });

        // Finalizar Manutenção
        document.getElementById('endMaint')?.addEventListener('click', () => {
            const i = state.editingIndex;
            const machine = state.machines[i];
            const activeMaint = (machine.maintenance || []).find(x => !x.end_date);
            if (!activeMaint) return;

            const endDate = prompt("Informe a data de finalização (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
            if (endDate) {
                activeMaint.end_date = endDate;
                addHistory(i, `Manutenção (${activeMaint.type}) FINALIZADA. Teve ${activeMaint.steps ? activeMaint.steps.length : 0} etapas.`);
                machine.status = 'OK';
                saveState();
                notify('Manutenção finalizada! Status da máquina alterado para "OK".', 'success');
                render();
                closeModal();
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
        document.getElementById('toggleTheme').addEventListener('click', () => {
            const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme();
        });
        applyTheme();

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
            reader.onload = ev => {
                try {
                    const importedMachines = JSON.parse(ev.target.result);
                    if (!Array.isArray(importedMachines)) throw new Error("O arquivo não contém um array JSON.");
                    if (confirm(`Isso irá substituir TODOS os dados atuais. Deseja continuar e importar ${importedMachines.length} máquinas?`)) {
                        state.machines = importedMachines.map(m => {
                            // Garantir que novas propriedades existam nos dados importados
                            m.maintenance = m.maintenance || [];
                            m.history = m.history || [];
                            m.nextMaint = m.nextMaint || null;
                            return m;
                        });
                        saveState();
                        render();
                        notify('Dados importados com sucesso!', 'success');
                    }
                } catch (err) {
                    notify('Arquivo JSON inválido ou corrompido.', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    };

    // ======== FUNÇÕES AUXILIARES ========
    const notify = (text, type = 'info') => {
        const toasts = document.getElementById('toasts');
        const d = document.createElement('div');
        d.className = `toast ${type}`;
        d.textContent = text;
        toasts.appendChild(d);
        setTimeout(() => d.remove(), 3500);
    };

    const escapeHtml = (s) => s ? s.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';

    const getStatusClass = (s) => ({
        "OK": 'ok', "EM OPERAÇÃO": 'op', "EM MANUTENÇÃO": 'maint',
        "INOPERANTE": 'inop', "ESPERANDO PEÇAS": 'wait', "HORAS EXCEDENTES": 'exc'
    }[s] || 'ok');

    // Função que formata datas no formato ISO (YYYY-MM-DD) para DD/MM/YYYY
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        // Suporta formato AAAA-MM-DD (gerado pelo input type="date")
        if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateString.split('-');
            return `${day}/${month}/${year}`;
        }
        // Se não for data ISO, tenta formatar como data local (para o histórico)
        try {
            return new Date(dateString).toLocaleDateString('pt-BR');
        } catch (e) {
            return dateString;
        }
    };

    // ======== INICIALIZAÇÃO ========
    const init = () => {
        loadState();
        populateFilter();
        addEventListeners();
        render();
    };

    init();
});