import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/** =======================
 *  本地存储 Key
 *  ======================= */
const KEY_RECIPES = 'cook3d_recipes_v02';
const KEY_PROFILE = 'cook3d_profile_v02';
const KEY_ACTIVE  = 'cook3d_active_recipe_v02';
const KEY_ASSET_IMG = 'cook3d_asset_imgs_v02'; // B：上传图片 dataURL 存这里

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

/** =======================
 *  等级（沿用你那套，先只显示）
 *  ======================= */
const LEVELS = [
  { name: '入灶期', desc: '初识烟火，锅铲为伴', max: 50 },
  { name: '引火期', desc: '掌控火候，渐入佳境', max: 150 },
  { name: '感味期', desc: '百味入魂，舌尖通灵', max: 300 },
  { name: '聚锅期', desc: '万物皆可入锅，自成一派', max: 500 },
  { name: '调味筑基期', desc: '五味调和，根基深厚', max: 800 },
  { name: '心法成型期', desc: '食谱在心，随手拈来', max: 1200 },
  { name: '招式小成期', desc: '刀工火候，皆有法度', max: 1700 },
  { name: '领域展开期', desc: '厨房之内，唯我独尊', max: 2300 },
  { name: '厨师境·一派之主', desc: '开宗立派，威震一方', max: 3000 },
  { name: '厨圣境·行走人间', desc: '返璞归真，食为天道', max: 4000 },
  { name: '厨道大圆满', desc: '超凡入圣，与食俱进', max: Infinity }
];
function getLevel(xp){
  for (let i=0;i<LEVELS.length;i++){
    if (xp < LEVELS[i].max) return { idx:i, ...LEVELS[i] };
  }
  return { idx:LEVELS.length-1, ...LEVELS[LEVELS.length-1] };
}

/** =======================
 *  DOM refs
 *  ======================= */
