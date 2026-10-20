/* 演示控制集中收纳；移动原节点以保留角色、事件和场景运行状态。 */
(() => {
  'use strict';
  if (document.getElementById('demoLauncher')) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  document.body.insertAdjacentHTML('beforeend', `
    <button id="demoLauncher" type="button" aria-label="打开场景演示" aria-haspopup="dialog" aria-controls="demoSceneModal" aria-expanded="false"><span aria-hidden="true">◈</span><span>场景演示</span></button>
    <div id="demoSceneModal" hidden>
      <section class="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demoSceneTitle">
        <header><div><h2 id="demoSceneTitle">场景演示</h2><p>选择模块和场景，体验不同业务状态。</p></div><button type="button" data-demo-close aria-label="关闭场景演示">×</button></header>
        <nav id="demoSceneTabs" aria-label="演示模块"></nav>
        <main id="demoSceneContent"></main>
        <footer><span>演示操作仅影响本地原型数据</span><button type="button" data-demo-close>返回页面</button></footer>
      </section>
    </div>`);
  const launcher = document.getElementById('demoLauncher');
  const modal = document.getElementById('demoSceneModal');
  const tabs = document.getElementById('demoSceneTabs');
  const content = document.getElementById('demoSceneContent');
  const groups = new Map();
  let returnFocus, oldOverflow, background = [];
  function group(key, label) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.dataset.demoGroup = key;
    button.setAttribute('aria-controls', `demoGroup-${key}`);
    const section = document.createElement('section');
    section.id = `demoGroup-${key}`; section.hidden = true; section.className = 'demo-group';
    section.setAttribute('aria-label', label);
    tabs.append(button); content.append(section); groups.set(key, {button, section});
    button.onclick = () => selectGroup(key);
    return section;
  }
  function selectGroup(key) {
    if (!groups.has(key)) key = groups.keys().next().value;
    groups.forEach((item, name) => {
      item.section.hidden = name !== key;
      item.button.setAttribute('aria-pressed', String(name === key));
    });
    content.scrollTop = 0;
  }
  function move(parent, node) { if (node) parent.append(node); }
  const store = document.getElementById('storeGoalLinkagePanel');
  if (store) {
    const goals = group('goals', '导购目标');
    move(goals, store.querySelector('.gl-head .gl-tools'));
    move(goals, store.querySelector(':scope > .gl-muted'));
    const demos = [...store.querySelectorAll(':scope > details')];
    demos.forEach(details => { details.open = true; move(goals, details); });
    move(goals, document.getElementById('storeLinkageError'));
  }
  const hq = document.getElementById('hqGoalLinkagePanel');
  if (hq) {
    move(group('goals', '门店目标联动'), hq);
    // 先关闭场景弹窗，再交给原处理函数打开调整弹窗。
    document.getElementById('hqManualGoal').addEventListener('click', () => close(), true);
  }
  function addScenarios(key, label, api, note) {
    if (!api?.getScenarios) return;
    const section = group(key, label);
    section.innerHTML = `<p class="demo-note">${esc(note)}</p><div class="demo-choices">${api.getScenarios().map(([id, title, description]) => `<button type="button" data-demo-scene="${esc(id)}"><strong>${esc(title)}</strong><span>${esc(description)}</span></button>`).join('')}</div>`;
    section.addEventListener('click', event => {
      const button = event.target.closest('[data-demo-scene]');
      if (!button) return;
      close(); api.loadScenario(button.dataset.demoScene);
    });
    if (api.restoreDemo) {
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'demo-reset';
      reset.textContent = '恢复销售订单演示数据';
      reset.onclick = () => { close(); api.restoreDemo(); };
      section.append(reset);
    }
  }
  addScenarios('cashier', '收银', window.cashierPrototype, '切换场景将替换当前购物车。商品、会员和支付结果均为模拟数据。');
  addScenarios('orders', '销售订单', window.storeSalePrototype, '选择订单类型、权限或异常场景，进入对应页面查看和操作。');
  function open() {
    if (!modal.hidden) return;
    returnFocus = document.activeElement; oldOverflow = document.body.style.overflow;
    selectGroup(document.body.classList.contains('cashier-active') ? 'cashier' : document.body.classList.contains('so-active') ? 'orders' : 'goals');
    modal.hidden = false; launcher.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    background = [...document.body.children].filter(node => node !== modal && !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)).map(node => [node, node.inert]);
    background.forEach(([node]) => { node.inert = true; });
    modal.querySelector('[data-demo-close]').focus();
  }
  function close() {
    if (modal.hidden) return;
    modal.hidden = true; launcher.setAttribute('aria-expanded', 'false');
    background.forEach(([node, inert]) => { node.inert = inert; }); background = [];
    document.body.style.overflow = oldOverflow;
    (returnFocus?.isConnected ? returnFocus : launcher).focus();
  }
  launcher.onclick = open;
  modal.querySelectorAll('[data-demo-close]').forEach(button => { button.onclick = close; });
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key === 'Tab') {
      event.stopImmediatePropagation();
      const controls = [...modal.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), summary')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, true);
})();
