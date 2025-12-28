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

function clearZones()
