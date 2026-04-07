<!-- src/routes/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  interface FilamentSlot { index: number; color: string; material: string; grams: number; }
  interface ParsedInstance {
    id: number; title: string;
    filament_grams: number; print_time_minutes: number;
    colors: string[];
    slots: FilamentSlot[];
  }
  interface Filament { id: number; color: string; material: string; nickname: string | null; }

  // 提交打印
  let url = $state('');
  let parsing = $state(false);
  let parsed = $state<Record<string, unknown> | null>(null);
  let parseError = $state('');
  let selectedInstance = $state<ParsedInstance | null>(null);
  // 每个颜色槽选中的耗材（null = 未选 / 使用推荐色）
  let slotFilaments = $state<(Filament | null)[]>([]);
  // 展开选择器的槽位序号（-1 表示关闭）
  let openSlot = $state(-1);
  // 耗材库
  let filaments = $state<Filament[]>([]);
  let loadingFilaments = $state(false);
  let manualGrams = $state('');
  let submitting = $state(false);
  let submitError = $state('');

  // 选中配置变化时重置槽位
  $effect(() => {
    const slots = selectedInstance?.slots ?? [];
    slotFilaments = slots.map(() => null);
    openSlot = -1;
  });

  async function loadFilaments() {
    if (filaments.length > 0 || loadingFilaments) return;
    loadingFilaments = true;
    try {
      const res = await fetch('/api/filaments');
      if (res.ok) filaments = await res.json();
    } catch { /* ignore */ } finally {
      loadingFilaments = false;
    }
  }

  // 管理员面板
  let showAdmin = $state(false);
  let adminPassword = $state('');
  let loginError = $state('');
  let loggingIn = $state(false);
  let adminDelta = $state('');
  let adminReason = $state('');
  let quotaError = $state('');

  // 加载更多
  let currentPage = $state(data.page);
  let records = $state([...data.printRecords]);
  let hasMore = $state(data.hasMore);
  let loadingMore = $state(false);

  // 能量槽百分比
  const pct = $derived(
    data.totalAdded > 0
      ? Math.max(0, Math.min(100, (data.remaining / data.totalAdded) * 100))
      : 0
  );

  const energyColor = $derived(
    pct > 60 ? '#22d3ee' : pct > 25 ? '#facc15' : '#f87171'
  );

  const instanceColors = [
    '#f472b6','#fb923c','#a78bfa','#34d399','#60a5fa','#fbbf24','#f87171','#4ade80'
  ];

  async function handleParse() {
    parsing = true;
    parseError = '';
    parsed = null;
    selectedInstance = null;
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const body = await res.json();
      if (!res.ok) {
        parseError = body.error ?? '解析失败';
      } else {
        parsed = body;
        manualGrams = '';
        const instances = body.instances as ParsedInstance[] | null;
        if (instances && instances.length === 1) {
          selectedInstance = instances[0];
        } else {
          selectedInstance = null;
        }
        // 预加载耗材库
        loadFilaments();
      }
    } catch {
      parseError = '网络错误，请稍后重试';
    } finally {
      parsing = false;
    }
  }

  async function handleSubmit() {
    submitting = true;
    submitError = '';
    const inst = selectedInstance;
    const grams = inst?.filament_grams ?? parseFloat(manualGrams);
    if (!grams || isNaN(Number(grams))) {
      submitError = '请填写耗材克数';
      submitting = false;
      return;
    }
    // 构建每槽耗材使用记录
    const slots = selectedInstance?.slots ?? [];
    const filament_usage = slots.length > 0
      ? slots.map((slot, i) => {
          const chosen = slotFilaments[i];
          return {
            slot_index: i,
            filament_id: chosen?.id ?? null,
            color: chosen?.color ?? slot.color,
            material: chosen?.material ?? slot.material,
            grams: slot.grams
          };
        })
      : undefined;

    const payload = {
      ...parsed,
      makerworld_url: url,
      filament_grams: grams,
      colors: filament_usage ? filament_usage.map(u => u.color) : null,
      filament_usage,
      print_time_minutes: inst?.print_time_minutes ?? parsed?.print_time_minutes,
      instance_id: inst?.id ?? parsed?.instance_id,
      instance_title: inst?.title ?? parsed?.instance_title,
      instances: undefined
    };
    try {
      const res = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      if (!res.ok) {
        submitError = body.error ?? '提交失败';
      } else {
        url = '';
        parsed = null;
        selectedInstance = null;
        slotFilaments = [];
        manualGrams = '';
        window.location.reload();
      }
    } catch {
      submitError = '网络错误，请稍后重试';
    } finally {
      submitting = false;
    }
  }

  async function handleLogin() {
    loggingIn = true;
    loginError = '';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword })
      });
      if (!res.ok) {
        loginError = '密码错误';
      } else {
        window.location.reload();
      }
    } catch {
      loginError = '网络错误';
    } finally {
      loggingIn = false;
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  async function handleQuota(type: 'add' | 'subtract') {
    quotaError = '';
    const delta = Math.abs(parseFloat(adminDelta)) * (type === 'subtract' ? -1 : 1);
    if (!adminDelta || isNaN(delta) || delta === 0) {
      quotaError = '请输入有效的克数';
      return;
    }
    try {
      const res = await fetch('/api/quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta, reason: adminReason })
      });
      if (res.ok) {
        adminDelta = '';
        adminReason = '';
        window.location.reload();
      } else {
        quotaError = '操作失败';
      }
    } catch {
      quotaError = '网络错误';
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    currentPage += 1;
    try {
      const res = await fetch(`/api/records?page=${currentPage}`);
      if (res.ok) {
        const { records: newRecords, hasMore: newHasMore } = await res.json();
        records = [...records, ...newRecords];
        hasMore = newHasMore;
      }
    } catch {
      currentPage -= 1;
    } finally {
      loadingMore = false;
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function fmtTime(mins: number) {
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins}m`;
  }
</script>

<svelte:head>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Nunito+Sans:wght@400;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page-root">
  <!-- 背景星点装饰 -->
  <div class="stars" aria-hidden="true">
    {#each [0,1,2,3,4,5,6,7,8,9,10,11] as i}
      <span class="star" style="--d:{i*37%360}deg; --s:{0.5+i%3*0.4}; --x:{5+i*8}%; --y:{5+i*7}%; --dur:{2+i%4}s"></span>
    {/each}
  </div>

  <!-- ═══ 顶部 Header ═══ -->
  <header class="topbar">
    <div class="topbar-inner">
      <!-- Logo -->
      <div class="logo">
        <span class="logo-icon">🖨️</span>
        <span class="logo-text">Bambu Genius</span>
      </div>

      <!-- 能量槽 -->
      <div class="energy-block">
        <div class="energy-label">⚡ 耗材能量</div>
        <div class="energy-row">
          <div class="energy-bar-wrap">
            <div class="energy-bar-track">
              <div
                class="energy-bar-fill"
                style="width:{pct}%; background:{energyColor}; box-shadow: 0 0 12px {energyColor}88"
              ></div>
            </div>
          </div>
          <div class="energy-num" style="color:{energyColor}">
            {data.remaining.toFixed(0)}<span class="energy-unit">g</span>
          </div>
        </div>
        {#if data.totalAdded > 0}
          <div class="energy-sub">{data.totalPrinted.toFixed(0)}g 已使用 / {data.totalAdded.toFixed(0)}g 总额度</div>
        {/if}
      </div>

      <!-- 快捷按钮 -->
      <div class="header-btns">
        <a href="/filaments" class="icon-btn" title="耗材库">🎨</a>
        <button class="icon-btn admin-btn" onclick={() => showAdmin = !showAdmin} title={data.isAdmin ? '管理面板' : '管理员登录'}>
          {data.isAdmin ? '⚙️' : '🔐'}
        </button>
      </div>
    </div>
  </header>

  <main class="main">

    <!-- ═══ 提交打印卡 ═══ -->
    <section class="card card-print">
      <h2 class="card-title">🚀 今天想打什么？</h2>

      <div class="url-row">
        <input
          type="url"
          bind:value={url}
          placeholder="粘贴 MakerWorld 链接…"
          class="url-input"
          onkeydown={(e) => e.key === 'Enter' && handleParse()}
        />
        <button
          onclick={handleParse}
          disabled={parsing || !url}
          class="btn-parse"
        >
          {#if parsing}
            <span class="spin">⚙️</span> 解析中…
          {:else}
            🔍 解析
          {/if}
        </button>
      </div>

      {#if parseError}
        <div class="error-box">😅 {parseError}</div>
      {/if}

      {#if parsed}
        <!-- 模型信息卡 -->
        <div class="model-card">
          {#if parsed.thumbnail_url}
            <img src={String(parsed.thumbnail_url)} alt="model" class="model-thumb" />
          {:else}
            <div class="model-thumb-placeholder">🧩</div>
          {/if}
          <div class="model-info">
            <p class="model-name">{parsed.model_name ?? '未知模型'}</p>
            {#if parsed.designer_name}
              <p class="model-designer">✏️ {parsed.designer_name}</p>
            {/if}
            {#if parsed.tags && Array.isArray(parsed.tags)}
              <div class="tag-row">
                {#each (parsed.tags as string[]).slice(0, 4) as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- 多配置选择 -->
        {#if parsed.instances && Array.isArray(parsed.instances) && (parsed.instances as ParsedInstance[]).length > 1}
          <div class="instances-section">
            <p class="instances-label">🎛️ 选择打印配置（{(parsed.instances as ParsedInstance[]).length} 种）</p>
            <div class="instances-grid">
              {#each parsed.instances as inst, i (inst.id)}
                {@const accent = instanceColors[i % instanceColors.length]}
                <button
                  class="instance-card {selectedInstance?.id === inst.id ? 'selected' : ''}"
                  style="--accent:{accent}"
                  onclick={() => { selectedInstance = inst; manualGrams = ''; }}
                >
                  <span class="instance-check">{selectedInstance?.id === inst.id ? '✅' : '⬜'}</span>
                  <p class="instance-title">{inst.title}</p>
                  <div class="instance-meta">
                    {#if inst.filament_grams}
                      <span class="instance-grams">🧵 {inst.filament_grams}g</span>
                    {/if}
                    {#if inst.print_time_minutes}
                      <span class="instance-time">⏱ {fmtTime(inst.print_time_minutes)}</span>
                    {/if}
                  </div>
                  {#if inst.colors?.length}
                    <div class="swatch-row">
                      {#each inst.colors as c}
                        <span class="swatch" style="background:{c}" title={c}></span>
                      {/each}
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 已选配置详情 -->
        {#if selectedInstance}
          <div class="selected-banner">
            <div class="selected-banner-left">
              <span class="selected-label">🎯 已选配置</span>
              <span class="selected-title">{selectedInstance.title}</span>
            </div>
            <div class="selected-stats">
              <span class="stat-pill stat-grams">🧵 {selectedInstance.filament_grams}g</span>
              {#if selectedInstance.print_time_minutes}
                <span class="stat-pill stat-time">⏱ {fmtTime(selectedInstance.print_time_minutes)}</span>
              {/if}
            </div>
          </div>
        {:else if !(parsed.instances && Array.isArray(parsed.instances) && (parsed.instances as ParsedInstance[]).length > 1)}
          <div class="manual-row">
            <span class="manual-label">🤔 克数未知，手动填写：</span>
            <input
              type="number"
              bind:value={manualGrams}
              placeholder="如 50"
              class="manual-input"
            />
            <span class="manual-unit">g</span>
          </div>
        {/if}

        <!-- 颜色槽位分配（有配置且有槽位数据时显示） -->
        {#if selectedInstance?.slots?.length}
          <div class="slots-section">
            <div class="slots-header">
              <p class="slots-label">🎨 选择实际使用的耗材</p>
              <a href="/filaments" class="slots-manage-link" target="_blank">管理耗材库 →</a>
            </div>
            <div class="slots-list">
              {#each selectedInstance.slots as slot, i}
                {@const chosen = slotFilaments[i]}
                <div class="slot-row">
                  <!-- 槽位序号 + 推荐色 -->
                  <div class="slot-left">
                    <span class="slot-index">#{i + 1}</span>
                    <span class="slot-rec-swatch" style="background:{slot.color}" title="推荐色 {slot.color}"></span>
                    <div class="slot-rec-info">
                      <span class="slot-rec-material">{slot.material}</span>
                      <span class="slot-rec-grams">{slot.grams}g</span>
                    </div>
                  </div>

                  <!-- 箭头 + 已选耗材 or 选择按钮 -->
                  <div class="slot-right">
                    {#if chosen}
                      <button
                        class="slot-chosen"
                        onclick={() => { openSlot = openSlot === i ? -1 : i; loadFilaments(); }}
                      >
                        <span class="slot-chosen-swatch" style="background:{chosen.color}"></span>
                        <span class="slot-chosen-label">{chosen.material}{chosen.nickname ? ` · ${chosen.nickname}` : ''}</span>
                        <span class="slot-chosen-edit">✏️</span>
                      </button>
                    {:else}
                      <button
                        class="slot-pick-btn"
                        onclick={() => { openSlot = openSlot === i ? -1 : i; loadFilaments(); }}
                      >
                        {openSlot === i ? '▲ 收起' : '选择耗材 ▼'}
                      </button>
                    {/if}
                  </div>
                </div>

                <!-- 展开的耗材选择器 -->
                {#if openSlot === i}
                  <div class="slot-picker">
                    {#if loadingFilaments}
                      <p class="slot-picker-empty">⏳ 加载中…</p>
                    {:else if filaments.length === 0}
                      <p class="slot-picker-empty">
                        耗材库为空，<a href="/filaments" target="_blank" class="slot-picker-link">去添加耗材</a>
                      </p>
                    {:else}
                      <div class="slot-picker-grid">
                        {#each filaments as f (f.id)}
                          <button
                            class="picker-item {chosen?.id === f.id ? 'picked' : ''}"
                            onclick={() => {
                              const arr = [...slotFilaments];
                              arr[i] = chosen?.id === f.id ? null : f;
                              slotFilaments = arr;
                              openSlot = -1;
                            }}
                          >
                            <span class="picker-swatch" style="background:{f.color}"></span>
                            <span class="picker-material">{f.material}</span>
                            {#if f.nickname}
                              <span class="picker-nickname">{f.nickname}</span>
                            {/if}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        {#if submitError}
          <div class="error-box">😅 {submitError}</div>
        {/if}

        <button
          onclick={handleSubmit}
          disabled={submitting || (parsed.instances && Array.isArray(parsed.instances) && (parsed.instances as ParsedInstance[]).length > 1 && !selectedInstance)}
          class="btn-submit"
        >
          {#if submitting}
            <span class="spin">⚙️</span> 提交中…
          {:else if parsed.instances && Array.isArray(parsed.instances) && (parsed.instances as ParsedInstance[]).length > 1 && !selectedInstance}
            👆 请先选择打印配置
          {:else}
            🎉 开始打印！扣除额度
          {/if}
        </button>
      {/if}
    </section>

    <!-- ═══ 打印历史 ═══ -->
    <section class="history-section">
      <h2 class="section-title">🏆 打印任务记录</h2>

      {#if records.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🌱</div>
          <p>还没有打印记录，快去选一个模型吧！</p>
        </div>
      {:else}
        <div class="history-grid">
          {#each records as record (record.id)}
            <div class="history-card">
              {#if record.thumbnail_url}
                <img src={record.thumbnail_url} alt="thumb" class="history-thumb" />
              {:else}
                <div class="history-thumb-placeholder">🧩</div>
              {/if}
              <div class="history-body">
                <p class="history-name">{record.model_name ?? '未知模型'}</p>
                {#if record.instance_title}
                  <p class="history-instance">📋 {record.instance_title}</p>
                {/if}
                <div class="history-meta">
                  <span class="history-grams">🧵 {parseFloat(record.filament_grams).toFixed(1)}g</span>
                  {#if record.colors?.length}
                    <div class="swatch-row">
                      {#each record.colors as c}
                        <span class="swatch" style="background:{c}" title={c}></span>
                      {/each}
                    </div>
                  {/if}
                </div>
                <p class="history-date">🕐 {formatDate(record.created_at)}</p>
              </div>
            </div>
          {/each}
        </div>

        {#if hasMore}
          <button
            onclick={loadMore}
            disabled={loadingMore}
            class="btn-loadmore"
          >
            {loadingMore ? '⏳ 加载中…' : '📦 加载更多'}
          </button>
        {/if}
      {/if}
    </section>
  </main>
</div>

<!-- ═══ 管理员面板 ═══ -->
{#if showAdmin}
  <div class="overlay" onclick={() => showAdmin = false}></div>
  <aside class="admin-panel">
    <div class="admin-inner">
      <div class="admin-header">
        <span class="admin-title">{data.isAdmin ? '⚙️ 管理面板' : '🔐 管理员登录'}</span>
        <button class="admin-close" onclick={() => showAdmin = false}>✕</button>
      </div>

      {#if !data.isAdmin}
        <div class="login-form">
          <input
            type="password"
            bind:value={adminPassword}
            placeholder="管理员密码"
            class="admin-input"
            onkeydown={(e) => e.key === 'Enter' && handleLogin()}
          />
          {#if loginError}
            <p class="error-text">😅 {loginError}</p>
          {/if}
          <button onclick={handleLogin} disabled={loggingIn} class="btn-admin-action btn-blue">
            {loggingIn ? '⏳ 登录中…' : '🔓 登录'}
          </button>
        </div>
      {:else}
        <div class="admin-stats">
          <div class="stat-row"><span>💰 总充值</span><strong>{data.totalAdded.toFixed(1)}g</strong></div>
          <div class="stat-row"><span>🖨️ 已使用</span><strong>{data.totalPrinted.toFixed(1)}g</strong></div>
          <div class="stat-row highlight"><span>⚡ 剩余</span><strong style="color:#22d3ee">{data.remaining.toFixed(1)}g</strong></div>
        </div>

        <div class="quota-form">
          <input type="number" bind:value={adminDelta} placeholder="克数（如 100）" class="admin-input" />
          <input type="text" bind:value={adminReason} placeholder="备注原因（可选）" class="admin-input" />
          {#if quotaError}<p class="error-text">😅 {quotaError}</p>{/if}
          <div class="quota-btns">
            <button onclick={() => handleQuota('add')} class="btn-admin-action btn-green">➕ 增加额度</button>
            <button onclick={() => handleQuota('subtract')} class="btn-admin-action btn-orange">➖ 减少额度</button>
          </div>
        </div>

        {#if data.quotaRecords?.length > 0}
          <div class="quota-log">
            <p class="quota-log-title">📒 变更记录</p>
            {#each data.quotaRecords as q (q.id)}
              <div class="quota-log-row">
                <span class={Number(q.delta) > 0 ? 'pos' : 'neg'}>
                  {Number(q.delta) > 0 ? '+' : ''}{q.delta}g
                  {#if q.reason}<span class="log-reason"> · {q.reason}</span>{/if}
                </span>
                <span class="log-date">{formatDate(q.created_at)}</span>
              </div>
            {/each}
          </div>
        {/if}

        <button onclick={handleLogout} class="btn-logout">🚪 注销登录</button>
      {/if}
    </div>
  </aside>
{/if}

<style>
  :global(body) {
    font-family: 'Nunito Sans', 'Nunito', sans-serif;
    margin: 0;
  }

  /* ── 页面背景 ── */
  .page-root {
    min-height: 100vh;
    background: #0f0c2e;
    background-image:
      radial-gradient(ellipse at 20% 10%, #1e1060 0%, transparent 50%),
      radial-gradient(ellipse at 80% 80%, #0d2b5e 0%, transparent 50%);
    color: #e2e8f0;
    position: relative;
    overflow-x: hidden;
  }

  /* ── 星点背景 ── */
  .stars { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
  .star {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: calc(4px * var(--s));
    height: calc(4px * var(--s));
    border-radius: 50%;
    background: white;
    opacity: 0.5;
    animation: twinkle var(--dur) ease-in-out infinite alternate;
  }
  @keyframes twinkle {
    from { opacity: 0.15; transform: scale(0.8); }
    to   { opacity: 0.9;  transform: scale(1.2); }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .spin { display: inline-block; animation: spin-slow 1s linear infinite; }

  /* ── Header ── */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(15,12,46,0.85);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .topbar-inner {
    max-width: 860px;
    margin: 0 auto;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .logo { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .logo-icon { font-size: 1.6rem; }
  .logo-text {
    font-family: 'Nunito', sans-serif;
    font-weight: 900;
    font-size: 1.15rem;
    background: linear-gradient(90deg, #f472b6, #a78bfa, #60a5fa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    white-space: nowrap;
  }

  .energy-block { flex: 1; min-width: 0; }
  .energy-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 4px; font-weight: 700; }
  .energy-row { display: flex; align-items: center; gap: 10px; }
  .energy-bar-wrap { flex: 1; }
  .energy-bar-track {
    height: 10px;
    background: rgba(255,255,255,0.08);
    border-radius: 99px;
    overflow: hidden;
  }
  .energy-bar-fill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.8s cubic-bezier(.34,1.56,.64,1), background 0.5s;
  }
  .energy-num {
    font-family: 'Nunito', sans-serif;
    font-weight: 900;
    font-size: 1.4rem;
    line-height: 1;
    transition: color 0.5s;
    flex-shrink: 0;
  }
  .energy-unit { font-size: 0.75rem; font-weight: 700; margin-left: 1px; }
  .energy-sub { font-size: 0.6rem; color: #64748b; margin-top: 3px; }

  .header-btns { display: flex; gap: 8px; flex-shrink: 0; }
  .icon-btn {
    width: 40px; height: 40px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    font-size: 1.2rem;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    display: flex; align-items: center; justify-content: center;
    text-decoration: none;
  }
  .icon-btn:hover { background: rgba(255,255,255,0.12); transform: scale(1.05); }
  .icon-btn:active { transform: scale(0.95); }
  .admin-btn { font-size: 1.2rem; }

  /* ── Main ── */
  .main {
    max-width: 860px;
    margin: 0 auto;
    padding: 20px 16px 60px;
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── 卡片基础 ── */
  .card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 24px;
    padding: 20px;
    backdrop-filter: blur(8px);
  }
  .card-print { border-color: rgba(167,139,250,0.3); }

  .card-title {
    font-family: 'Nunito', sans-serif;
    font-weight: 900;
    font-size: 1.2rem;
    margin: 0 0 16px;
    background: linear-gradient(90deg, #f472b6, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── URL 输入行 ── */
  .url-row { display: flex; gap: 8px; }
  .url-input {
    flex: 1;
    background: rgba(255,255,255,0.07);
    border: 2px solid rgba(167,139,250,0.3);
    border-radius: 14px;
    padding: 10px 14px;
    font-size: 0.9rem;
    color: #e2e8f0;
    outline: none;
    font-family: 'Nunito Sans', sans-serif;
    transition: border-color 0.2s;
    min-width: 0;
  }
  .url-input::placeholder { color: #475569; }
  .url-input:focus { border-color: #a78bfa; }

  .btn-parse {
    padding: 10px 18px;
    background: linear-gradient(135deg, #a78bfa, #60a5fa);
    border: none;
    border-radius: 14px;
    color: white;
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.9rem;
    cursor: pointer;
    white-space: nowrap;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 20px rgba(167,139,250,0.4);
    flex-shrink: 0;
  }
  .btn-parse:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(167,139,250,0.5); }
  .btn-parse:active:not(:disabled) { transform: translateY(0); }
  .btn-parse:disabled { opacity: 0.45; cursor: not-allowed; }

  /* ── 模型卡 ── */
  .model-card {
    display: flex;
    gap: 14px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 12px;
    margin-top: 14px;
  }
  .model-thumb {
    width: 80px; height: 80px;
    object-fit: cover;
    border-radius: 12px;
    flex-shrink: 0;
  }
  .model-thumb-placeholder {
    width: 80px; height: 80px;
    background: rgba(255,255,255,0.06);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 2rem;
    flex-shrink: 0;
  }
  .model-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .model-name {
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 1rem;
    color: #f1f5f9;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.3;
  }
  .model-designer { font-size: 0.78rem; color: #94a3b8; }
  .tag-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag {
    font-size: 0.7rem;
    background: rgba(167,139,250,0.2);
    color: #c4b5fd;
    border: 1px solid rgba(167,139,250,0.3);
    padding: 2px 8px;
    border-radius: 99px;
  }

  /* ── 配置选择 ── */
  .instances-section { margin-top: 16px; }
  .instances-label {
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.85rem;
    color: #94a3b8;
    margin-bottom: 10px;
  }
  .instances-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
    max-height: 280px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .instances-grid::-webkit-scrollbar { width: 4px; }
  .instances-grid::-webkit-scrollbar-track { background: transparent; }
  .instances-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

  .instance-card {
    background: rgba(255,255,255,0.04);
    border: 2px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 10px 12px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.2s, background 0.2s, transform 0.15s;
    position: relative;
    overflow: hidden;
  }
  .instance-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--accent);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .instance-card.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .instance-card.selected::before { opacity: 1; }
  .instance-card:hover:not(.selected) {
    border-color: rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.07);
    transform: translateY(-2px);
  }
  .instance-check { font-size: 0.85rem; margin-bottom: 4px; display: block; }
  .instance-title {
    font-family: 'Nunito', sans-serif;
    font-weight: 700;
    font-size: 0.8rem;
    color: #e2e8f0;
    margin: 0 0 6px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.35;
  }
  .instance-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .instance-grams, .instance-time {
    font-size: 0.72rem;
    padding: 2px 7px;
    border-radius: 99px;
    font-weight: 700;
  }
  .instance-grams { background: rgba(34,211,238,0.15); color: #67e8f9; }
  .instance-time  { background: rgba(250,204,21,0.15); color: #fde047; }

  /* ── 已选配置横幅 ── */
  .selected-banner {
    margin-top: 14px;
    background: rgba(34,197,94,0.1);
    border: 2px solid rgba(34,197,94,0.3);
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .selected-banner-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .selected-label { font-size: 0.7rem; color: #86efac; font-weight: 700; }
  .selected-title {
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.9rem;
    color: #f1f5f9;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .selected-stats { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
  .stat-pill {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 99px;
  }
  .stat-grams { background: rgba(34,211,238,0.2); color: #67e8f9; }
  .stat-time  { background: rgba(250,204,21,0.2); color: #fde047; }

  /* ── 颜色色块 ── */
  .swatch-row { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
  .swatch {
    width: 14px; height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.25);
    flex-shrink: 0;
  }
  .swatch-lg { width: 18px; height: 18px; }

  /* ── 颜色槽位 ── */
  .slots-section {
    margin-top: 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    overflow: hidden;
  }
  .slots-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .slots-label {
    font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.82rem;
    color: #94a3b8; margin: 0;
  }
  .slots-manage-link {
    font-size: 0.72rem; color: #a78bfa; text-decoration: none; font-weight: 700;
    transition: color 0.15s;
  }
  .slots-manage-link:hover { color: #c4b5fd; }
  .slots-list { padding: 6px 0; }

  .slot-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px; gap: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .slot-row:last-of-type { border-bottom: none; }
  .slot-left { display: flex; align-items: center; gap: 8px; }
  .slot-index { font-size: 0.7rem; color: #475569; font-weight: 800; width: 20px; text-align: center; }
  .slot-rec-swatch {
    width: 24px; height: 24px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.15); flex-shrink: 0;
  }
  .slot-rec-info { display: flex; flex-direction: column; gap: 1px; }
  .slot-rec-material { font-size: 0.72rem; color: #94a3b8; font-weight: 700; }
  .slot-rec-grams { font-size: 0.65rem; color: #475569; }

  .slot-right { flex-shrink: 0; }
  .slot-pick-btn {
    padding: 5px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 800;
    border: 1.5px solid rgba(167,139,250,0.4); background: rgba(167,139,250,0.1);
    color: #c4b5fd; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: all 0.15s; white-space: nowrap;
  }
  .slot-pick-btn:hover { background: rgba(167,139,250,0.2); }
  .slot-chosen {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 8px;
    border: 1.5px solid rgba(34,197,94,0.4); background: rgba(34,197,94,0.08);
    cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: all 0.15s;
  }
  .slot-chosen:hover { background: rgba(34,197,94,0.14); }
  .slot-chosen-swatch { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.2); flex-shrink: 0; }
  .slot-chosen-label { font-size: 0.75rem; color: #86efac; font-weight: 700; max-width: 120px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .slot-chosen-edit { font-size: 0.7rem; opacity: 0.6; }

  /* 展开的耗材选择器 */
  .slot-picker {
    margin: 0 10px 8px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 10px;
  }
  .slot-picker-empty { font-size: 0.82rem; color: #475569; margin: 0; text-align: center; padding: 4px; }
  .slot-picker-link { color: #a78bfa; text-decoration: none; font-weight: 700; }
  .slot-picker-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .picker-item {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px; border-radius: 8px;
    border: 1.5px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: all 0.15s;
  }
  .picker-item:hover { border-color: rgba(167,139,250,0.4); background: rgba(167,139,250,0.08); }
  .picker-item.picked { border-color: #a78bfa; background: rgba(167,139,250,0.15); }
  .picker-swatch { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.2); flex-shrink: 0; }
  .picker-material { font-size: 0.75rem; color: #c4b5fd; font-weight: 800; }
  .picker-nickname { font-size: 0.72rem; color: #64748b; max-width: 80px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

  /* ── 手动克数 ── */
  .manual-row {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(248,113,113,0.1);
    border: 1px solid rgba(248,113,113,0.3);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .manual-label { font-size: 0.82rem; color: #fca5a5; font-weight: 700; white-space: nowrap; }
  .manual-input {
    width: 72px;
    background: rgba(255,255,255,0.08);
    border: 1.5px solid rgba(248,113,113,0.4);
    border-radius: 8px;
    padding: 4px 8px;
    color: #f1f5f9;
    font-size: 0.88rem;
    font-family: 'Nunito', sans-serif;
    font-weight: 700;
    outline: none;
    text-align: center;
  }
  .manual-unit { font-size: 0.82rem; color: #94a3b8; font-weight: 700; }

  /* ── 提交按钮 ── */
  .btn-submit {
    margin-top: 16px;
    width: 100%;
    padding: 14px;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    border: none;
    border-radius: 16px;
    color: white;
    font-family: 'Nunito', sans-serif;
    font-weight: 900;
    font-size: 1.05rem;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 24px rgba(34,197,94,0.4), 0 0 0 0 rgba(34,197,94,0.4);
  }
  .btn-submit:hover:not(:disabled) {
    transform: translateY(-3px);
    box-shadow: 0 8px 32px rgba(34,197,94,0.5);
  }
  .btn-submit:active:not(:disabled) { transform: translateY(0); }
  .btn-submit:disabled {
    background: linear-gradient(135deg, #334155, #1e293b);
    box-shadow: none;
    cursor: not-allowed;
    color: #64748b;
  }

  /* ── 错误提示 ── */
  .error-box {
    margin-top: 10px;
    padding: 8px 12px;
    background: rgba(248,113,113,0.1);
    border: 1px solid rgba(248,113,113,0.3);
    border-radius: 10px;
    font-size: 0.85rem;
    color: #fca5a5;
  }

  /* ── 历史区 ── */
  .history-section { display: flex; flex-direction: column; gap: 14px; }
  .section-title {
    font-family: 'Nunito', sans-serif;
    font-weight: 900;
    font-size: 1.15rem;
    background: linear-gradient(90deg, #fbbf24, #f472b6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0;
  }
  .empty-state {
    text-align: center;
    padding: 48px 16px;
    color: #475569;
  }
  .empty-icon { font-size: 3.5rem; margin-bottom: 12px; }
  .empty-state p { font-size: 0.95rem; font-family: 'Nunito', sans-serif; font-weight: 700; }

  .history-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }
  .history-card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .history-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0,0,0,0.3);
  }
  .history-thumb {
    width: 100%; aspect-ratio: 1;
    object-fit: cover;
    display: block;
  }
  .history-thumb-placeholder {
    width: 100%; aspect-ratio: 1;
    background: rgba(255,255,255,0.05);
    display: flex; align-items: center; justify-content: center;
    font-size: 2.5rem;
  }
  .history-body { padding: 10px 12px 12px; }
  .history-name {
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.82rem;
    color: #e2e8f0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.35;
    margin-bottom: 4px;
  }
  .history-instance {
    font-size: 0.7rem;
    color: #94a3b8;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }
  .history-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .history-grams { font-size: 0.75rem; color: #67e8f9; font-weight: 700; }
  .history-date { font-size: 0.68rem; color: #475569; }

  .btn-loadmore {
    width: 100%;
    padding: 12px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    color: #94a3b8;
    font-family: 'Nunito', sans-serif;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }
  .btn-loadmore:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #e2e8f0; }
  .btn-loadmore:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── 管理员面板 ── */
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    z-index: 20;
  }
  .admin-panel {
    position: fixed;
    z-index: 30;
    background: #0f1729;
    border: 1px solid rgba(255,255,255,0.1);
    overflow-y: auto;
    /* mobile: bottom sheet */
    bottom: 0; left: 0; right: 0;
    max-height: 82vh;
    border-radius: 24px 24px 0 0;
  }
  @media (min-width: 768px) {
    .admin-panel {
      top: 0; right: 0; bottom: auto; left: auto;
      max-height: 100vh;
      height: 100%;
      width: 320px;
      border-radius: 24px 0 0 24px;
    }
  }
  .admin-inner { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .admin-header { display: flex; justify-content: space-between; align-items: center; }
  .admin-title {
    font-family: 'Nunito', sans-serif;
    font-weight: 900;
    font-size: 1.05rem;
    color: #f1f5f9;
  }
  .admin-close {
    width: 32px; height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s;
  }
  .admin-close:hover { background: rgba(255,255,255,0.1); }

  .login-form { display: flex; flex-direction: column; gap: 10px; }
  .admin-input {
    background: rgba(255,255,255,0.07);
    border: 1.5px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    padding: 10px 14px;
    color: #e2e8f0;
    font-size: 0.9rem;
    font-family: 'Nunito Sans', sans-serif;
    outline: none;
    transition: border-color 0.2s;
    width: 100%;
    box-sizing: border-box;
  }
  .admin-input:focus { border-color: #a78bfa; }
  .admin-input::placeholder { color: #475569; }

  .admin-stats {
    background: rgba(255,255,255,0.04);
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.88rem;
    color: #94a3b8;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .stat-row:last-child { border-bottom: none; padding-bottom: 0; }
  .stat-row strong { color: #e2e8f0; font-family: 'Nunito', sans-serif; font-weight: 800; }
  .stat-row.highlight strong { font-size: 1.05rem; }

  .quota-form { display: flex; flex-direction: column; gap: 8px; }
  .quota-btns { display: flex; gap: 8px; }
  .btn-admin-action {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 12px;
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.88rem;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .btn-admin-action:hover { transform: translateY(-2px); }
  .btn-admin-action:active { transform: translateY(0); }
  .btn-blue  { background: linear-gradient(135deg,#3b82f6,#6366f1); color:white; box-shadow:0 4px 16px rgba(99,102,241,0.4); }
  .btn-green { background: linear-gradient(135deg,#22c55e,#16a34a); color:white; box-shadow:0 4px 16px rgba(34,197,94,0.3); }
  .btn-orange{ background: linear-gradient(135deg,#f97316,#dc2626); color:white; box-shadow:0 4px 16px rgba(249,115,22,0.3); }

  .quota-log { display: flex; flex-direction: column; gap: 2px; max-height: 160px; overflow-y: auto; }
  .quota-log-title { font-size: 0.72rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .quota-log-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    font-size: 0.8rem;
  }
  .pos { color: #4ade80; font-weight: 700; }
  .neg { color: #f87171; font-weight: 700; }
  .log-reason { color: #64748b; font-weight: 400; }
  .log-date { color: #475569; font-size: 0.72rem; }
  .error-text { font-size: 0.82rem; color: #fca5a5; margin: 0; }

  .btn-logout {
    width: 100%;
    padding: 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    color: #64748b;
    font-family: 'Nunito', sans-serif;
    font-weight: 700;
    font-size: 0.88rem;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }
  .btn-logout:hover { background: rgba(255,255,255,0.08); color: #94a3b8; }

  /* ── 响应式 ── */
  @media (max-width: 480px) {
    .history-grid { grid-template-columns: repeat(2, 1fr); }
    .instances-grid { grid-template-columns: repeat(2, 1fr); }
    .energy-num { font-size: 1.15rem; }
    .logo-text { font-size: 0.95rem; }
  }
</style>