const el = {
  canvas: document.getElementById('canvas'),
  chipTemp: document.getElementById('chipTemp'),
  chipHint: document.getElementById('chipHint'),
  levelText: document.getElementById('levelText'),

  // assets
  tabIng: document.getElementById('tabIng'),
  tabSea: document.getElementById('tabSea'),
  assetSearch: document.getElementById('assetSearch'),
  assetGrid: document.getElementById('assetGrid'),

  // recipe
  recipeInput: document.getElementById('recipeInput'),
  btnParse: document.getElementById('btnParse'),
  btnLoad: document.getElementById('btnLoad'),
  recipeSelect: document.getElementById('recipeSelect'),

  // practice
  btnPractice: document.getElementById('btnPractice'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  stepIndex: document.getElementById('stepIndex'),
  stepText: document.getElementById('stepText'),
  stepRule: document.getElementById('stepRule'),

  // zones
  zonePan: document.getElementById('zonePan'),
  zoneBowl: document.getElementById('zoneBowl'),
  zoneBoard: document.getElementById('zoneBoard'),
  listPan: document.getElementById('listPan'),
  listBowl: document.getElementById('listBowl'),
  listBoard: document.getElementById('listBoard'),
  cntPan: document.getElementById('cntPan'),
  cntBowl: document.getElementById('cntBowl'),
  cntBoard: document.getElementById('cntBoard'),
  btnClearZones: document.getElementById('btnClearZones'),

  // action panel
  heat: document.getElementById('heat'),
  heatLabel: document.getElementById('heatLabel'),
  actionSelect: document.getElementById('actionSelect'),
  actionSec: document.getElementById('actionSec'),
  btnDoAction: document.getElementById('btnDoAction'),
  actionEcho: document.getElementById('actionEcho'),

  logBox: document.getElementById('logBox'),
  btnReset: document.getElementById('btnReset')
};

function setHint(t){ el.chipHint.textContent = t; }

/** =======================
 *  资源库（A：内置 emoji 占位）
 *  B：允许为每个资源上传图片（dataURL存在localStorage）
 *  ======================= */
const ASSETS = [
  // 食材
  { id:'meat', name:'肉', type:'ingredient', emoji:'🥩', color:0xd96c6c, keywords:['肉','里脊','鸡','牛','虾','鱼'] },
  { id:'onion', name:'葱', type:'ingredient', emoji:'🧅', color:0x6dd96c, keywords:['葱'] },
  { id:'ginger', name:'姜', type:'ingredient', emoji:'🫚', color:0xd9d56c, keywords:['姜'] },
  { id:'garlic', name:'蒜', type:'ingredient', emoji:'🧄', color:0xe7e5e4, keywords:['蒜'] },
  { id:'starch', name:'淀粉', type:'ingredient', emoji:'🌾', color:0xe7e5e4, keywords:['淀粉'] },
  { id:'oil', name:'油', type:'ingredient', emoji:'🫗', color:0xf59e0b, keywords:['油'] },

  // 调料
  { id:'salt', name:'盐', type:'seasoning', emoji:'🧂', color:0xe7e5e4, keywords:['盐'] },
  { id:'sugar', name:'糖', type:'seasoning', emoji:'🍬', color:0xffffff, keywords:['糖'] },
  { id:'vinegar', name:'醋', type:'seasoning', emoji:'🍶', color:0x7c3aed, keywords:['醋'] },
  { id:'soy', name:'生抽', type:'seasoning', emoji:'🥢', color:0x3f3f46, keywords:['生抽','酱油'] },
  { id:'wine', name:'料酒', type:'seasoning', emoji:'🍺', color:0xfbbf24, keywords:['料酒'] },
];

let assetImgs = loadJSON(KEY_ASSET_IMG, {}); // { [assetId]: dataURL }

/** =======================
 *  菜谱、档案
 *  ======================= */
const profile = loadJSON(KEY_PROFILE, { xp: 0 });
let recipes = loadJSON(KEY_RECIPES, []);
let activeRecipeId = loadJSON(KEY_ACTIVE, null);

function renderLevel(){
  const lv = getLevel(profile.xp);
  el.levelText.textContent = `等级：${lv.name} · XP ${profile.xp}`;
}
renderLevel();

/** =======================
 *  解析菜谱（简化）
 *  step.type: set_heat / add / stir / wait / plate
 *  ======================= */
function findAssetIdByText(text){
  for (const a of ASSETS){
    if (a.keywords?.some(k => text.includes(k))) return a.id;
  }
  return null;
}

function parseRecipeText(raw){
  const text = (raw || '').trim();
  const lines = text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if (!lines.length) return null;

  const title = (lines[0].length <= 20 && !/^\d+\s*[、.)]/.test(lines[0])) ? lines[0] : '未命名菜谱';

  const stepLines = [];
  for (const ln of lines) {
    if (/^\d+\s*[、.)]/.test(ln)) stepLines.push(ln.replace(/^\d+\s*[、.)]\s*/,''));
  }
  if (stepLines.length === 0) {
    for (const ln of lines) {
      if (/(加入|倒入|下锅|翻炒|煸炒|爆香|收汁|加水|焯|煮|炖|蒸|腌|切|装盘|出锅|调味)/.test(ln)) stepLines.push(ln);
    }
  }

  const steps = stepLines.map((s, idx) => {
    const heat = (s.match(/(大火|中火|小火|文火)/) || [])[1] || null;

    // 时间
    let sec = null;
    const m1 = s.match(/(\d+)\s*(秒|s)\b/i);
    const m2 = s.match(/(\d+)\s*(分钟|min)\b/i);
    if (m1) sec = parseInt(m1[1],10);
    else if (m2) sec = parseInt(m2[1],10) * 60;

    // 动作类型
    let type = 'wait';
    let targetAssetId = null;
    let toZone = null;

    if (/(装盘|出锅)/.test(s)) type = 'plate';
    else if (/(翻炒|煸炒|爆香)/.test(s)) type = 'stir';
    else if (/(下锅|加入|倒入)/.test(s)) {
      type = 'add';
      targetAssetId = findAssetIdByText(s);
      // 粗略判断投放位置：出现“碗/裹/调汁/腌” -> bowl，否则 pan
      toZone = /(碗|裹|调汁|腌)/.test(s) ? 'bowl' : 'pan';
    }
    else if (heat) type = 'set_heat';

    return {
      id: crypto.randomUUID(),
      idx: idx+1,
      text: s,
      type,
      heat,
      durationSec: sec ?? (type === 'stir' ? 15 : 10),
      targetAssetId, // 可能为 null（此时 add 步允许任意素材）
      toZone
    };
  });

  return { id: crypto.randomUUID(), title, createdAt: Date.now(), steps };
}

