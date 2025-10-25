// ========== State & helpers ==========
const LS_KEY = "gradeplanner:v2";

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const pct = (x)=> (x==null||!isFinite(x)?"—":(x*100).toFixed(1)+"%");

// MPS-style default cutoffs (editable in Settings)
let gradeCuts = {
  A: 93, Aminus: 90,
  Bplus: 87, B: 83, Bminus: 80,
  Cplus: 77, C: 73, Cminus: 70,
  Dplus: 67, D: 63, Dminus: 60
};

function letterFromPct(x) {
  if (x==null) return "—";
  const p = x*100;
  if (p >= gradeCuts.A) return "A";
  if (p >= gradeCuts.Aminus) return "A-";
  if (p >= gradeCuts.Bplus) return "B+";
  if (p >= gradeCuts.B) return "B";
  if (p >= gradeCuts.Bminus) return "B-";
  if (p >= gradeCuts.Cplus) return "C+";
  if (p >= gradeCuts.C) return "C";
  if (p >= gradeCuts.Cminus) return "C-";
  if (p >= gradeCuts.Dplus) return "D+";
  if (p >= gradeCuts.D) return "D";
  if (p >= gradeCuts.Dminus) return "D-";
  return "F";
}

function calcCategoryAvg(items) {
  const t = items.reduce((a,it)=>{
    const e=Number(it.earned), p=Number(it.possible);
    if (!isFinite(e)||!isFinite(p)||p<=0) return a;
    a.e+=e; a.p+=p; return a;
  },{e:0,p:0});
  if (t.p<=0) return null;
  return t.e/t.p;
}
function calcCourseGrade(course) {
  const parts = course.categories.map(c=>({avg:calcCategoryAvg(c.items), weight:c.weight}));
  const usedW = parts.filter(p=>p.avg!=null).reduce((s,p)=>s+p.weight,0);
  if (usedW===0) return null;
  return parts.filter(p=>p.avg!=null).reduce((s,p)=>s+(p.avg*p.weight)/usedW,0);
}

function defaultCourse(){
  return {
    id: uid(),
    name: "Algebra II",
    categories: [
      { id: uid(), name: "Assessments", weight: 0.8, items:[
        { id: uid(), label: "Quiz 1", earned: 18, possible: 20 },
        { id: uid(), label: "Unit Test", earned: 42, possible: 50 },
      ]},
      { id: uid(), name: "Classwork/Homework", weight: 0.2, items:[
        { id: uid(), label: "HW 1", earned: 10, possible: 10 },
        { id: uid(), label: "HW 2", earned: 9, possible: 10 },
      ]},
    ]
  };
}
function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return { courses:[defaultCourse()], gradeCuts, currentCourseId:null };
    const obj = JSON.parse(raw);
    if (obj.gradeCuts) gradeCuts = obj.gradeCuts;
    return { courses: obj.courses || [defaultCourse()], gradeCuts, currentCourseId: obj.currentCourseId || null };
  }catch{ return { courses:[defaultCourse()], gradeCuts, currentCourseId:null }; }
}
function save(){
  localStorage.setItem(LS_KEY, JSON.stringify({ courses: state.courses, gradeCuts, currentCourseId: state.currentCourseId }));
}
let state = load();

// what-if (not saved)
const whatIf = { courseId:null, categoryId:null, earned:0, possible:0 };

// ========== DOM refs ==========
const $courses = document.getElementById("courses");
const $courseTabs = document.getElementById("courseTabs");
const $addCourse = document.getElementById("addCourseBtn");
const $export = document.getElementById("exportBtn");
const $import = document.getElementById("importInput");

const $wiCourse = document.getElementById("whatIfCourse");
const $wiCategory = document.getElementById("whatIfCategory");
const $wiEarned = document.getElementById("whatIfEarned");
const $wiPossible = document.getElementById("whatIfPossible");
const $wiProjected = document.getElementById("whatIfProjected");

