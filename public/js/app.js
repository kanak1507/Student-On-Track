(() => {
  const tokenKey = "studentOnTrack.token";
  const page = document.body.dataset.page;
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const token = () => localStorage.getItem(tokenKey);

  async function api(url, options={}) {
    const headers = {"Content-Type":"application/json", ...(options.headers||{})};
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(url, {...options, headers});
    if (res.status === 401) {
      localStorage.removeItem(tokenKey);
      if (page !== "signin" && page !== "home") location.href = "signin.html";
      throw new Error("Please sign in again.");
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function toast(message) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      Object.assign(el.style,{position:"fixed",right:"20px",bottom:"20px",background:"#202124",color:"#fff",padding:"11px 14px",borderRadius:"8px",zIndex:"99",fontSize:"14px",boxShadow:"0 8px 25px rgba(0,0,0,.18)"});
      document.body.appendChild(el);
    }
    el.textContent=message; el.hidden=false;
    clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.hidden=true,2200);
  }
  const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const date = s => s ? new Date(`${s}T00:00:00`).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "—";
  const days = s => s ? Math.round((new Date(`${s}T00:00:00`)-new Date(new Date().toISOString().slice(0,10)+"T00:00:00"))/86400000) : null;

  function guard() {
    const publicPage = page === "home" || page === "signin";
    if (!publicPage && !token()) { location.replace("signin.html"); return false; }
    if (page === "signin" && token()) { location.replace("dashboard.html"); return false; }
    return true;
  }

  function nav() {
    $$("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav===page));
    $("#signout")?.addEventListener("click",()=>{localStorage.removeItem(tokenKey);location.href="signin.html"});
  }

  async function authPage() {
    const signForm=$("#signForm"), registerForm=$("#registerForm");
    if (!signForm) return;
    const signTab=$("#signTab"), registerTab=$("#registerTab");
    const setMode=register=>{
      signForm.hidden=register; registerForm.hidden=!register;
      signTab.classList.toggle("active",!register); registerTab.classList.toggle("active",register);
    };
    signTab.onclick=()=>setMode(false); registerTab.onclick=()=>setMode(true);
    signForm.onsubmit=async e=>{
      e.preventDefault(); $("#signError").textContent="";
      try {
        const data=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:$("#signEmail").value.trim(),password:$("#signPassword").value})});
        localStorage.setItem(tokenKey,data.token);
        location.href="dashboard.html";
      } catch(err){$("#signError").textContent=err.message}
    };
    registerForm.onsubmit=async e=>{
      e.preventDefault(); $("#registerError").textContent="";
      if($("#regPassword").value!==$("#regConfirm").value){$("#registerError").textContent="Passwords do not match.";return}
      try {
        const data=await api("/api/auth/register",{method:"POST",body:JSON.stringify({email:$("#regEmail").value.trim(),password:$("#regPassword").value})});
        localStorage.setItem(tokenKey,data.token); location.href="dashboard.html";
      } catch(err){$("#registerError").textContent=err.message}
    };
  }

  async function dashboard() {
    if (!$("#dashboard")) return;
    try {
      const [me,s]=await Promise.all([api("/api/me"),api("/api/summary")]);
      $("#accountEmail").textContent=me.email;
      $("#aTotal").textContent=s.assignments.total;
      $("#aDone").textContent=s.assignments.completed;
      $("#aDue").textContent=s.assignments.due_soon;
      $("#aOver").textContent=s.assignments.overdue;
      $("#attAvg").textContent=`${s.attendance.average}%`;
      $("#attRisk").textContent=s.attendance.at_risk;
      $("#goalDone").textContent=s.goals.completed;
      $("#goalTotal").textContent=s.goals.total;
      const completion=s.assignments.total?Math.round(s.assignments.completed/s.assignments.total*100):0;
      $("#accountabilityBar").style.width=completion+"%";
      $("#accountabilityText").textContent=`${completion}% of your assignments completed`;
    } catch(err){toast(err.message)}
  }

  async function assignments() {
    const form=$("#assignmentForm"); if(!form) return;
    let items=[];
    const render=()=>{
      $("#aTotal").textContent=items.length;
      $("#aDone").textContent=items.filter(x=>x.completed).length;
      $("#aDue").textContent=items.filter(x=>!x.completed&&days(x.due_date)>=0&&days(x.due_date)<=7).length;
      $("#aOver").textContent=items.filter(x=>!x.completed&&days(x.due_date)<0).length;
      const list=$("#assignmentList");
      if(!items.length){list.innerHTML='<div class="empty">No assignments yet. Add your first one above.</div>';return}
      list.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Done</th><th>Assignment</th><th>Subject</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
        items.map(x=>{
          const d=days(x.due_date);
          let badge=x.completed?'<span class="badge badge-success">Completed</span>':d===null?'<span class="badge badge-neutral">No deadline</span>':d<0?'<span class="badge badge-danger">Overdue</span>':d===0?'<span class="badge badge-warning">Due today</span>':d<=7?'<span class="badge badge-warning">Due soon</span>':'<span class="badge badge-neutral">Open</span>';
          return `<tr><td><input class="checkbox" type="checkbox" data-toggle="${x.id}" ${x.completed?"checked":""}></td><td><strong>${esc(x.title)}</strong></td><td>${esc(x.subject)||"—"}</td><td>${date(x.due_date)}</td><td>${badge}</td><td><div class="actions"><button class="btn btn-small" data-edit="${x.id}">Edit</button><button class="btn btn-small btn-danger" data-delete="${x.id}">Delete</button></div></td></tr>`
        }).join("")
      }</tbody></table></div>`;
      $$("[data-toggle]").forEach(b=>b.onchange=async()=>{await update(b.dataset.toggle,{completed:b.checked})});
      $$("[data-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this assignment?")){await api(`/api/assignments/${b.dataset.delete}`,{method:"DELETE"});await load();toast("Assignment deleted")}});
      $$("[data-edit]").forEach(b=>b.onclick=async()=>{
        const x=items.find(v=>String(v.id)===String(b.dataset.edit)); if(!x)return;
        const title=prompt("Assignment title",x.title); if(title===null)return;
        const subject=prompt("Subject",x.subject||""); if(subject===null)return;
        const due=prompt("Due date (YYYY-MM-DD, leave blank for none)",x.due_date||""); if(due===null)return;
        await update(x.id,{title,subject,due_date:due}); 
      });
    };
    const load=async()=>{items=await api("/api/assignments");render()};
    const update=async(id,body)=>{await api(`/api/assignments/${id}`,{method:"PATCH",body:JSON.stringify(body)});await load();toast("Assignment updated")};
    form.onsubmit=async e=>{
      e.preventDefault();
      try{await api("/api/assignments",{method:"POST",body:JSON.stringify({title:$("#title").value,subject:$("#subject").value,due_date:$("#due").value||null})});form.reset();await load();toast("Assignment added")}catch(err){toast(err.message)}
    };
    $("#due").min=new Date().toISOString().slice(0,10);
    await load();
  }

  async function attendance() {
    const form=$("#attendanceForm"); if(!form)return;
    let items=[];
    const render=()=>{
      $("#subjects").textContent=items.length;
      const avg=items.length?Math.round(items.reduce((s,x)=>s+(x.total?x.attended/x.total*100:0),0)/items.length):0;
      $("#average").textContent=avg+"%";
      $("#risk").textContent=items.filter(x=>x.total&&x.attended/x.total<.75).length;
      const list=$("#attendanceList");
      if(!items.length){list.innerHTML='<div class="empty">No subjects yet. Add one to start tracking attendance.</div>';return}
      list.innerHTML=items.map(x=>{
        const p=x.total?Math.round(x.attended/x.total*100):0, risk=p<75;
        return `<div class="list-row"><div class="kpi-line"><div><strong>${esc(x.subject)}</strong><div class="subtle">${x.attended} attended · ${x.total} total</div></div><span class="badge ${risk?"badge-danger":"badge-success"}">${risk?"At risk":"Safe"}</span></div><div class="progress ${risk?"":"success"}"><span style="width:${Math.min(p,100)}%"></span></div><div class="kpi-line"><span class="subtle">${p}% attendance</span><div class="actions"><button class="btn btn-small" data-attend="${x.id}">Attend +1</button><button class="btn btn-small" data-absent="${x.id}">Absent +1</button><button class="btn btn-small" data-edit="${x.id}">Edit</button><button class="btn btn-small btn-danger" data-delete="${x.id}">Delete</button></div></div></div>`
      }).join("");
      $$("[data-attend]").forEach(b=>b.onclick=async()=>{await api(`/api/attendance/${b.dataset.attend}/attend`,{method:"POST"});await load();toast("Attendance recorded")});
      $$("[data-absent]").forEach(b=>b.onclick=async()=>{await api(`/api/attendance/${b.dataset.absent}/absent`,{method:"POST"});await load();toast("Absence recorded")});
      $$("[data-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this subject?")){await api(`/api/attendance/${b.dataset.delete}`,{method:"DELETE"});await load();toast("Subject deleted")}});
      $$("[data-edit]").forEach(b=>b.onclick=async()=>{const x=items.find(v=>String(v.id)===String(b.dataset.edit));const subject=prompt("Subject",x.subject);if(subject===null)return;const attended=prompt("Classes attended",x.attended);if(attended===null)return;const total=prompt("Total classes",x.total);if(total===null)return;await api(`/api/attendance/${x.id}`,{method:"PATCH",body:JSON.stringify({subject,attended:Number(attended),total:Number(total)})});await load();toast("Attendance updated")});
    };
    const load=async()=>{items=await api("/api/attendance");render()};
    form.onsubmit=async e=>{e.preventDefault();try{await api("/api/attendance",{method:"POST",body:JSON.stringify({subject:$("#attSubject").value,attended:Number($("#attended").value||0),total:Number($("#total").value||0)})});form.reset();await load();toast("Subject added")}catch(err){toast(err.message)}};
    await load();
  }

  async function goals() {
    const form=$("#goalForm");if(!form)return;
    let items=[];
    const render=()=>{
      $("#goalCount").textContent=items.filter(x=>!x.completed).length;
      const done=items.filter(x=>x.completed).length;$("#goalDone").textContent=done;
      const list=$("#goalList");
      if(!items.length){list.innerHTML='<div class="empty">No goals yet. Add a goal and start making progress.</div>';return}
      list.innerHTML=items.map(x=>{
        const p=Math.min(100,Math.round(Number(x.current)/Number(x.target)*100));
        return `<div class="list-row"><div class="kpi-line"><div><strong>${esc(x.title)}</strong><div class="subtle">${esc(x.category)||"Personal"} · ${x.current}/${x.target} ${esc(x.unit)||""}${x.deadline?" · Due "+date(x.deadline):""}</div></div><span class="badge ${x.completed?"badge-success":"badge-neutral"}">${x.completed?"Completed":p+"%"}</span></div><div class="progress ${x.completed?"success":""}"><span style="width:${p}%"></span></div><div class="actions"><button class="btn btn-small" data-plus="${x.id}" ${x.completed?"disabled":""}>+1</button><button class="btn btn-small" data-complete="${x.id}" ${x.completed?"disabled":""}>Complete</button><button class="btn btn-small" data-edit="${x.id}">Edit</button><button class="btn btn-small btn-danger" data-delete="${x.id}">Delete</button></div></div>`
      }).join("");
      $$("[data-plus]").forEach(b=>b.onclick=async()=>{const x=items.find(v=>String(v.id)===String(b.dataset.plus));const current=Math.min(Number(x.target),Number(x.current)+1);await saveGoal({...x,current,completed:current>=Number(x.target)});toast("Progress updated")});
      $$("[data-complete]").forEach(b=>b.onclick=async()=>{const x=items.find(v=>String(v.id)===String(b.dataset.complete));await saveGoal({...x,current:x.target,completed:true});toast("Goal completed")});
      $$("[data-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this goal?")){await api(`/api/goals/${b.dataset.delete}`,{method:"DELETE"});await load();toast("Goal deleted")}});
      $$("[data-edit]").forEach(b=>b.onclick=async()=>{const x=items.find(v=>String(v.id)===String(b.dataset.edit));if(!x)return;const title=prompt("Goal title",x.title);if(title===null)return;const target=prompt("Target",x.target);if(target===null)return;const current=prompt("Current progress",x.current);if(current===null)return;await saveGoal({...x,title,target:Number(target),current:Number(current),completed:Number(current)>=Number(target)});toast("Goal updated")});
    };
    const load=async()=>{items=await api("/api/goals");render()};
    const saveGoal=async x=>{await api(`/api/goals/${x.id}`,{method:"PATCH",body:JSON.stringify({title:x.title,category:x.category,unit:x.unit,target:Number(x.target),current:Number(x.current),deadline:x.deadline,completed:Boolean(x.completed)})});await load()};
    form.onsubmit=async e=>{e.preventDefault();try{await api("/api/goals",{method:"POST",body:JSON.stringify({title:$("#goalTitle").value,category:$("#goalCategory").value,unit:$("#goalUnit").value,target:Number($("#goalTarget").value),current:Number($("#goalCurrent").value||0),deadline:$("#goalDeadline").value||null})});form.reset();await load();toast("Goal added")}catch(err){toast(err.message)}};
    await load();
  }

  if(!guard()) return;
  nav();
  if(page==="signin") authPage();
  if(page==="dashboard") dashboard();
  if(page==="assignments") assignments();
  if(page==="attendance") attendance();
  if(page==="goals") goals();
})();