function upsertRecipe(r){
  recipes = [r, ...recipes];
  saveJSON(KEY_RECIPES, recipes);
  activeRecipeId = r.id;
  saveJSON(KEY_ACTIVE, activeRecipeId);
  refreshRecipeSelect();
}

function refreshRecipeSelect(){
  el.recipeSelect.innerHTML = '';
  if (recipes.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '暂无菜谱';
    el.recipeSelect.appendChild(opt);
    return;
  }
  for (const r of recipes){
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.title}（${r.steps.length}步）`;
    el.recipeSelect.appendChild(opt);
  }
  if (!activeRecipeId) activeRecipeId = recipes[0].id;
  el.recipeSelect.value = activeRecipeId;
}
refreshRecipeSelect();

function getActiveRecipe(){
  return recipes.find(r=>r.id===activeRecipeId) || null;
}

/** =======================
 *  操作日志
 *  ======================= */
let eventLog = [];
function log(action, data={}){
  const t = new Date().toLocaleTimeString();
  eventLog.unshift({ t, action, data });
  renderLog();
}
function renderLog(){
  el.logBox.innerHTML = eventLog.slice(0, 40).map(e => {
    const d = JSON.stringify(e.data);
    return `<div class="muted mono">[${e.t}] ${e.action} ${d === '{}' ? '' : d}</div>`;
  }).join('');
}

/** =======================
 *  操作区域（锅/碗/砧板）
 *  ======================= */
const zoneState = {
  pan: [],
  bowl: [],
  board: []
};
// 用于“本步骤完成判定”：记录本步骤开始后的事件
let stepSession = { drops: [], actions: [] };

function renderZones(){
  const renderList = (arr) => arr.map(it => `<span class="tag">${it.label}</span>`).join('');
  el.listPan.innerHTML = renderList(zoneState.pan);
  el.listBowl.innerHTML = renderList(zoneState.bowl);
  el.listBoard.innerHTML = renderList(zoneState.board);
  el.cntPan.textContent = String(zoneState.pan.length);
  el.cntBowl.textContent = String(zoneState.bowl.length);
  el.cntBoard.textContent = String(zoneState.board.length);
}
renderZones();

function clearZones(){
  zoneState.pan = [];
  zoneState.bowl = [];
  zoneState.board = [];
  renderZones();
  // 3D锅里也清一下（下面会有 panContents3D）
  clearPan3D();
  log('zones_clear');
}
el.btnClearZones.addEventListener('click', clearZones);

/** =======================
 *  资源库渲染（含上传图片 B）
 *  ======================= */
let activeAssetTab = 'ingredient'; // ingredient | seasoning

function setTab(tab){
  activeAssetTab = tab;
  el.tabIng.classList.toggle('active', tab === 'ingredient');
  el.tabSea.classList.toggle('active', tab === 'seasoning');
  renderAssets();
}
el.tabIng.addEventListener('click', ()=>setTab('ingredient'));
el.tabSea.addEventListener('click', ()=>setTab('seasoning'));
el.assetSearch.addEventListener('input', renderAssets);

function createHiddenFileInput(onFile){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const dataURL = await fileToDataURL(file);
    onFile(dataURL);
    input.value = '';
  });
  document.body.appendChild(input);
  return input;
}
function fileToDataURL(file){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

const uploadInput = createHiddenFileInput(()=>{});

function renderAssets(){
  const q = (el.assetSearch.value || '').trim();
  const list = ASSETS.filter(a => a.type === activeAssetTab)
    .filter(a => !q || a.name.includes(q) || a.keywords?.some(k=>k.includes(q)));

  el.assetGrid.innerHTML = '';
  for (const a of list){
    const wrap = document.createElement('div');
    wrap.className = 'asset';
    wrap.draggable = true;

    // drag payload
    wrap.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({ assetId: a.id }));
      ev.dataTransfer.effectAllowed = 'copy';
      log('drag_asset', { assetId: a.id, name: a.name });
    });

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const imgUrl = assetImgs[a.id];
    if (imgUrl){
      const img = document.createElement('img');
      img.src = imgUrl;
      thumb.appendChild(img);
    } else {
      thumb.textContent = a.emoji || '🍽️';
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<div class="name">${a.name}</div><div class="type">${a.type === 'ingredient' ? '食材' : '调料'}</div>`;

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.gap = '6px';

    // B：上传图片
    const btnUp = document.createElement('button');
    btnUp.className = 'btn secondary small';
    btnUp.textContent = '上传图';
    btnUp.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadInput.onchange = null;
      uploadInput.onchange = async () => {}; // 兜底
      // 用我们自己的 input（避免多个 input）
      uploadInput.onchange = null;
      uploadInput.addEventListener('change', async function handler(){
        uploadInput.removeEventListener('change', handler);
        const file = uploadInput.files?.[0];
        if (!file) return;
        const dataURL = await fileToDataURL(file);
        assetImgs[a.id] = dataURL;
        saveJSON(KEY_ASSET_IMG, assetImgs);
        renderAssets();
        log('asset_image_set', { assetId: a.id });
      }, { once:true });
      uploadInput.click();
    });

    // 清除图片回到A
    const btnClr = document.createElement('button');
    btnClr.className = 'btn secondary small';
    btnClr.textContent = '还原';
    btnClr.addEventListener('click', (e) => {
      e.stopPropagation();
      delete assetImgs[a.id];
      saveJSON(KEY_ASSET_IMG, assetImgs);
      renderAssets();
      log('asset_image_clear', { assetId: a.id });
    });

    right.appendChild(btnUp);
    right.appendChild(btnClr);

    wrap.appendChild(thumb);
    wrap.appendChild(meta);
    wrap.appendChild(right);
    el.assetGrid.appendChild(wrap);
  }
}
renderAssets();