// Settings
const $settingsBtn = document.getElementById("settingsBtn");
const $dlg = document.getElementById("settingsDlg");
const $cut = {
  A: document.getElementById("cutA"),
  Aminus: document.getElementById("cutAminus"),
  Bplus: document.getElementById("cutBplus"),
  B: document.getElementById("cutB"),
  Bminus: document.getElementById("cutBminus"),
  Cplus: document.getElementById("cutCplus"),
  C: document.getElementById("cutC"),
  Cminus: document.getElementById("cutCminus"),
  Dplus: document.getElementById("cutDplus"),
  D: document.getElementById("cutD"),
  Dminus: document.getElementById("cutDminus"),
};
const $saveSettings = document.getElementById("saveSettingsBtn");
const $presetMPS = document.getElementById("presetMPS");
const $presetSimple = document.getElementById("presetSimple");

// ========== Render ==========

function ensureCurrentCourse() {
  if (!state.currentCourseId) {
    state.currentCourseId = state.courses[0]?.id || null;
  } else {
    // if the saved current course no longer exists, pick first
    if (!state.courses.some(c => c.id === state.currentCourseId)) {
      state.currentCourseId = state.courses[0]?.id || null;
    }
  }
}

function render(){
  ensureCurrentCourse();
  renderCourseTabs();          // tabs at the top
  renderSelectedCourseOnly();  // only one course body
  renderWhatIfSelectors();     // what-if dropdowns
  refreshAllDerivedUI();       // % and letters
}

function renderCourseTabs(){
  $courseTabs.innerHTML = state.courses.map(c => `
    <button class="tab ${c.id===state.currentCourseId ? 'active':''}" data-tab-course="${c.id}">
      ${esc(c.name)}
    </button>
  `).join("");
}

function renderSelectedCourseOnly(){
  const course = state.courses.find(c => c.id === state.currentCourseId);
  $courses.innerHTML = course ? renderCourse(course) : `<p class="muted">No course selected.</p>`;
}

function renderCourse(course){
  const grade = calcCourseGrade(course);
  const header = `
    <div class="course" data-course="${course.id}">
      <div class="course-header">
        <div class="course-title">
          <input class="input js-course-name" data-course="${course.id}" value="${esc(course.name)}" />
        </div>
        <div class="course-grade">
          <div class="muted">Current</div>
          <div class="big"><span class="js-course-pct" data-course="${course.id}">${pct(grade)}</span> <span class="badge js-course-letter" data-course="${course.id}">${letterFromPct(grade)}</span></div>
        </div>
      </div>

      <div class="actions" style="margin-top:8px">
        <button class="btn" data-action="add-category" data-course="${course.id}">+ Category</button>
        <button class="btn btn-primary" data-action="preset-8020" data-course="${course.id}">Preset 80/20</button>
        <button class="btn btn-danger" data-action="remove-course" data-course="${course.id}">Delete</button>
      </div>

      ${course.categories.map(cat=>renderCategory(course,cat)).join("")}
    </div>
  `;
  return header;
}

