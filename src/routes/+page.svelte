<!-- src/routes/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  interface ParsedInstance {
    id: number;
    title: string;
    filament_grams: number;
    print_time_minutes: number;
    colors: string[];
  }

  // 提交打印
  let url = $state('');
  let parsing = $state(false);
  let parsed = $state<Record<string, unknown> | null>(null);
  let parseError = $state('');
  // 当有多个配置时展示选择步骤；选定后填入 selectedInstance
  let selectedInstance = $state<ParsedInstance | null>(null);
  let manualGrams = $state('');
  let submitting = $state(false);
  let submitError = $state('');

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

  async function handleParse() {
    parsing = true;
    parseError = '';
    parsed = null;
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
        // 若只有一个配置，直接选中；多个时等用户选择
        const instances = body.instances as ParsedInstance[] | null;
        if (instances && instances.length === 1) {
          selectedInstance = instances[0];
        } else {
          selectedInstance = null;
        }
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
    // 用选中配置的颜色和时长覆盖默认值
    const payload = {
      ...parsed,
      makerworld_url: url,
      filament_grams: grams,
      colors: inst?.colors ?? parsed?.colors,
      print_time_minutes: inst?.print_time_minutes ?? parsed?.print_time_minutes,
      instance_id: inst?.id ?? parsed?.instance_id,
      instance_title: inst?.title ?? parsed?.instance_title,
      // 不要把 instances 数组也提交给服务端
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
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- 顶部状态栏 -->
  <header class="bg-white shadow-sm sticky top-0 z-10">
    <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl font-bold text-blue-600">{data.remaining.toFixed(1)}g</span>
        <span class="text-sm text-gray-500">剩余额度</span>
      </div>
      <button
        onclick={() => showAdmin = !showAdmin}
        class="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        {data.isAdmin ? '管理面板' : '管理员登录'}
      </button>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
    <!-- 提交打印区 -->
    <section class="bg-white rounded-xl shadow-sm p-4 space-y-4">
      <h2 class="font-semibold text-gray-700">提交打印</h2>
      <div class="flex gap-2">
        <input
          type="url"
          bind:value={url}
          placeholder="粘贴 MakerWorld 链接…"
          class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          onclick={handleParse}
          disabled={parsing || !url}
          class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {parsing ? '解析中…' : '解析'}
        </button>
      </div>

      {#if parseError}
        <p class="text-red-500 text-sm">{parseError}</p>
      {/if}

      {#if parsed}
        <!-- 模型基本信息 -->
        <div class="border border-gray-200 rounded-lg p-3 flex gap-3">
          {#if parsed.thumbnail_url}
            <img src={String(parsed.thumbnail_url)} alt="model" class="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
          {/if}
          <div class="flex-1 min-w-0 space-y-1">
            <p class="font-medium text-sm truncate">{parsed.model_name ?? '未知模型'}</p>
            {#if parsed.designer_name}
              <p class="text-xs text-gray-500">设计师：{parsed.designer_name}</p>
            {/if}
            {#if parsed.tags && Array.isArray(parsed.tags) && (parsed.tags as string[]).length > 0}
              <div class="flex gap-1 flex-wrap">
                {#each (parsed.tags as string[]).slice(0, 4) as tag}
                  <span class="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">{tag}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- 打印配置选择（多个时展示） -->
        {#if parsed.instances && Array.isArray(parsed.instances) && (parsed.instances as ParsedInstance[]).length > 1}
          <div class="space-y-2">
            <p class="text-xs text-gray-500 font-medium">
              选择打印配置（共 {(parsed.instances as ParsedInstance[]).length} 个）
            </p>
            <div class="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
              {#each parsed.instances as inst (inst.id)}
                <button
                  onclick={() => { selectedInstance = inst; manualGrams = ''; }}
                  class="text-left border rounded-lg p-2.5 transition-colors {selectedInstance?.id === inst.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
                >
                  <p class="text-sm font-medium text-gray-800 leading-snug">{inst.title}</p>
                  <div class="flex items-center gap-2 mt-1 flex-wrap">
                    {#if inst.filament_grams}
                      <span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                        {inst.filament_grams}g
                      </span>
                    {/if}
                    {#if inst.print_time_minutes}
                      <span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        {inst.print_time_minutes >= 60
                          ? `约 ${Math.floor(inst.print_time_minutes / 60)}h${inst.print_time_minutes % 60 > 0 ? ` ${inst.print_time_minutes % 60}m` : ''}`
                          : `${inst.print_time_minutes}m`}
                      </span>
                    {/if}
                    {#each inst.colors as color}
                      <span
                        class="inline-block w-4 h-4 rounded-full border border-white shadow-sm"
                        style="background:{color}"
                        title={color}
                      ></span>
                    {/each}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 选中配置后展示详情 -->
        {#if selectedInstance}
          <div class="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
            <div class="flex-1 space-y-1">
              <p class="text-xs text-gray-500">已选配置</p>
              <p class="text-sm font-medium text-gray-800">{selectedInstance.title}</p>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  {selectedInstance.filament_grams}g
                </span>
                {#if selectedInstance.print_time_minutes}
                  <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {selectedInstance.print_time_minutes >= 60
                      ? `约 ${Math.floor(selectedInstance.print_time_minutes / 60)}h${selectedInstance.print_time_minutes % 60 > 0 ? ` ${selectedInstance.print_time_minutes % 60}m` : ''}`
                      : `${selectedInstance.print_time_minutes}m`}
                  </span>
                {/if}
                {#each selectedInstance.colors as color}
                  <span
                    class="inline-block w-4 h-4 rounded-full border border-white shadow-sm"
                    style="background:{color}"
                    title={color}
                  ></span>
                {/each}
              </div>
            </div>
          </div>
        {:else if !(parsed.instances && Array.isArray(parsed.instances) && (parsed.instances as ParsedInstance[]).length > 1)}
          <!-- 无法解析克数时手动填写 -->
          <div class="flex items-center gap-1">
            <span class="text-xs text-red-500">克数未知，请填写：</span>
            <input
              type="number"
              bind:value={manualGrams}
              placeholder="如 50"
              class="w-20 border border-red-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300"
            />
            <span class="text-xs text-gray-500">g</span>
          </div>
        {/if}

        {#if submitError}
          <p class="text-red-500 text-sm">{submitError}</p>
        {/if}

        <button
          onclick={handleSubmit}
          disabled={submitting || (parsed.instances && Array.isArray(parsed.instances) && (parsed.instances as ParsedInstance[]).length > 1 && !selectedInstance)}
          class="w-full py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {#if submitting}
            提交中…
          {:else if parsed.instances && Array.isArray(parsed.instances) && (parsed.instances as ParsedInstance[]).length > 1 && !selectedInstance}
            请先选择打印配置
          {:else}
            确认打印，扣除额度
          {/if}
        </button>
      {/if}
    </section>

    <!-- 打印历史 -->
    <section class="space-y-3">
      <h2 class="font-semibold text-gray-700 px-1">打印历史</h2>
      {#if records.length === 0}
        <p class="text-center text-gray-400 py-8">还没有打印记录</p>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each records as record (record.id)}
            <div class="bg-white rounded-xl shadow-sm p-3 flex gap-3">
              {#if record.thumbnail_url}
                <img src={record.thumbnail_url} alt="thumb" class="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
              {:else}
                <div class="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-300 text-xs">无图</div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{record.model_name ?? '未知模型'}</p>
                <p class="text-xs text-gray-500">{parseFloat(record.filament_grams).toFixed(1)}g</p>
                {#if record.colors && record.colors.length > 0}
                  <div class="flex gap-1 flex-wrap mt-0.5">
                    {#each record.colors as color}
                      <span class="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{color}</span>
                    {/each}
                  </div>
                {/if}
                <p class="text-xs text-gray-400 mt-1">{formatDate(record.created_at)}</p>
              </div>
            </div>
          {/each}
        </div>

        {#if hasMore}
          <button
            onclick={loadMore}
            disabled={loadingMore}
            class="w-full py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            {loadingMore ? '加载中…' : '加载更多'}
          </button>
        {/if}
      {/if}
    </section>
  </main>
</div>

<!-- 管理员面板：移动端底部抽屉 / 桌面端侧边抽屉 -->
{#if showAdmin}
  <div
    class="fixed inset-0 bg-black/30 z-20"
    onclick={() => showAdmin = false}
  ></div>

  <aside class="
    fixed z-30 bg-white shadow-xl overflow-y-auto
    bottom-0 left-0 right-0 max-h-[80vh] rounded-t-2xl
    md:bottom-auto md:top-0 md:right-0 md:left-auto md:h-full md:w-80 md:rounded-none md:rounded-l-2xl
  ">
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-gray-800">管理面板</h2>
        <button onclick={() => showAdmin = false} class="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      {#if !data.isAdmin}
        <div class="space-y-3">
          <input
            type="password"
            bind:value={adminPassword}
            placeholder="管理员密码"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {#if loginError}
            <p class="text-red-500 text-sm">{loginError}</p>
          {/if}
          <button
            onclick={handleLogin}
            disabled={loggingIn}
            class="w-full py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {loggingIn ? '登录中…' : '登录'}
          </button>
        </div>
      {:else}
        <div class="space-y-3">
          <div class="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p>总充值：<span class="font-medium">{data.totalAdded.toFixed(1)}g</span></p>
            <p>已用：<span class="font-medium">{data.totalPrinted.toFixed(1)}g</span></p>
            <p>剩余：<span class="font-bold text-blue-600">{data.remaining.toFixed(1)}g</span></p>
          </div>

          <input
            type="number"
            bind:value={adminDelta}
            placeholder="克数（如 100）"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            type="text"
            bind:value={adminReason}
            placeholder="原因（可选）"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />

          {#if quotaError}
            <p class="text-red-500 text-sm">{quotaError}</p>
          {/if}

          <div class="flex gap-2">
            <button
              onclick={() => handleQuota('add')}
              class="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600"
            >
              + 增加额度
            </button>
            <button
              onclick={() => handleQuota('subtract')}
              class="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"
            >
              - 减少额度
            </button>
          </div>

          {#if data.quotaRecords.length > 0}
            <div class="space-y-1 max-h-48 overflow-y-auto">
              <p class="text-xs text-gray-500 font-medium">变更记录</p>
              {#each data.quotaRecords as q (q.id)}
                <div class="text-xs flex justify-between items-center py-1 border-b border-gray-100">
                  <span class={Number(q.delta) > 0 ? 'text-green-600' : 'text-orange-600'}>
                    {Number(q.delta) > 0 ? '+' : ''}{q.delta}g
                    {#if q.reason}<span class="text-gray-400"> · {q.reason}</span>{/if}
                  </span>
                  <span class="text-gray-400">{formatDate(q.created_at)}</span>
                </div>
              {/each}
            </div>
          {/if}

          <button
            onclick={handleLogout}
            class="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
          >
            注销登录
          </button>
        </div>
      {/if}
    </div>
  </aside>
{/if}