/** =======================
 *  Drop zones drag/drop
 *  ======================= */
function setZoneActive(zoneEl, active){
  zoneEl.classList.toggle('active', active);
}
function makeZoneDrop(zoneEl, zoneName){
  zoneEl.addEventListener('dragover', (ev) => { ev.preventDefault(); setZoneActive(zoneEl, true); });
  zoneEl.addEventListener('dragleave', () => setZoneActive(zoneEl, false));
  zoneEl.addEventListener('drop', (ev) => {
    ev.preventDefault();
    setZoneActive(zoneEl, false);

    let payload = null;
    try { payload = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}'); } catch {}
    const assetId = payload?.assetId;
    const a = ASSETS.find(x=>x.id===assetId);
    if (!a) return;

    const item = { assetId, label: a.name };
    zoneState[zoneName].push(item);
    renderZones();

    // 记录本步骤 drop（用于判定）
    stepSession.drops.push({ assetId, to: zoneName });
    log('drop', { assetId, to: zoneName });

    // 3D里：如果是丢进锅，就生成一点小方块“进锅”
    if (zoneName === 'pan') addToPan3D(a);

    setHint(`已放入：${a.name} → ${zoneName==='pan'?'锅':zoneName==='bowl'?'碗':'砧板'}`);
  });
}
makeZoneDrop(el.zonePan, 'pan');
makeZoneDrop(el.zoneBowl, 'bowl');
makeZoneDrop(el.zoneBoard, 'board');

/** =======================
 *  动作面板（点动作+输入秒数）
 *  ======================= */
el.btnDoAction.addEventListener('click', () => {
  const action = el.actionSelect.value;
  const sec = Math.max(0, parseInt(el.actionSec.value || '0', 10));

  stepSession.actions.push({ action, sec, heat: heatNameFromValue(heat).name });
  log('action', { action, sec, heat: heatNameFromValue(heat).name });

  el.actionEcho.textContent = `${action} ${sec}s`;

  // 如果当前是翻炒步骤，我们用“累加秒数”做达标判定
  if (action === 'stir') {
    stirAccumSec += sec;
    setHint(`翻炒累计：${stirAccumSec}s`);
  }
  // plate
  if (action === 'plate') {
    plated = true;
    setHint('已装盘（可尝试完成步骤）');
  }
});

/** =======================
 *  火力/温度
 *  ======================= */
let heat = 40;
let panTemp = 25;
const AMBIENT = 25;

function heatNameFromValue(v){
  if (v < 25) return { name:'小火' };
  if (v < 70) return { name:'中火' };
  return { name:'大火' };
}
function heatToTargetTemp(v){
  return 25 + (v/100) * 235;
}
function updateHeatUI(){
  const hn = heatNameFromValue(heat).name;
  el.heatLabel.textContent = `${hn}（${heat}）`;
}
el.heat.addEventListener('input', () => {
  heat = parseInt(el.heat.value, 10);
  updateHeatUI();
  log('set_heat', { heat, name: heatNameFromValue(heat).name });
});
updateHeatUI();

