<!-- src/routes/filaments/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  interface Filament {
    id: number;
    color: string;
    material: string;
    nickname: string | null;
    created_at: string;
  }

  const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'HIPS', 'PVA', '其他'];

  let filaments = $state<Filament[]>([...data.filaments]);

  // 新增表单
  let newColor    = $state('#ffffff');
  let newMaterial = $state('PLA');
  let newNickname = $state('');
  let adding      = $state(false);
  let addError    = $state('');

  async function handleAdd() {
    if (!newColor || !newMaterial) return;
    adding = true;
    addError = '';
    try {
      const res = await fetch('/api/filaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: newColor, material: newMaterial, nickname: newNickname || undefined })
      });
      const body = await res.json();
      if (!res.ok) {
        addError = body.error ?? '添加失败';
      } else {
        filaments = [...filaments, body as Filament];
        newColor = '#ffffff';
        newNickname = '';
      }
    } catch {
      addError = '网络错误';
    } finally {
      adding = false;
    }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/filaments/${id}`, { method: 'DELETE' });
      filaments = filaments.filter(f => f.id !== id);
    } catch {
      // ignore
    }
  }
</script>

<svelte:head>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Nunito+Sans:wght@400;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page-root">
  <!-- 星点背景 -->
  <div class="stars" aria-hidden="true">
    {#each [0,1,2,3,4,5,6,7,8,9] as i}
      <span class="star" style="--x:{8+i*9}%; --y:{6+i*8}%; --s:{0.5+i%3*0.4}; --dur:{2+i%4}s"></span>
    {/each}
  </div>

  <header class="topbar">
    <div class="topbar-inner">
      <a href="/" class="back-btn">← 返回</a>
      <h1 class="page-title">🎨 我的耗材库</h1>
    </div>
  </header>

  <main class="main">

    <!-- 新增耗材 -->
    <section class="card">
      <h2 class="card-title">➕ 添加耗材</h2>
      <div class="add-form">
        <!-- 颜色选择 -->
        <div class="field">
          <label class="field-label">颜色</label>
          <div class="color-pick-row">
            <label class="color-pick-label">
              <span class="color-pick-preview" style="background:{newColor}"></span>
              <input type="color" bind:value={newColor} class="color-native" />
            </label>
            <span class="color-hex">{newColor.toUpperCase()}</span>
          </div>
        </div>

        <!-- 材质 -->
        <div class="field">
          <label class="field-label">材质</label>
          <div class="material-grid">
            {#each MATERIALS as m}
              <button
                class="material-btn {newMaterial === m ? 'selected' : ''}"
                onclick={() => newMaterial = m}
                type="button"
              >{m}</button>
            {/each}
          </div>
        </div>

        <!-- 备注 -->
        <div class="field">
          <label class="field-label">备注（可选）</label>
          <input
            type="text"
            bind:value={newNickname}
            placeholder="如：红色拓竹 PLA Basic"
            class="text-input"
          />
        </div>

        {#if addError}
          <p class="error-text">😅 {addError}</p>
        {/if}

        <button onclick={handleAdd} disabled={adding} class="btn-add">
          {adding ? '⏳ 添加中…' : '✅ 添加到耗材库'}
        </button>
      </div>
    </section>

    <!-- 耗材列表 -->
    <section class="card">
      <h2 class="card-title">📦 已有耗材（{filaments.length} 种）</h2>
      {#if filaments.length === 0}
        <div class="empty">
          <p>还没有添加任何耗材，先添加几种吧 👆</p>
        </div>
      {:else}
        <div class="filament-list">
          {#each filaments as f (f.id)}
            <div class="filament-row">
              <span class="filament-swatch" style="background:{f.color}"></span>
              <div class="filament-info">
                <span class="filament-material">{f.material}</span>
                {#if f.nickname}
                  <span class="filament-nickname">{f.nickname}</span>
                {/if}
                <span class="filament-hex">{f.color.toUpperCase()}</span>
              </div>
              <button
                class="btn-delete"
                onclick={() => handleDelete(f.id)}
                title="删除"
              >🗑️</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

  </main>
</div>

<style>
  :global(body) { font-family: 'Nunito Sans', 'Nunito', sans-serif; margin: 0; }

  .page-root {
    min-height: 100vh;
    background: #0f0c2e;
    background-image:
      radial-gradient(ellipse at 20% 10%, #1e1060 0%, transparent 50%),
      radial-gradient(ellipse at 80% 80%, #0d2b5e 0%, transparent 50%);
    color: #e2e8f0;
    position: relative;
  }
  .stars { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
  .star {
    position: absolute; left: var(--x); top: var(--y);
    width: calc(4px * var(--s)); height: calc(4px * var(--s));
    border-radius: 50%; background: white; opacity: 0.5;
    animation: twinkle var(--dur) ease-in-out infinite alternate;
  }
  @keyframes twinkle {
    from { opacity: 0.15; transform: scale(0.8); }
    to   { opacity: 0.9;  transform: scale(1.2); }
  }

  .topbar {
    position: sticky; top: 0; z-index: 10;
    background: rgba(15,12,46,0.85);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .topbar-inner {
    max-width: 640px; margin: 0 auto;
    padding: 12px 16px;
    display: flex; align-items: center; gap: 14px;
  }
  .back-btn {
    font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.88rem;
    color: #a78bfa; text-decoration: none;
    padding: 6px 12px; border-radius: 10px;
    border: 1px solid rgba(167,139,250,0.3);
    transition: background 0.2s;
  }
  .back-btn:hover { background: rgba(167,139,250,0.1); }
  .page-title {
    font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 1.15rem;
    margin: 0;
    background: linear-gradient(90deg, #f472b6, #a78bfa, #60a5fa);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }

  .main {
    max-width: 640px; margin: 0 auto;
    padding: 20px 16px 60px;
    position: relative; z-index: 1;
    display: flex; flex-direction: column; gap: 16px;
  }

  .card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px; padding: 20px;
    backdrop-filter: blur(8px);
  }
  .card-title {
    font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 1.05rem;
    margin: 0 0 16px;
    background: linear-gradient(90deg, #f472b6, #a78bfa);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }

  /* ── 新增表单 ── */
  .add-form { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 0.78rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }

  .color-pick-row { display: flex; align-items: center; gap: 12px; }
  .color-pick-label { position: relative; cursor: pointer; }
  .color-pick-preview {
    width: 44px; height: 44px; border-radius: 12px;
    border: 3px solid rgba(255,255,255,0.2); display: block;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    transition: border-color 0.2s, transform 0.15s;
  }
  .color-pick-label:hover .color-pick-preview { border-color: rgba(255,255,255,0.5); transform: scale(1.05); }
  .color-native { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
  .color-pick-label:focus-within .color-pick-preview { border-color: #a78bfa; outline: 2px solid #a78bfa; outline-offset: 2px; }
  .color-hex { font-family: 'Nunito', monospace; font-weight: 800; font-size: 0.88rem; color: #94a3b8; }

  .material-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .material-btn {
    padding: 5px 12px; border-radius: 8px; font-size: 0.82rem; font-weight: 700;
    border: 1.5px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.05); color: #94a3b8;
    cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: all 0.15s;
  }
  .material-btn:hover { border-color: rgba(167,139,250,0.4); color: #c4b5fd; }
  .material-btn.selected { border-color: #a78bfa; background: rgba(167,139,250,0.15); color: #e9d5ff; }

  .text-input {
    background: rgba(255,255,255,0.07); border: 1.5px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 10px 14px;
    color: #e2e8f0; font-size: 0.9rem; font-family: 'Nunito Sans', sans-serif;
    outline: none; transition: border-color 0.2s;
  }
  .text-input:focus { border-color: #a78bfa; }
  .text-input::placeholder { color: #475569; }

  .btn-add {
    padding: 12px; border: none; border-radius: 14px;
    background: linear-gradient(135deg, #a78bfa, #60a5fa);
    color: white; font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 0.95rem;
    cursor: pointer; box-shadow: 0 4px 20px rgba(167,139,250,0.4);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .btn-add:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(167,139,250,0.5); }
  .btn-add:disabled { opacity: 0.5; cursor: not-allowed; }

  .error-text { font-size: 0.82rem; color: #fca5a5; margin: 0; }

  /* ── 列表 ── */
  .empty { text-align: center; padding: 24px; color: #475569; font-size: 0.9rem; }

  .filament-list { display: flex; flex-direction: column; gap: 8px; }
  .filament-row {
    display: flex; align-items: center; gap: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px; padding: 10px 12px;
    transition: background 0.15s;
  }
  .filament-row:hover { background: rgba(255,255,255,0.07); }

  .filament-swatch {
    width: 36px; height: 36px; border-radius: 50%;
    border: 3px solid rgba(255,255,255,0.2);
    flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .filament-info { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .filament-material {
    font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.88rem;
    background: rgba(167,139,250,0.2); color: #c4b5fd;
    padding: 2px 8px; border-radius: 6px;
  }
  .filament-nickname { font-size: 0.85rem; color: #e2e8f0; flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .filament-hex { font-size: 0.72rem; color: #475569; font-family: monospace; flex-shrink: 0; }

  .btn-delete {
    background: none; border: none; cursor: pointer; font-size: 1rem;
    opacity: 0.4; transition: opacity 0.15s, transform 0.15s;
    padding: 4px; flex-shrink: 0;
  }
  .btn-delete:hover { opacity: 1; transform: scale(1.15); }
</style>
