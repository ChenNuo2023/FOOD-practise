import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

//
// ====== 本地数据：菜谱、档案（XP/等级）、日志 ======
//
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

const KEY_RECIPES = 'cook3d_recipes_v01';
const KEY_PROFILE = 'cook3d_profile_v01';
const KEY_ACTIVE = 'cook3d_active_recipe_v01';

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function getLevel(xp){
  for (let i=0;i<LEVELS.length;i++){
    if (xp < LEVELS[i].max) return { idx:i, ...LEVELS[i] };
  }
  return { idx:LEVELS.length-1, ...LEVELS[LEVELS.length-1] };
}

const profile = loadJSON(KEY_PROFILE, { xp: 0 });
let recipes = loadJSON(KEY_RECIPES, []);
let activeRecipeId = loadJSON(KEY_ACTIVE, null);

//
// ====== UI refs ======
//
const el = {
  canvas: document.getElementById('canvas'),
  heat: document.getElementById('heat'),
  heatLabel: document.getElementById('heatLabel'),
  chipTemp: document.getElementById('chipTemp'),
  chipHint: document.getElementById('chipHint'),
  recipeInput: document.getElementById('recipeInput'),
  btnParse: document.getElementById('btnParse'),
  btnLoad: document.getElementById('btnLoad'),
  recipeSelect: document.getElementById('recipeSelect'),
  btnPractice: document.getElementById('btnPractice'),
  btnExam: document.getElementById('btnExam'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnStir: document.getElementById('btnStir'),
  stepIndex: document.getElementById('stepIndex'),
  stepText: document.getElementById('stepText'),
  stepRule: document.getElementById('stepRule'),
  stirProg: document.getElementById('stirProg'),
  logBox: document.getElementById('logBox'),
  levelText: document.getElementById('levelText'),
  btnReset: document.getElementById('btnReset')
};

function renderLevel(){
  const lv = getLevel(profile.xp);
  el.levelText.textContent = `等级：${lv.name} · XP ${profile.xp}`;
}
renderLevel();

//
// ====== 菜谱解析：文本 -> steps（简化规则） ======
// 目标：把“做法文本”变成可执行任务脚本（状态机）
//
function parseRecipeText(raw){
  const text = (raw || '').trim();
  const lines = text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if (!lines.length) return null;

  let title = lines[0].length <= 20 ? lines[0] : '未命名菜谱';
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
    let sec = null;
    const m1 = s.match(/(\d+)\s*(秒|s)\b/i);
    const m2 = s.match(/(\d+)\s*(分钟|min)\b/i);
    if (m1) sec = parseInt(m1[1],10);
    else if (m2) sec = parseInt(m2[1],10) * 60;

    // 识别动作类型（MVP：heat / add / stir / wait）
    let type = 'wait';
    let target = null;

    if (heat) type = 'set_heat';
    if (/(下|加入|倒入)/.test(s)) { type = 'add'; target = guessIngredient(s); }
    if (/(翻炒|煸炒|爆香)/.test(s)) type = 'stir';

    return {
      id: crypto.randomUUID(),
      idx: idx+1,
      text: s,
      type,
      heat,                 // 期望火力
      durationSec: sec ?? (type === 'stir' ? 15 : 20),
      target                // 目标食材名（非常粗糙，后面可手动改）
    };
  });

  return {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    steps
  };
}

