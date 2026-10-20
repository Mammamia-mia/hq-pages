/* 总部与门店原型共用的目标状态。只保存本地演示数据，不调用业务系统或发送通知。 */
(function (root) {
  const STORE = 'DP96325';
  const CHANNELS = ['pos', 'domain', 'instantRetail'];
  const LABELS = { pos: 'POS销售', domain: '私域', instantRetail: '即时零售' };
  const roster = [
    { assistantCode: 'DG10001', assistantName: '陈晓', phoneNumber: '138****1201', roleName: '导购', from: '2020-01-01' },
    { assistantCode: 'DG10002', assistantName: '林敏', phoneNumber: '139****3482', roleName: '高级导购', from: '2020-01-01' }
  ];
  const copy = value => JSON.parse(JSON.stringify(value));
  const key = (store, day) => `${store}|${day}`;
  function today() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  }
  function date(value) {
    const digits = String(value || '').replace(/-/g, '');
    const y = Number(digits.slice(0, 4)), m = Number(digits.slice(4, 6)), d = Number(digits.slice(6));
    if (!/^\d{8}$/.test(digits) || y < 1900 || m < 1 || m > 12 || d < 1 || d > new Date(y, m, 0).getDate()) throw new Error('考核日期无效。');
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  }
  function cents(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('目标金额必须为非负数，最多保留2位小数。');
    const [whole, decimal = ''] = text.split('.');
    const result = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
    if (!Number.isSafeInteger(result)) throw new Error('目标金额超出允许范围。');
    return result;
  }
  const money = amount => (amount / 100).toFixed(2);
  function staff(model, day) { return model.roster.filter(p => (!p.from || p.from <= day) && (!p.until || p.until >= day)); }
  function getDay(model, store, day) {
    const row = model.days[key(store, date(day))];
    if (!row) throw new Error(`${store} ${date(day)}尚未设置门店日目标。`);
    return row;
  }
  function currentRows(model, store, day) {
    return model.assistants.filter(row => row.storeCode === store && row.day === date(day) && row.status !== 'EXPIRED' && !row.archived);
  }
  function referenceRows(model, store, day) {
    const record = getDay(model, store, day);
    const active = currentRows(model, store, day);
    return staff(model, date(day)).map(person => {
      const found = active.find(r => r.assistantCode === person.assistantCode) || (record.reference || []).find(r => r.assistantCode === person.assistantCode);
      return { ...copy(person), pos: found ? found.pos : 0, domain: found ? found.domain : 0 };
    });
  }
  function createModel(day = today()) {
    const model = { schema: 1, seq: 1, stamp: 'seed', nextId: 100000, roster: copy(roster), days: {}, assistants: [], batches: [] };
    const first = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 1);
    for (let offset = -1; offset <= 1; offset++) {
      const m = new Date(first.getFullYear(), first.getMonth() + offset, 1);
      const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const length = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= length; d++) {
        const dateText = `${month}-${String(d).padStart(2, '0')}`;
        const record = { storeCode: STORE, day: dateText, revision: 1, allocationVersion: 1, pending: false, changedChannels: [], changes: [], reference: [] };
        Object.entries({ pos: 12000000, domain: 1800000, instantRetail: 1200000 }).forEach(([channel, total]) => {
          record[channel] = Math.floor(total / length) + (d <= total % length ? 1 : 0);
        });
        model.days[key(STORE, dateText)] = record;
        roster.forEach((person, index) => {
          model.assistants.push({ ...copy(person), id: model.nextId++, storeCode: STORE, day: dateText, pos: index ? record.pos - Math.floor(record.pos * 0.4) : Math.floor(record.pos * 0.4), domain: index ? record.domain - Math.floor(record.domain * 0.4) : Math.floor(record.domain * 0.4), status: 'SUBMIT', archived: false, invalidReason: '', updatedBy: '陈店长', updatedAt: `${dateText} 08:00:00`, goalVersion: 1 });
        });
      }
    }
    // 独立历史失效样例，不参与目标合计，后续门店调整也不覆盖其原因。
    const prior = copy(model.assistants.find(row => row.day === day));
    model.assistants.push({ ...prior, id: model.nextId++, assistantCode: 'DG10003', assistantName: '周宁', status: 'EXPIRED', archived: true, invalidReason: '导购离职归档' });
    return model;
  }
  function applyChange(input, command, businessDay = today()) {
    const model = copy(input), changes = [], seen = new Set();
    for (const patch of command.patches || []) {
      const day = date(patch.day), store = patch.storeCode || STORE, k = key(store, day);
      if (seen.has(k)) throw new Error('同一门店同一天不能重复提交。');
      seen.add(k);
      const record = getDay(model, store, day);
      if (command.expected && command.expected[k] !== record.revision) throw new Error(`${day}目标已被更新，请重新加载后再调整。`);
      const modified = CHANNELS.filter(channel => patch[channel] !== undefined && patch[channel] !== record[channel]);
      for (const channel of modified) if (!Number.isSafeInteger(patch[channel]) || patch[channel] < 0) throw new Error('目标金额必须为非负数，最多保留2位小数。');
      if (!modified.length) continue;
      // 导入仅可补录原金额为0的渠道；手动调整及其他非零渠道仍执行过去日权限。
      const zeroTargetImport = command.source === 'goalImport' && modified.every(channel => record[channel] === 0);
      if (day < businessDay && command.role !== 'HRBP' && !zeroTargetImport) throw new Error(`${day}属于过去日，仅HRBP可修改。`);
      changes.push({ k, record, before: Object.fromEntries(CHANNELS.map(c => [c, record[c]])), after: Object.fromEntries(CHANNELS.map(c => [c, patch[c] === undefined ? record[c] : patch[c]])), modified });
    }
    if (!changes.length) return { model: input, changed: 0, invalidated: 0, pendingDates: [] };
    if (!command.reason || !command.reason.trim()) throw new Error('请填写调整原因。');
    const balances = {};
    changes.forEach(change => change.modified.forEach(channel => {
      const group = `${change.record.storeCode}|${change.record.day.slice(0, 7)}|${channel}`;
      balances[group] = (balances[group] || 0) + change.after[channel] - change.before[channel];
    }));
    for (const [group, delta] of Object.entries(balances)) if (delta !== 0) throw new Error(`${group.replace(/\|/g, ' ')}月目标必须保持不变，差额${delta > 0 ? '+' : ''}${money(delta)}元。`);
    const time = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const batchId = `CHANGE-${model.seq + 1}-${Date.now()}`;
    let invalidated = 0;
    const pendingDates = [];
    changes.forEach(change => {
      const r = change.record;
      const affected = change.modified.filter(c => c !== 'instantRetail');
      const active = currentRows(model, r.storeCode, r.day);
      if (affected.length) {
        if (!r.pending) r.reference = copy(active);
        // 已失效和归档行不再次修改，未提交行作为草稿保留并标记需要重新确认。
        active.forEach(row => {
          if (row.status === 'SUBMIT') {
            row.status = 'EXPIRED'; row.invalidReason = '门店目标调整'; row.invalidatedAt = time; row.invalidatedBy = command.actor;
            row.invalidatedBatch = batchId; invalidated++;
          } else row.goalStale = true;
        });
        r.pending = true;
        r.changedChannels = [...new Set([...r.changedChannels, ...affected])];
        r.allocationVersion++;
        pendingDates.push(r.day);
      }
      Object.assign(r, change.after);
      r.revision++;
      r.changes.push({ batchId, before: change.before, after: change.after, channels: change.modified, reason: command.reason.trim(), actor: command.actor || command.role, time });
    });
    model.seq++;
    model.batches.push({ id: batchId, actor: command.actor || command.role, reason: command.reason.trim(), time, dates: changes.map(c => c.record.day), invalidated });
    return { model, changed: changes.length, invalidated, pendingDates };
  }
  function saveAllocations(input, command, businessDay = today()) {
    const model = copy(input), seen = new Set();
    if (!(command.items || []).length) throw new Error('没有可提交的分配。');
    command.items.forEach(item => {
      const day = date(item.day), store = item.storeCode || STORE, k = key(store, day);
      if (seen.has(k)) throw new Error('重复提交同一天的分配。'); seen.add(k);
      const record = getDay(model, store, day);
      if (day < businessDay && command.role !== 'HRBP') throw new Error(`${day}属于过去日，仅HRBP可重新分配。`);
      if (item.expectedVersion !== record.allocationVersion) throw new Error(`${day}门店目标或导购分配已再次调整，请加载最新目标后重新分配。`);
      const people = staff(model, day), codes = new Set();
      if (item.rows.length !== people.length) throw new Error(`${day}有效人员发生变化，请重新加载人员名单。`);
      let pos = 0, domain = 0;
      item.rows.forEach(row => {
        if (!people.some(person => person.assistantCode === row.assistantCode) || codes.has(row.assistantCode)) throw new Error(`${day}人员重复或不属于该日期的有效人员。`);
        codes.add(row.assistantCode);
        if (![row.pos, row.domain].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('导购金额必须为非负数，最多保留2位小数。');
        pos += row.pos; domain += row.domain;
      });
      const errors = [['pos', pos], ['domain', domain]].filter(([channel, total]) => total !== record[channel]).map(([channel, total]) => `${day} ${LABELS[channel]}：导购合计${money(total)}元，门店目标${money(record[channel])}元，差额${money(total - record[channel])}元。`);
      if (errors.length) throw new Error('分配未保存，导购合计必须等于门店日目标：\n' + errors.join('\n'));
      const active = currentRows(model, store, day);
      const same = !record.pending && active.length === item.rows.length && active.every(row => row.status === 'SUBMIT' && item.rows.some(next => next.assistantCode === row.assistantCode && next.pos === row.pos && next.domain === row.domain));
      if (same) return;
      const timestamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
      active.forEach(row => { row.status = 'EXPIRED'; row.invalidReason = record.pending ? '门店目标调整' : '导购目标重新分配'; row.invalidatedAt = timestamp; });
      item.rows.forEach(row => {
        const person = people.find(p => p.assistantCode === row.assistantCode);
        model.assistants.push({ ...copy(person), id: model.nextId++, storeCode: store, day, pos: row.pos, domain: row.domain, status: 'SUBMIT', archived: false, invalidReason: '', goalVersion: record.revision, updatedAt: timestamp, updatedBy: command.actor || command.role });
      });
      record.pending = false; record.changedChannels = []; record.reference = []; record.allocationVersion++;
      record.completedAt = timestamp; record.completedBy = command.actor || command.role;
    });
    model.seq++;
    return { model, saved: command.items.length };
  }
  const api = { STORE, CHANNELS, LABELS, roster, today, date, cents, money, key, copy, staff, getDay, currentRows, referenceRows, createModel, applyChange, saveAllocations };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  const storageKey = 'pos-prototype-goal-linkage-v1';
  let model;
  try { const cached = JSON.parse(localStorage.getItem(storageKey)); if (cached && cached.schema === 1 && cached.days[key(STORE, today())]) model = cached; } catch (_) {}
  if (!model) model = createModel();
  const clientId = Math.random().toString(36).slice(2), peers = new Set(), listeners = new Set(), pending = new Map(), processed = new Map();
  let role = '', authority = null, bus;
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(model)); } catch (_) {} };
  const notify = () => listeners.forEach(fn => fn(copy(model)));
  function send(message, target) {
    const packet = { ...message, protocol: 'pos-goal-linkage-v1', sender: clientId, role };
    if (target && typeof target.postMessage === 'function') target.postMessage(packet, '*');
    else { if (bus) bus.postMessage(packet); peers.forEach(peer => { try { if (!peer.closed) peer.postMessage(packet, '*'); } catch (_) {} }); }
  }
  function accept(snapshot, force) {
    if (!snapshot || snapshot.schema !== 1) return;
    if (force || snapshot.seq > model.seq || (snapshot.seq === model.seq && snapshot.stamp > model.stamp)) { model = copy(snapshot); persist(); notify(); }
  }
  function execute(kind, command) {
    const result = kind === 'change' ? applyChange(model, command) : saveAllocations(model, command);
    if (result.model !== model) { model = result.model; model.stamp = `${Date.now()}-${clientId}`; persist(); notify(); send({ kind: 'snapshot', model }); }
    return { ...result, model: copy(model) };
  }
  function receive(packet, source) {
    if (!packet || packet.protocol !== 'pos-goal-linkage-v1' || packet.sender === clientId) return;
    if (source) peers.add(source);
    if (packet.kind === 'hello') { if (role === 'hq') send({ kind: 'welcome', model, recipient: packet.sender }, source); return; }
    if (packet.recipient && packet.recipient !== clientId) return;
    if (packet.kind === 'welcome' && packet.role === 'hq') { authority = packet.sender; accept(packet.model, true); return; }
    if (packet.kind === 'snapshot') { if (role !== 'hq' || packet.role !== 'store' || !authority) accept(packet.model); return; }
    if (packet.kind === 'command' && role === 'hq' && packet.recipient === clientId) {
      let response = processed.get(packet.requestId);
      if (!response) {
        try { response = { result: execute(packet.operation, packet.command) }; }
        catch (error) { response = { error: error.message }; }
        processed.set(packet.requestId, response);
      }
      send({ kind: 'result', requestId: packet.requestId, recipient: packet.sender, ...response }, source);
    }
    if (packet.kind === 'result' && pending.has(packet.requestId)) {
      const request = pending.get(packet.requestId); pending.delete(packet.requestId); clearTimeout(request.timer);
      if (packet.error) request.reject(new Error(packet.error)); else { accept(packet.result.model, true); request.resolve(packet.result); }
    }
  }
  try { bus = new BroadcastChannel(storageKey); bus.onmessage = event => receive(event.data); } catch (_) {}
  root.addEventListener('message', event => {
    // file://窗口使用opener建立信任关系；不接受任意页面提供的业务命令。
    if (event.source === root.opener || peers.has(event.source)) receive(event.data, event.source);
  });
  root.addEventListener('storage', event => { if (event.key === storageKey && event.newValue) { try { accept(JSON.parse(event.newValue)); } catch (_) {} } });
  api.connect = type => { role = type; if (root.opener) peers.add(root.opener); persist(); send({ kind: 'hello' }); if (role === 'hq') send({ kind: 'welcome', model }); };
  api.openPeer = (url, name) => {
    const peer = root.open(url, name);
    if (!peer) throw new Error('浏览器阻止了新窗口，请允许打开原型页面后重试。');
    peers.add(peer); return peer;
  };
  api.subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  api.snapshot = () => copy(model);
  api.command = (operation, command) => {
    if (role === 'store' && authority) return new Promise((resolve, reject) => {
      const requestId = `${clientId}-${Date.now()}-${Math.random()}`;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('总部页面未响应，请保持联动页面打开并重试。')); }, 8000);
      pending.set(requestId, { resolve, reject, timer }); send({ kind: 'command', operation, command, requestId, recipient: authority });
    });
    try { return Promise.resolve(execute(operation, command)); } catch (error) { return Promise.reject(error); }
  };
  api.execute = execute;
  root.GoalLinkage = api;
})(typeof window === 'undefined' ? globalThis : window);