function renderCategory(course,cat){
  const avg = calcCategoryAvg(cat.items);
  return `
    <div class="card cat-card" data-category="${cat.id}">
      <div class="grid" style="grid-template-columns:1fr .6fr auto; gap:10px; align-items:end">
        <div>
          <label class="label">Category</label>
          <input class="input js-cat-name" data-course="${course.id}" data-category="${cat.id}" value="${esc(cat.name)}" />
        </div>
        <div>
          <label class="label">Weight %</label>
          <input type="number" step="any" class="input js-cat-weight" data-course="${course.id}" data-category="${cat.id}" value="${Math.round(cat.weight*1000)/10}" />
        </div>
        <div class="actions">
          <div class="badge">Avg: <span class="js-cat-avg" data-course="${course.id}" data-category="${cat.id}">${pct(avg)}</span></div>
          <button class="btn btn-danger" data-action="remove-category" data-course="${course.id}" data-category="${cat.id}">Remove</button>
        </div>
      </div>

      <div class="table-head"><div>Item</div><div>Earned</div><div>Possible</div><div>%</div><div></div></div>
      ${cat.items.map(it=>renderItem(course,cat,it)).join("")}
      <div style="margin-top:8px">
        <button class="btn btn-primary" data-action="add-item" data-course="${course.id}" data-category="${cat.id}">+ Grades</button>
      </div>
    </div>
  `;
}
function renderItem(course,cat,it){
  const frac = (it.possible>0)? it.earned/it.possible : null;
  return `
    <div class="row" data-item="${it.id}">
      <input class="input js-item-label" data-course="${course.id}" data-category="${cat.id}" data-item="${it.id}" value="${esc(it.label)}" />
      <input type="number" step="any" class="input js-item-earned" data-course="${course.id}" data-category="${cat.id}" data-item="${it.id}" value="${it.earned}" />
      <input type="number" step="any" class="input js-item-possible" data-course="${course.id}" data-category="${cat.id}" data-item="${it.id}" value="${it.possible}" />
      <div><span class="badge js-item-pct" data-course="${course.id}" data-category="${cat.id}" data-item="${it.id}">${pct(frac)}</span></div>
      <div class="actions">
        <button class="btn" data-action="item-full" data-course="${course.id}" data-category="${cat.id}" data-item="${it.id}">Full</button>
        <button class="btn" data-action="item-zero" data-course="${course.id}" data-category="${cat.id}" data-item="${it.id}">Zero</button>
        <button class="btn btn-danger" data-action="remove-item" data-course="${course.id}" data-category="${cat.id}" data-item="${it.id}">Delete</button>
      </div>
    </div>
  `;
}

// ========== Derived UI updater ==========
function refreshAllDerivedUI(){
  const c = state.courses.find(x => x.id === state.currentCourseId);
  if (!c) return;
  const courseGrade = calcCourseGrade(c);
  qsa(`.js-course-pct[data-course="${c.id}"]`).forEach(el=> el.textContent = pct(courseGrade));
  qsa(`.js-course-letter[data-course="${c.id}"]`).forEach(el=> el.textContent = letterFromPct(courseGrade));
  c.categories.forEach(cat=>{
    const avg = calcCategoryAvg(cat.items);
    qsa(`.js-cat-avg[data-course="${c.id}"][data-category="${cat.id}"]`).forEach(el=> el.textContent = pct(avg));
    cat.items.forEach(it=>{
      const frac = (it.possible>0)? it.earned/it.possible : null;
      qsa(`.js-item-pct[data-course="${c.id}"][data-category="${cat.id}"][data-item="${it.id}"]`).forEach(el=> el.textContent = pct(frac));
    });
  });
  updateWhatIfProjected();
}

function updateWhatIfProjected(){
  const course = state.courses.find(c=>c.id===whatIf.courseId);
  if(!course){ $wiProjected.textContent="—"; return; }
  const clone = JSON.parse(JSON.stringify(course));
  const cat = clone.categories.find(c=>c.id===whatIf.categoryId);
  if (cat && whatIf.possible>0){
    cat.items.push({ id:"whatif", label:"What-if", earned:Number(whatIf.earned)||0, possible:Number(whatIf.possible)||0 });
  }
  const g = calcCourseGrade(clone);
  $wiProjected.textContent = `${pct(g)} ${g==null?"":`(${letterFromPct(g)})`}`;
}

// ========== Events ==========
// Tabs: switch current course (show only that one)
$courseTabs.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-tab-course]");
  if (!btn) return;
  state.currentCourseId = btn.dataset.tabCourse;
  save();
  render(); // re-render tabs + single course
});