/** =======================
 *  练习模式：步骤状态机
 *  ======================= */
let mode = 'practice';
let stepIdx = 0;

// 用于判定 stir/plate 步骤
let stirAccumSec = 0;
let plated = false;

function resetStepSession(){
  stepSession = { drops: [], actions: [] };
  stirAccumSec = 0;
  plated = false;
}

function renderStep(){
  const r = getActiveRecipe();
  if (!r) {
    el.stepIndex.textContent = '-/-';
    el.stepText.textContent = '暂无步骤';
    el.stepRule.textContent = '完成条件：-';
    setHint('提示：先导入菜谱');
    return;
  }
  const step = r.steps[stepIdx];
  el.stepIndex.textContent = `${stepIdx+1}/${r.steps.length}`;
  el.stepText.textContent = step.text;

  let rule = '';
  if (step.type === 'set_heat') rule = `把火力调到：${step.heat}`;
  else if (step.type === 'add') {
    const name = step.targetAssetId ? (ASSETS.find(a=>a.id===step.targetAssetId)?.name || '素材') : '任意素材';
    const to = step.toZone === 'bowl' ? '碗' : '锅';
    rule = `把【${name}】拖到【${to}】`;
  }
  else if (step.type === 'stir') rule = `执行动作：翻炒累计 ≥ ${step.durationSec}s`;
  else if (step.type === 'plate') rule = `执行动作：装盘`;
  else rule = `执行动作：等待/操作（不严格）`;

  el.stepRule.textContent = `完成条件：${rule}`;
  setHint(`当前：${rule}`);

  resetStepSession();
}

function canCompleteCurrentStep(){
  const r = getActiveRecipe();
  if (!r) return false;
  const step = r.steps[stepIdx];

  if (step.type === 'set_heat') {
    const current = heatNameFromValue(heat).name;
    return current === step.heat;
  }

  if (step.type === 'add') {
    const needId = step.targetAssetId;
    const needZone = step.toZone || 'pan';

    // 本步骤内是否有对应 drop
    const ok = stepSession.drops.some(d => {
      if (needZone && d.to !== needZone) return false;
      if (!needId) return true;       // 未识别目标时：任意素材都算
      return d.assetId === needId;
    });
    return ok;
  }

  if (step.type === 'stir') {
    return stirAccumSec >= (step.durationSec || 0);
  }

  if (step.type === 'plate') {
    return plated === true;
  }

  return true;
}

function completeAndNext(){
  const r = getActiveRecipe();
  if (!r) return;

  if (!canCompleteCurrentStep()){
    setHint('还没完成：按“完成条件”操作（拖拽/火力/动作）');
    return;
  }

  log('step_complete', { idx: stepIdx+1, type: r.steps[stepIdx].type });

  // 最后一步结算少量XP（升级慢）
  if (stepIdx === r.steps.length - 1) {
    const gain = Math.max(1, Math.min(3, Math.floor(r.steps.length / 6))); // 1~3 XP
    profile.xp += gain;
    saveJSON(KEY_PROFILE, profile);
    renderLevel();
    setHint(`通关完成！获得 XP +${gain}（升级很慢）`);
    log('finish_recipe', { title: r.title, gain, xp: profile.xp });
    return;
  }

  stepIdx = Math.min(r.steps.length - 1, stepIdx + 1);
  renderStep();
}

el.btnPractice.addEventListener('click', () => {
  mode = 'practice';
  stepIdx = 0;
  renderStep();
  log('mode_practice');
  setHint('练习模式：按步骤完成操作');
});

el.btnPrev.addEventListener('click', () => {
  const r = getActiveRecipe();
  if (!r) return;
  stepIdx = Math.max(0, stepIdx - 1);
  renderStep();
  log('step_prev', { idx: stepIdx+1 });
});

el.btnNext.addEventListener('click', completeAndNext);

/** =======================
 *  菜谱导入/加载
 *  ======================= */
el.btnParse.addEventListener('click', () => {
  const r = parseRecipeText(el.recipeInput.value);
  if (!r) { setHint('导入失败：文本为空'); return; }
  upsertRecipe(r);
  el.recipeInput.value = '';
  stepIdx = 0;
  renderStep();
  log('recipe_saved', { title: r.title, steps: r.steps.length });
  setHint(`已保存：${r.title}`);
});