function guessIngredient(stepText){
  // 超简化：抓“肉/葱/蒜/姜/油/醋/糖/盐/酱油/淀粉/水/料酒”
  const dict = ['肉','鸡','牛','虾','鱼','葱','姜','蒜','油','醋','糖','盐','酱油','生抽','老抽','淀粉','水','料酒','辣椒'];
  for (const k of dict) if (stepText.includes(k)) return k;
  return '食材';
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

//
// ====== 练习状态机（步骤推进、完成判定） ======
//
let mode = 'practice';
let stepIdx = 0;
let stirProgress = 0; // 0~1
let eventLog = [];

function log(action, data={}){
  const t = new Date().toLocaleTimeString();
  const item = { t, action, data };
  eventLog.unshift(item);
  renderLog();
}

function renderLog(){
  el.logBox.innerHTML = eventLog.slice(0, 30).map(e => {
    const d = JSON.stringify(e.data);
    return `<div class="muted mono">[${e.t}] ${e.action} ${d === '{}' ? '' : d}</div>`;
  }).join('');
}

function setHint(text){
  el.chipHint.textContent = text;
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

  // 规则提示
  let rule = '';
  if (step.type === 'set_heat') rule = `把火力调到：${step.heat}`;
  else if (step.type === 'add') rule = `把【${step.target || '食材'}】拖进锅里`;
  else if (step.type === 'stir') rule = `翻炒累计：${step.durationSec}s（点击“翻炒”推进）`;
  else rule = `等待/操作：约 ${step.durationSec}s`;

  el.stepRule.textContent = `完成条件：${rule}`;
  setHint(`当前：${rule}`);

  stirProgress = 0;
  el.stirProg.textContent = '0%';
}

function canCompleteCurrentStep(){
  const r = getActiveRecipe();
  if (!r) return false;
  const step = r.steps[stepIdx];
  if (step.type === 'set_heat') {
    const need = heatNameFromValue(heatValue()).name;
    return need === step.heat;
  }
  if (step.type === 'add') {
    // 如果锅里已包含目标食材（简化：锅里有任何食材也算）
    if (step.target) return panContents.has(step.target);
    return panContents.size > 0;
  }
  if (step.type === 'stir') {
    return stirProgress >= 1;
  }
  return true; // wait类不严格
}

function completeAndNext(){
  const r = getActiveRecipe();
  if (!r) return;
  const step = r.steps[stepIdx];

  if (!canCompleteCurrentStep()){
    setHint('还没完成当前条件：请按提示操作');
    return;
  }

  log('step_complete', { idx: stepIdx+1, type: step.type });
  stepIdx = Math.min(r.steps.length-1, stepIdx+1);
  renderStep();

  // 完成所有步骤：给一点点XP（升级慢）
  if (stepIdx === r.steps.length-1 && canCompleteCurrentStep()){
    // 只有在最后一步也完成才算通关（这里先简化：用户再点一次“完成”）
  }
}

//
// ====== 火力/温度（简化） ======
//
let heat = 40;        // 0-100
let panTemp = 25;     // ℃，简化模型：向某个目标温度逼近
const AMBIENT = 25;

function heatValue(){ return heat; }
function heatNameFromValue(v){
  if (v < 25) return { name:'小火' };
  if (v < 70) return { name:'中火' };
  return { name:'大火' };
}
function heatToTargetTemp(v){
  // 0..100 -> 25..260
  return 25 + (v/100) * 235;
}

function updateHeatUI(){
  const v = heatValue();
  const hn = heatNameFromValue(v).name;
  el.heatLabel.textContent = `${hn}（${v}）`;
}

//
// ====== Three.js：场景、锅、火焰、食材拖拽、丢锅判定 ======
//
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

// 锅（锅身+锅底）
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

// 火焰（简化：一个锥体+发光材质）
const flame = new THREE.Mesh(
  new THREE.ConeGeometry(0.65, 1.3, 24),
  new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0xff6a00, emissiveIntensity: 1.1, roughness: 0.6 })
);
flame.position.set(0, 0.0, 0);
scene.add(flame);

// 食材方块：肉/葱/蒜/糖/醋（先给5个）
const ingredientDefs = [
  { key:'肉', color:0xd96c6c, x:-2.8, z: 1.6 },
  { key:'葱', color:0x6dd96c, x:-2.8, z: 0.8 },
  { key:'蒜', color:0xd9d56c, x:-2.8, z: 0.0 },
  { key:'糖', color:0xe7e5e4, x:-2.8, z:-0.8 },
  { key:'醋', color:0x7c3aed, x:-2.8, z:-1.6 },
];

const draggable = [];
const ingredientMeshes = new Map();
const panContents = new Set(); // 锅里已添加的食材key

for (const def of ingredientDefs){
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.55, 0.55),
    new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 })
  );
  m.position.set(def.x, 0.35, def.z);
  m.userData = { type:'ingredient', key:def.key, home: m.position.clone(), inPan:false };
  scene.add(m);
  draggable.push(m);
  ingredientMeshes.set(def.key, m);
}

// 地面交互平面（用于拖拽投影）
const floorPlane = new THREE.Plane(new THREE.Vector3(0,1,0), -0.35);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let dragging = null;
let dragOffset = new THREE.Vector3();

function setPointerFromEvent(e){
  const rect = el.canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  pointer.set(x, y);
}

function pickObject(){
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(draggable, false);
  return hits[0] || null;
}

function projectToFloor(){
  raycaster.setFromCamera(pointer, camera);
  const p = new THREE.Vector3();
  raycaster.ray.intersectPlane(floorPlane, p);
  return p;
}

function isInsidePan(pos){
  // 简化：锅中心(0,0) 半径1.35
  const dx = pos.x - pan.position.x;
  const dz = pos.z - pan.position.z;
  const r = Math.sqrt(dx*dx + dz*dz);
  return r <= 1.25;
}

function onPointerDown(e){
  setPointerFromEvent(e);
  const hit = pickObject();
  if (!hit) return;

  dragging = hit.object;
  const floorP = projectToFloor();
  dragOffset.copy(dragging.position).sub(floorP);
  el.canvas.setPointerCapture(e.pointerId);
  log('pick', { key: dragging.userData.key });
}

function onPointerMove(e){
  if (!dragging) return;
  setPointerFromEvent(e);
  const floorP = projectToFloor();
  dragging.position.copy(floorP.add(dragOffset));
  dragging.position.y = 0.35;
}