$courses.addEventListener("input",(e)=>{
  const t=e.target;
  const courseId=t.dataset.course, categoryId=t.dataset.category, itemId=t.dataset.item;
  const course = state.courses.find(c=>c.id===courseId);
  if(!course) return;

  if (t.classList.contains("js-course-name")) {
    course.name = t.value; save();
    // update tab label live
    renderCourseTabs();
    return;
  }
  if (t.classList.contains("js-cat-name")) {
    const cat=course.categories.find(cg=>cg.id===categoryId); if(cat) cat.name=t.value; save(); return;
  }
  if (t.classList.contains("js-cat-weight")) {
    const cat=course.categories.find(cg=>cg.id===categoryId); if(cat){ cat.weight = clamp(Number(t.value)/100,0,1); save(); refreshAllDerivedUI(); } return;
  }
  if (t.classList.contains("js-item-label")) {
    const cat=course.categories.find(cg=>cg.id===categoryId); const it=cat?.items.find(i=>i.id===itemId); if(it){ it.label=t.value; save(); } return;
  }
  if (t.classList.contains("js-item-earned") || t.classList.contains("js-item-possible")) {
    const cat=course.categories.find(cg=>cg.id===categoryId); const it=cat?.items.find(i=>i.id===itemId);
    if(it){
      if (t.classList.contains("js-item-earned")) it.earned = Number(t.value);
      else it.possible = Number(t.value);
      save(); refreshAllDerivedUI();
    }
    return;
  }
});

$courses.addEventListener("click",(e)=>{
  const btn = e.target.closest("button"); if(!btn) return;
  const action = btn.dataset.action; if(!action) return;
  const courseId=btn.dataset.course, categoryId=btn.dataset.category, itemId=btn.dataset.item;

  if (action==="remove-course") {
    // if deleting the current course, move selection
    const idx = state.courses.findIndex(c=>c.id===courseId);
    state.courses = state.courses.filter(c=>c.id!==courseId);
    if (state.currentCourseId === courseId) {
      const next = state.courses[idx] || state.courses[idx-1] || null;
      state.currentCourseId = next?.id || null;
    }
    save(); render(); return;
  }
  if (action==="add-category") {
    const c = state.courses.find(c=>c.id===courseId);
    c?.categories.push({ id:uid(), name:"New Category", weight:.5, items:[] });
    save(); render(); return;
  }
  if (action==="preset-8020") {
    const c = state.courses.find(c=>c.id===courseId);
    if (c) c.categories = [
      { id:uid(), name:"Assessments", weight:.8, items:[] },
      { id:uid(), name:"Classwork/Homework", weight:.2, items:[] },
    ];
    save(); render(); return;
  }
  if (action==="remove-category") {
    const c = state.courses.find(c=>c.id===courseId);
    if (c) c.categories = c.categories.filter(cg=>cg.id!==categoryId);
    save(); render(); return;
  }
  if (action==="add-item") {
    const c = state.courses.find(c=>c.id===courseId);
    const cat = c?.categories.find(cg=>cg.id===categoryId);
    cat?.items.push({ id:uid(), label:"New Item", earned:0, possible:0 });
    save(); render(); return;
  }
  if (action==="remove-item") {
    const c = state.courses.find(c=>c.id===courseId);
    const cat = c?.categories.find(cg=>cg.id===categoryId);
    if (cat) cat.items = cat.items.filter(i=>i.id!==itemId);
    save(); render(); return;
  }
  if (action==="item-full" || action==="item-zero") {
    const c = state.courses.find(c=>c.id===courseId);
    const cat = c?.categories.find(cg=>cg.id===categoryId);
    const it = cat?.items.find(i=>i.id===itemId);
    if (it){ it.earned = (action==="item-full") ? it.possible : 0; save(); refreshAllDerivedUI(); }
    return;
  }
});

