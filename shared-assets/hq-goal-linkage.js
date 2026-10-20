(function () {
  const L = GoalLinkage;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const channelByImport = { posDay: 'pos', privateDay: 'domain', instantRetailDay: 'instantRetail' };
  const panel = document.createElement('div'); panel.className = 'gl-panel'; panel.id = 'hqGoalLinkagePanel';
  panel.innerHTML = `<div class="gl-head"><strong>门店目标调整与导购重新分配</strong><div class="gl-tools"><label>演示角色 <select id="hqGoalRole"><option value="销售支持">销售支持</option><option value="HRBP">HRBP</option></select></label><button id="hqManualGoal">手动调整门店日目标</button><button id="hqOpenStore">打开门店端联动演示</button></div></div><div class="gl-muted">联动门店：华南区-蕉下测试门店（DP96325）。POS／私域变化后原导购目标失效；即时零售变化不影响导购目标。月总额保持不变。</div><div id="hqGoalLinkageSummary"></div>`;
  const toolbar = document.querySelector('#dayPage .table-toolbar');
  toolbar.after(panel);
  toolbar.insertAdjacentHTML('beforeend', '<button type="button" class="toolbar-btn" id="hqOpenGoalHistory" aria-haspopup="dialog" aria-controls="hqGoalHistoryModal" aria-expanded="false">查看变更记录与分配状态</button>');
  document.body.insertAdjacentHTML('beforeend', `<div id="hqGoalHistoryModal" class="gl-mask" hidden><section class="gl-modal" role="dialog" aria-modal="true" aria-labelledby="hqGoalHistoryTitle"><header><strong id="hqGoalHistoryTitle">查看变更记录与分配状态</strong><button type="button" data-hq-history-close aria-label="关闭变更记录">×</button></header><main><div class="gl-muted">展示各日期的全部变更记录，按变更时间倒序排列；分配状态为该日期当前状态。</div><div id="hqGoalLinkageHistory" class="gl-table-wrap"></div></main><footer><div class="gl-history-pagination"><span id="hqHistoryCount" aria-live="polite"></span><label>每页 <select id="hqHistoryPageSize" aria-label="每页记录数"><option value="10">10 条</option><option value="20">20 条</option><option value="50">50 条</option></select></label><button type="button" id="hqHistoryPrev">上一页</button><span id="hqHistoryPage"></span><button type="button" id="hqHistoryNext">下一页</button></div><button type="button" data-hq-history-close>关闭</button></footer></section></div>`);
  let historyPage = 1, historyPageSize = 10, historyReturnFocus = null, historyBodyOverflow = '';
  const historyModal = document.getElementById('hqGoalHistoryModal');
  const historyButton = document.getElementById('hqOpenGoalHistory');
  historyModal.querySelector('main .gl-muted').textContent = '展示各门店、各日期的全部变更记录，按变更时间倒序排列；分配状态为对应门店该日期的当前状态。';
  document.getElementById('hqGoalLinkageHistory').insertAdjacentHTML('beforebegin', '<div class="gl-history-search"><label for="hqHistoryStore">门店</label><input id="hqHistoryStore" type="search" placeholder="输入门店名称或编码" autocomplete="off"><button type="button" id="hqHistoryReset">重置</button></div>');
  function renderHistory(model = L.snapshot()) {
    // 按门店编码关联名称，避免同一天多家门店的记录混淆。
    const storeNames = new Map();
    [...state.monthRows, ...state.dayRows].forEach(row => {
      if (row.storeCode && row.storeName) storeNames.set(String(row.storeCode), row.storeName);
    });
    const allChanges = Object.values(model.days).flatMap(day => {
      const storeCode = String(day.storeCode ?? '');
      const storeName = day.storeName || storeNames.get(storeCode) || '门店名称未维护';
      return day.changes.map(change => ({ day, change, storeCode, storeName }));
    }).reverse().sort((a, b) => b.change.time.localeCompare(a.change.time));
    const keyword = document.getElementById('hqHistoryStore').value.trim().toLocaleLowerCase();
    const changes = allChanges.filter(row => !keyword || row.storeCode.toLocaleLowerCase().includes(keyword) || row.storeName.toLocaleLowerCase().includes(keyword));
    const pages = Math.max(1, Math.ceil(changes.length / historyPageSize));
    historyPage = Math.max(1, Math.min(historyPage, pages));
    const rows = changes.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
    document.getElementById('hqGoalLinkageHistory').innerHTML = rows.length ? `<table class="gl-table"><thead><tr><th>门店名称／编码</th><th>目标日期</th><th>变化渠道及金额（元）</th><th>操作人／原因／时间</th><th>当前分配状态</th></tr></thead><tbody>${rows.map(({ day, change, storeCode, storeName }) => `<tr><td>${escape(storeName)}<br><span class="gl-muted">${escape(storeCode || '—')}</span></td><td>${escape(day.day)}</td><td>${change.channels.map(c => `${L.LABELS[c]}：${L.money(change.before[c])} → ${L.money(change.after[c])}`).join('<br>')}</td><td>${escape(change.actor)}<br>${escape(change.reason)}<br>${escape(change.time)}</td><td>${day.pending ? '<span class="gl-status">待重新分配</span>' : day.changes.every(item => item.channels.every(c => c === 'instantRetail')) ? '不影响导购目标' : '分配已生效'}</td></tr>`).join('')}</tbody></table>` : `<div class="gl-history-empty">${allChanges.length && keyword ? '未找到匹配门店的变更记录' : '暂无变更记录'}</div>`;
    document.getElementById('hqHistoryCount').textContent = keyword ? `匹配 ${changes.length} 条 / 全部 ${allChanges.length} 条` : `共 ${changes.length} 条`;
    document.getElementById('hqHistoryPage').textContent = `第 ${historyPage} / ${pages} 页`;
    document.getElementById('hqHistoryPrev').disabled = historyPage <= 1;
    document.getElementById('hqHistoryNext').disabled = historyPage >= pages;
  }
  function closeHistory() {
    historyModal.hidden = true;
    historyButton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = historyBodyOverflow;
    (historyReturnFocus || historyButton).focus();
  }
  historyButton.onclick = () => {
    historyReturnFocus = document.activeElement;
    historyBodyOverflow = document.body.style.overflow;
    historyPage = 1;
    document.getElementById('hqHistoryStore').value = '';
    renderHistory();
    historyModal.hidden = false;
    historyButton.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    historyModal.querySelector('[data-hq-history-close]').focus();
  };
  historyModal.querySelectorAll('[data-hq-history-close]').forEach(button => button.onclick = closeHistory);
  historyModal.addEventListener('click', event => { if (event.target === historyModal) closeHistory(); });
  document.addEventListener('keydown', event => {
    if (historyModal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeHistory(); }
    if (event.key === 'Tab') {
      const controls = [...historyModal.querySelectorAll('button:not(:disabled), select, input:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  function turnHistoryPage(delta) {
    historyPage += delta;
    renderHistory();
    document.getElementById('hqGoalLinkageHistory').scrollTop = 0;
  }
  document.getElementById('hqHistoryPrev').onclick = () => turnHistoryPage(-1);
  document.getElementById('hqHistoryStore').addEventListener('input', () => {
    historyPage = 1; turnHistoryPage(0);
  });
  document.getElementById('hqHistoryReset').onclick = () => {
    const input = document.getElementById('hqHistoryStore');
    input.value = ''; historyPage = 1; turnHistoryPage(0); input.focus();
  };
  document.getElementById('hqHistoryNext').onclick = () => turnHistoryPage(1);
  document.getElementById('hqHistoryPageSize').onchange = event => {
    historyPageSize = Number(event.target.value); historyPage = 1; turnHistoryPage(0);
  };
  document.body.insertAdjacentHTML('beforeend', `<div id="hqGoalAdjust" class="gl-mask" hidden><section class="gl-modal" role="dialog" aria-modal="true" aria-labelledby="hqGoalAdjustTitle"><header><strong id="hqGoalAdjustTitle">调整门店日目标</strong><button data-gl-close>×</button></header><main><div class="gl-form"><label>目标渠道</label><select id="hqAdjustChannel"><option value="pos">POS销售</option><option value="domain">私域</option><option value="instantRetail">即时零售</option></select><label>增加目标日期</label><input id="hqAdjustFirst" type="date"><label>减少目标日期</label><input id="hqAdjustSecond" type="date"><label>调拨金额（元）</label><input id="hqAdjustDelta" type="number" min="0.01" step="0.01" value="100"><label>同步调整私域</label><div><input id="hqAdjustBoth" type="checkbox"> 同批调整私域 <input id="hqAdjustDomainDelta" type="number" min="0.01" step="0.01" value="20" style="width:110px"> 元</div><label>调整原因</label><textarea id="hqAdjustReason" rows="2" placeholder="请填写业务原因">活动目标重新分配</textarea></div><div id="hqAdjustPreview" class="gl-panel"></div><div id="hqAdjustError" class="gl-error" role="alert"></div></main><footer><button data-gl-close>取消</button><button id="hqAdjustSave" class="primary">确认调整并生效</button></footer></section></div>`);
  let expected = {};
  function role() { return document.getElementById('hqGoalRole').value; }
  function render() {
    const model = L.snapshot(), days = Object.values(model.days), pending = days.filter(day => day.pending);
    document.getElementById('hqGoalLinkageSummary').textContent = `待重新分配 ${pending.length} 个日期；门店月目标固定，导购分配完成后状态自动更新。`;
    if (!historyModal.hidden) renderHistory(model);
    const months = new Map();
    days.forEach(day => { const k = day.day.slice(0, 7); if (!months.has(k)) months.set(k, { pos: 0, domain: 0, instantRetail: 0 }); const total = months.get(k); L.CHANNELS.forEach(c => total[c] += day[c]); });
    let id = Math.max(1000, ...state.dayRows.map(row => row.id), ...state.monthRows.map(row => row.id)) + 1;
    const base = state.monthRows.find(row => row.storeCode === L.STORE) || { storeCode: L.STORE, storeName: '华南区-蕉下测试门店', brandCode: '蕉下', deptCode: '华南区', supervisor: '张三' };
    months.forEach((sum, month) => {
      let row = state.monthRows.find(r => r.storeCode === L.STORE && r.assessmentMonth === month.replace('-', ''));
      if (!row) { row = { ...base, id: id++, assessmentMonth: month.replace('-', ''), monthGoalNo: `MG${month.replace('-', '')}${L.STORE}` }; state.monthRows.push(row); }
      Object.assign(row, { storeMonthGoal: sum.pos / 100, privateMonthGoal: sum.domain / 100, instantRetailMonthGoal: sum.instantRetail / 100 });
    });
    days.forEach(day => {
      const text = day.day.replace(/-/g, ''), sum = months.get(day.day.slice(0, 7));
      let row = state.dayRows.find(r => r.storeCode === day.storeCode && r.assessmentDay === text);
      if (!row) { row = { ...base, id: id++, assessmentDay: text }; state.dayRows.push(row); }
      const last = day.changes.at(-1);
      Object.assign(row, { storeMonthGoal: sum.pos / 100, privateMonthGoal: sum.domain / 100, instantRetailMonthGoal: sum.instantRetail / 100, storeDayGoal: day.pos / 100, privateDayGoal: day.domain / 100, instantRetailDayGoal: day.instantRetail / 100, updateUser: last ? last.actor : 'admin', updateTime: last ? last.time : `${day.day} 08:00:00` });
    });
    state.assistantGoalItemRows = model.assistants.map(row => {
      const day = model.days[L.key(row.storeCode, row.day)];
      return { id: row.id, assessmentDay: row.day, storeCode: row.storeCode, storeName: base.storeName, deptCode: base.deptCode, supervisor: base.supervisor, storeType: '直营', storeStatus: '营业中', storeTotalGoal: (day.pos + day.domain) / 100, storePosDayGoal: day.pos / 100, storeDomainDayGoal: day.domain / 100, assistantCode: row.assistantCode, assistantName: row.assistantName, phoneNumber: row.phoneNumber, roleName: row.roleName, totalDayGoal: (row.pos + row.domain) / 100, assistantDayGoal: row.pos / 100, domainDayGoal: row.domain / 100, status: row.status, statusName: row.status === 'EXPIRED' ? '已失效' : row.status === 'SUBMIT' ? '已提交' : '未提交', isArchived: row.archived ? '1' : '0', invalidReason: row.invalidReason || '-', updateUser: row.updatedBy, updateTime: row.updatedAt, linkagePending: day.pending && !row.archived && row.invalidReason === '门店目标调整' };
    });
    runQuery('day'); runQuery('month'); runQuery('assistantGoalItem');
    if (!document.getElementById('hqGoalAdjust').hidden && Object.entries(expected).some(([k, version]) => !model.days[k] || model.days[k].revision !== version)) document.getElementById('hqAdjustError').textContent = '目标已被更新，请重新打开调整窗口后再提交。';
  }
  function preview(capture = false) {
    try {
      const model = L.snapshot(), first = document.getElementById('hqAdjustFirst').value, second = document.getElementById('hqAdjustSecond').value, channel = document.getElementById('hqAdjustChannel').value;
      const a = L.getDay(model, L.STORE, first), b = L.getDay(model, L.STORE, second);
      if (capture) expected = { [L.key(L.STORE, first)]: a.revision, [L.key(L.STORE, second)]: b.revision };
      const delta = L.cents(document.getElementById('hqAdjustDelta').value);
      const both = document.getElementById('hqAdjustBoth'); both.disabled = channel !== 'pos'; if (both.disabled) both.checked = false;
      const needAllocation = channel !== 'instantRetail';
      document.getElementById('hqAdjustPreview').textContent = `${first} ${L.money(a[channel])} → ${L.money(a[channel] + delta)}元；${second} ${L.money(b[channel])} → ${L.money(b[channel] - delta)}元。${needAllocation ? '受影响日期原导购目标将失效，保留历史并等待重新分配。' : '即时零售独立调整，不使导购目标失效。'}${both.checked ? '同批调整私域，两个渠道合并为一次失效。' : ''}`;
      document.getElementById('hqAdjustError').textContent = '';
    } catch (error) { document.getElementById('hqAdjustError').textContent = error.message; }
  }
  function openManual() {
    const now = L.today(), days = Object.values(L.snapshot().days).filter(d => d.day >= now).sort((a, b) => a.day.localeCompare(b.day));
    let a = days[0], b = days[1];
    if (a.day.slice(0, 7) !== b.day.slice(0, 7)) { a = days[1]; b = days[2]; }
    document.getElementById('hqAdjustFirst').value = a.day; document.getElementById('hqAdjustSecond').value = b.day;
    document.getElementById('hqGoalAdjust').hidden = false; preview(true);
  }
  document.getElementById('hqManualGoal').onclick = openManual;
  document.getElementById('hqOpenStore').onclick = () => { try { const url = new URL('../store-pages/index.html#assistantGoalItem', location.href); if (role() === 'HRBP') url.searchParams.set('goalRole', 'HRBP'); L.openPeer(url.href, 'pos-linked-store'); } catch (error) { toast(error.message, true); } };
  document.querySelectorAll('[data-gl-close]').forEach(button => button.onclick = () => { document.getElementById('hqGoalAdjust').hidden = true; });
  ['hqAdjustFirst', 'hqAdjustSecond', 'hqAdjustChannel'].forEach(id => document.getElementById(id).addEventListener('change', () => preview(true)));
  ['hqAdjustDelta', 'hqAdjustBoth', 'hqAdjustDomainDelta'].forEach(id => document.getElementById(id).addEventListener('input', () => preview()));
  document.getElementById('hqAdjustSave').onclick = async () => {
    try {
      const model = L.snapshot(), first = document.getElementById('hqAdjustFirst').value, second = document.getElementById('hqAdjustSecond').value, channel = document.getElementById('hqAdjustChannel').value;
      if (first === second) throw new Error('请选择两个不同的日期进行同月调拨。');
      const delta = L.cents(document.getElementById('hqAdjustDelta').value); if (!delta) throw new Error('调拨金额必须大于0。');
      const a = L.getDay(model, L.STORE, first), b = L.getDay(model, L.STORE, second);
      const patches = [{ day: first, [channel]: a[channel] + delta }, { day: second, [channel]: b[channel] - delta }];
      if (channel === 'pos' && document.getElementById('hqAdjustBoth').checked) {
        const domainDelta = L.cents(document.getElementById('hqAdjustDomainDelta').value); patches[0].domain = a.domain + domainDelta; patches[1].domain = b.domain - domainDelta;
      }
      const result = await L.command('change', { patches, expected, role: role(), actor: role() === 'HRBP' ? 'HRBP 张某' : '销售支持 李某', reason: document.getElementById('hqAdjustReason').value });
      document.getElementById('hqGoalAdjust').hidden = true;
      toast(result.changed ? `调整成功，${result.invalidated}条原导购目标失效，${result.pendingDates.length}个日期待重新分配。` : '目标金额未变化，无需重新分配。');
    } catch (error) { document.getElementById('hqAdjustError').textContent = error.message; }
  };
  // 导入和调整上传复用已有模板与校验，只在真实金额变化时联动失效。
  const originalApply = applyGoalImport;
  applyGoalImport = function (type, plans) {
    const model = L.snapshot(), channel = channelByImport[type], patches = [], versions = {};
    plans.filter(plan => plan.storeCode === L.STORE).forEach(plan => plan.days.forEach(day => {
      const text = L.date(day.date), k = L.key(L.STORE, text), record = model.days[k];
      // 首次新增日期尚无导购目标，不需要执行旧目标失效；仍由导入计划校验月总额。
      if (!record && day.isNew) return;
      if (!record) {
        const oldRow = state.dayRows.find(row => row.storeCode === L.STORE && String(row.assessmentDay).replace(/\D/g, '') === day.date);
        if (oldRow && goalAmountCents(oldRow[goalImportRules[type].dayField] ?? 0, '原日目标') === day.amount) return;
        throw new Error('该月份不在联动演示范围，请选择上月、当月或下月。');
      }
      patches.push({ day: text, [channel]: day.amount }); versions[k] = hqUploadVersions[k];
    }));
    if (patches.length) L.execute('change', { source: 'goalImport', patches, expected: versions, role: role(), actor: role() === 'HRBP' ? 'HRBP 张某' : '销售支持 李某', reason: document.getElementById('hqUploadReason').value });
    return originalApply(type, plans);
  };
  let hqUploadVersions = {};
  const reasonField = document.createElement('label'); reasonField.style.cssText = 'display:block;margin:10px 0'; reasonField.innerHTML = '调整原因 <input id="hqUploadReason" placeholder="发生目标变化时必填" style="width:100%;padding:8px;border:1px solid #dcdfe6;margin-top:5px">';
  document.querySelector('#uploadModal .modal-body').prepend(reasonField);
  const originalOpenUpload = openUpload;
  openUpload = function (type, mode) {
    hqUploadVersions = Object.fromEntries(Object.entries(L.snapshot().days).map(([k, day]) => [k, day.revision]));
    originalOpenUpload(type, mode); document.getElementById('hqUploadReason').value = '';
    document.getElementById('uploadRule').hidden = false;
    document.getElementById('uploadRule').textContent = '按门店、日期和渠道校验；月目标必须不变。POS或私域实际变化后，原导购目标失效并等待重新分配。过去日该渠道原日目标为0，或不存在该日期＋门店记录时允许补录；该渠道原日目标大于0时不可重复导入（金额相同也拦截），仅HRBP可调整。今日及未来日仍需保持月目标不变。';
  };
  L.connect('hq'); L.subscribe(render); render();
  if (location.hash === '#day') showGoalPage('day');
})();