function onPointerUp(e){
  if (!dragging) return;

  const key = dragging.userData.key;
  const droppedInPan = isInsidePan(dragging.position);

  if (droppedInPan){
    // 丢进锅：放在锅中心附近，并标记 inPan
    dragging.position.set(
      (Math.random()*0.7 - 0.35),
      0.35,
      (Math.random()*0.7 - 0.35)
    );
    dragging.userData.inPan = true;
    panContents.add(key);
    log('add_to_pan', { key });

    // 如果当前步骤要求 add，且目标匹配，则提示可完成
    setHint(`已加入：${key}（可尝试完成当前步骤）`);
  } else {
    // 回到原位
    dragging.position.copy(dragging.userData.home);
    log('drop_back', { key });
  }

  dragging = null;
}

el.canvas.addEventListener('pointerdown', onPointerDown);
el.canvas.addEventListener('pointermove', onPointerMove);
el.canvas.addEventListener('pointerup', onPointerUp);

//
// ====== 尺寸自适应 ======
//
function resize(){
  const rect = el.canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
requestAnimationFrame(resize);

//
// ====== 动画循环：火焰/锅温/视觉反馈 ======
//
let last = performance.now();

function animate(now){
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 火焰大小
  const s = 0.25 + (heat/100) * 1.2;
  flame.scale.set(s, s, s);
  flame.visible = heat > 0;

  // 锅温逼近目标温度
  const targetTemp = heatToTargetTemp(heat);
  const k = 1 - Math.exp(-dt * 0.9);
  panTemp = panTemp + (targetTemp - panTemp) * k;

  // 温度显示
  el.chipTemp.textContent = `锅温：${Math.round(panTemp)}°C`;

  // 锅“热了”颜色变暖（简单材质偏色）
  const warm = Math.min(1, Math.max(0, (panTemp - 60) / 140));
  pan.material.color.setRGB(0.16 + warm*0.22, 0.15 + warm*0.10, 0.14);
  panBase.material.color.setRGB(0.14 + warm*0.18, 0.13 + warm*0.08, 0.12);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

//
// ====== UI交互：火力、步骤推进、翻炒、导入/加载 ======
//
el.heat.addEventListener('input', () => {
  heat = parseInt(el.heat.value, 10);
  updateHeatUI();
  log('set_heat', { heat, name: heatNameFromValue(heat).name });
});
updateHeatUI();

el.recipeSelect.addEventListener('change', () => {
  activeRecipeId = el.recipeSelect.value;
  saveJSON(KEY_ACTIVE, activeRecipeId);
  stepIdx = 0;
  renderStep();
  log('select_recipe', { id: activeRecipeId });
});

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

el.btnPractice.addEventListener('click', () => {
  mode = 'practice';
  stepIdx = 0;
  stirProgress = 0;
  el.stirProg.textContent = '0%';
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

el.btnNext.addEventListener('click', () => {
  const r = getActiveRecipe();
  if (!r) return;

  const isOk = canCompleteCurrentStep();
  if (!isOk){
    setHint('还没完成：请按“完成条件”操作');
    return;
  }

  // 如果是最后一步并且完成：结算少量XP（升级慢）
  if (stepIdx === r.steps.length - 1){
    profile.xp += Math.max(1, Math.min(3, Math.floor(r.steps.length / 6))); // 1~3 XP
    saveJSON(KEY_PROFILE, profile);
    renderLevel();
    setHint(`通关完成！获得少量XP（升级很慢）`);
    log('finish_recipe', { title: r.title, xp: profile.xp });
    return;
  }

  completeAndNext();
});

el.btnStir.addEventListener('click', () => {
  const r = getActiveRecipe();
  if (!r) return;
  const step = r.steps[stepIdx];
  // 只有在 stir 步骤时有效
  if (step.type !== 'stir'){
    setHint('当前步骤不是翻炒要求');
    log('stir_ignored', { reason:'not_stir_step' });
    return;
  }

  // 每点一下推进一点，模拟持续翻炒
  const add = 0.18;
  stirProgress = Math.min(1, stirProgress + add);
  el.stirProg.textContent = `${Math.round(stirProgress*100)}%`;
  log('stir', { progress: stirProgress });

  if (stirProgress >= 1){
    setHint('翻炒达标，可以完成本步');
  }
});

el.btnReset.addEventListener('click', () => {
  if (!confirm('确定清空本地菜谱/经验/日志吗？')) return;
  localStorage.removeItem(KEY_RECIPES);
  localStorage.removeItem(KEY_PROFILE);
  localStorage.removeItem(KEY_ACTIVE);
  location.reload();
});

// 初始渲染
renderStep();
setHint(recipes.length ? '提示：拖拽食材到锅里，然后按步骤练习' : '提示：先导入菜谱');