el.btnLoad.addEventListener('click', () => {
  recipes = loadJSON(KEY_RECIPES, []);
  activeRecipeId = loadJSON(KEY_ACTIVE, null);
  refreshRecipeSelect();
  stepIdx = 0;
  renderStep();
  log('recipes_loaded');
  setHint('已加载本地菜谱');
});

el.recipeSelect.addEventListener('change', () => {
  activeRecipeId = el.recipeSelect.value;
  saveJSON(KEY_ACTIVE, activeRecipeId);
  stepIdx = 0;
  renderStep();
  log('select_recipe', { id: activeRecipeId });
});

/** =======================
 *  重置
 *  ======================= */
el.btnReset.addEventListener('click', () => {
  if (!confirm('确定清空本地菜谱/经验/图片吗？')) return;
  localStorage.removeItem(KEY_RECIPES);
  localStorage.removeItem(KEY_PROFILE);
  localStorage.removeItem(KEY_ACTIVE);
  localStorage.removeItem(KEY_ASSET_IMG);
  location.reload();
});

/** =======================
 *  Three.js：保留“3D锅/火焰/温度”作为游戏背景
 *  丢进锅会生成小方块表示“入锅”
 *  ======================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a09);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 5.5, 7.5);
camera.lookAt(0, 0.8, 0);

const renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

const light1 = new THREE.DirectionalLight(0xffffff, 1.2);
light1.position.set(4, 8, 3);
scene.add(light1);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

// 灶台
const stove = new THREE.Mesh(
  new THREE.BoxGeometry(8, 0.6, 6),
  new THREE.MeshStandardMaterial({ color: 0x14110f, metalness: 0.2, roughness: 0.8 })
);
stove.position.y = -0.3;
scene.add(stove);

// 锅
const pan = new THREE.Mesh(
  new THREE.CylinderGeometry(1.45, 1.65, 0.55, 32, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x2a2725, metalness: 0.4, roughness: 0.65, side: THREE.DoubleSide })
);
pan.position.set(0, 0.35, 0);
scene.add(pan);

const panBase = new THREE.Mesh(
  new THREE.CylinderGeometry(1.2, 1.2, 0.08, 32),
  new THREE.MeshStandardMaterial({ color: 0x1f1c1a, metalness: 0.2, roughness: 0.8 })
);
panBase.position.set(0, 0.1, 0);
scene.add(panBase);

// 火焰
const flame = new THREE.Mesh(
  new THREE.ConeGeometry(0.65, 1.3, 24),
  new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0xff6a00, emissiveIntensity: 1.1, roughness: 0.6 })
);
flame.position.set(0, 0.0, 0);
scene.add(flame);

// 锅内食材（3D显示）
const panItems3D = [];
function addToPan3D(asset){
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.28),
    new THREE.MeshStandardMaterial({ color: asset.color ?? 0xffffff, roughness: 0.7 })
  );
  m.position.set((Math.random()*0.8 - 0.4), 0.35, (Math.random()*0.8 - 0.4));
  scene.add(m);
  panItems3D.push(m);
}
function clearPan3D(){
  for (const m of panItems3D) scene.remove(m);
  panItems3D.length = 0;
}

function resize(){
  const rect = el.canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
requestAnimationFrame(resize);

let last = performance.now();
function animate(now){
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 火焰大小
  const s = 0.25 + (heat/100) * 1.2;
  flame.scale.set(s, s, s);
  flame.visible = heat > 0;

  // 温度逼近
  const targetTemp = heatToTargetTemp(heat);
  const k = 1 - Math.exp(-dt * 0.9);
  panTemp = panTemp + (targetTemp - panTemp) * k;

  el.chipTemp.textContent = `锅温：${Math.round(panTemp)}°C`;

  // 锅颜色热感
  const warm = Math.min(1, Math.max(0, (panTemp - 60) / 140));
  pan.material.color.setRGB(0.16 + warm*0.22, 0.15 + warm*0.10, 0.14);
  panBase.material.color.setRGB(0.14 + warm*0.18, 0.13 + warm*0.08, 0.12);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

/** =======================
 *  初始化
 *  ======================= */
renderStep();
setHint(recipes.length ? '提示：拖拽素材到“锅/碗/砧板”，再按步骤完成' : '提示：先导入菜谱');