// Add course / export / import
document.getElementById("addCourseBtn").addEventListener("click", ()=>{
  const newCourse = { id:uid(), name:"New Course", categories:[] };
  state.courses.push(newCourse);
  state.currentCourseId = newCourse.id; // auto-switch to the new one
  save(); render();
});
$export.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify({courses:state.courses, gradeCuts, currentCourseId: state.currentCourseId}, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download="grade-planner-data.json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
$import.addEventListener("change",(e)=>{
  const f=e.target.files?.[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const obj=JSON.parse(r.result);
      if (!obj || !Array.isArray(obj.courses)) throw new Error("bad");
      state.courses = obj.courses; if (obj.gradeCuts) gradeCuts = obj.gradeCuts;
      state.currentCourseId = obj.currentCourseId || obj.courses[0]?.id || null;
      // reset what-if defaults
      whatIf.courseId = state.courses[0]?.id || null;
      whatIf.categoryId = state.courses[0]?.categories[0]?.id || null;
      save(); render();
    }catch{ alert("Invalid JSON"); }
  };
  r.readAsText(f);
});

// What-if selectors
function renderWhatIfSelectors(){
  if (!whatIf.courseId && state.courses[0]) whatIf.courseId = state.courses[0].id;
  const course = state.courses.find(c=>c.id===whatIf.courseId);
  if (course && !whatIf.categoryId && course.categories[0]) whatIf.categoryId = course.categories[0].id;

  $wiCourse.innerHTML = state.courses.map(c=>`<option value="${c.id}" ${c.id===whatIf.courseId?"selected":""}>${esc(c.name)}</option>`).join("");
  const cats = course ? course.categories : [];
  $wiCategory.innerHTML = cats.map(cg=>`<option value="${cg.id}" ${cg.id===whatIf.categoryId?"selected":""}>${esc(cg.name)}</option>`).join("");
}
$wiCourse.addEventListener("change", ()=>{
  whatIf.courseId = $wiCourse.value;
  const c = state.courses.find(x=>x.id===whatIf.courseId);
  whatIf.categoryId = c?.categories[0]?.id || null;
  renderWhatIfSelectors();
  updateWhatIfProjected();
});
$wiCategory.addEventListener("change", ()=>{ whatIf.categoryId = $wiCategory.value; updateWhatIfProjected(); });
$wiEarned.addEventListener("input", ()=>{ whatIf.earned = Number($wiEarned.value)||0; updateWhatIfProjected(); });
$wiPossible.addEventListener("input", ()=>{ whatIf.possible = Math.max(0, Number($wiPossible.value)||0); updateWhatIfProjected(); });

// Settings modal/UI
$settingsBtn.addEventListener("click", ()=>{
  Object.entries(gradeCuts).forEach(([k,v])=>{ const el=$cut[k]; if(el) el.value = v; });
  $dlg.showModal();
});
$saveSettings.addEventListener("click",(e)=>{
  e.preventDefault();
  Object.keys(gradeCuts).forEach(k=>{ const v=Number($cut[k].value); if (!isNaN(v)) gradeCuts[k]=v; });
  save(); refreshAllDerivedUI(); $dlg.close();
});
$presetSimple.addEventListener("click", ()=>{
  gradeCuts = { A:90,Aminus:85,Bplus:80,B:75,Bminus:70,Cplus:65,C:60,Cminus:55,Dplus:50,D:45,Dminus:40 };
  Object.entries(gradeCuts).forEach(([k,v])=>{ const el=$cut[k]; if(el) el.value = v; });
});
$presetSimple.addEventListener("click", ()=>{
  gradeCuts = { A:90,Aminus:85,Bplus:80,B:75,Bminus:70,Cplus:65,C:60,Cminus:55,Dplus:50,D:45,Dminus:40 };
  Object.entries(gradeCuts).forEach(([k,v])=>{ const el=$cut[k]; if(el) el.value = v; });
});

// ========== Utils ==========
function esc(s){return String(s).replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]))}
function qsa(sel){return Array.from(document.querySelectorAll(sel));}

// ========== Init ==========
render();
