import { totals, sameTrip } from './calculations.mjs';
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function report(error) { console.error(error); $('status').textContent='操作を完了できませんでした。通信状態を確認して再試行してください。'+(error.message||''); }
let busy=0;
function updateDisabled() {
  document.querySelectorAll('button,input,select').forEach(el=>el.disabled=busy>0);
  if(!loadedId && tripId) document.querySelectorAll('#calculator button,#calculator input,#calculator select,#addMemberSubmit,#changeGroupSubmit').forEach(el=>el.disabled=true);
}
async function run(action) {
  busy++; updateDisabled();
  try {await action();} catch(e){report(e);} finally{busy--;updateDisabled();}
}
function readLocal(key,fallback) {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function writeLocal(key,value) {try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function renderWeights(saved={}) {
 const old=Object.fromEntries([...$('weights').querySelectorAll('input')].map(i=>[i.dataset.name,i.value]));
 $('weights').replaceChildren(); if($('splitMode').value!=='weighted') return;
 for(const b of document.querySelectorAll('.member-btn.active')) {const label=document.createElement('label');label.append(document.createTextNode(b.textContent+' の比率'));const input=document.createElement('input');input.type='number';input.min='0.01';input.step='any';input.value=(Object.hasOwn(saved,b.textContent)?saved[b.textContent]:old[b.textContent])??1;input.dataset.name=b.textContent;label.append(input);$('weights').append(label);}
}
let cloudHistory=[];
function renderHistory() {
 const local=readLocal('recentTrips',[]);
 const rows=auth?.currentUser&&!auth.currentUser.isAnonymous?cloudHistory:local;
 $('history').replaceChildren();
 for(const row of [...rows].sort((a,b)=>b.visitedAt-a.visitedAt)) {const button=document.createElement('button');button.textContent=row.groupName;button.onclick=()=>{if(tripId===row.id)run(()=>loadTrip(row.id));else location.hash=row.id;};$('history').append(button);}
 if(!rows.length) $('history').textContent='開いた精算がここに表示されます。';
}
async function rememberTrip() {
 const row={id:tripId,groupName,visitedAt:Date.now()}; const user=auth.currentUser;
 writeLocal('recentTrips',[row,...readLocal('recentTrips',[]).filter(r=>r.id!==tripId)]);renderHistory();
 if(user&&!user.isAnonymous) {
  try {await api.setDoc(api.doc(db,'users',user.uid,'trips',row.id),row);if(auth.currentUser?.uid===user.uid){cloudHistory=[row,...cloudHistory.filter(r=>r.id!==row.id)];renderHistory();}}
  catch(error){$('status').textContent='精算は読み込み・保存できましたが、アカウントの履歴を保存できませんでした。';console.error(error);}
 }
}
async function loadHistory() {
 if(!auth?.currentUser||auth.currentUser.isAnonymous){cloudHistory=[];renderHistory();return;}
 const uid=auth.currentUser.uid;
 const result=await api.getDocs(api.collection(db,'users',uid,'trips'));
 if(auth.currentUser?.uid!==uid)return;
 cloudHistory=result.docs.map(d=>d.data());renderHistory();
}
    const firebaseConfig = {
      apiKey: "AIzaSyAHwWw5a1Ne6BEumceByfhARsP93qOigUk",
      authDomain: "tripsplitterfirebase.firebaseapp.com",
      projectId: "tripsplitterfirebase",
      storageBucket: "tripsplitterfirebase.appspot.com",
      messagingSenderId: "154664469902",
      appId: "1:154664469902:web:10107c5674219503c110df",
      measurementId: "G-3XSDN3GH1B"
    };
    let db, auth, api, authApi;
    const ready = (async () => {
      const [appApi, firestore, authentication] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-lite.js'),
        import('https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js')
      ]);
      api=firestore; authApi=authentication;
      const app=appApi.initializeApp(firebaseConfig); db=api.getFirestore(app); auth=authApi.getAuth(app);
      await new Promise(resolve => { const stop=authApi.onAuthStateChanged(auth,()=>{stop();resolve();}); });
      if(!auth.currentUser) await authApi.signInAnonymously(auth);
      authApi.onAuthStateChanged(auth, user => {
        $('login').hidden=!!user && !user.isAnonymous;
        $('logout').hidden=!user || user.isAnonymous;
        $('accountName').textContent=user?.isAnonymous ? '' : user?.displayName || '';
        loadHistory().catch(report);
      });
    })();
    ready.catch(report);

    const generateId = () => crypto.randomUUID().replaceAll('-','');
    let tripId = null, loadedId=null, confirmed=null, names = [], expenses = [], groupName = '', editingIndex = null;

    { 
      document.getElementById('menuBtn').addEventListener('click', toggleMenu);
      document.getElementById('addMemberBtn').addEventListener('click', () => showForm('addMemberForm'));
      document.getElementById('addMemberSubmit').addEventListener('click', () => run(addMember));
      document.getElementById('changeGroupBtn').addEventListener('click', () => showForm('changeGroupForm'));
      document.getElementById('changeGroupSubmit').addEventListener('click', () => run(changeGroup));
      document.getElementById('newGroupBtn').addEventListener('click', () => showForm('goToSetupForm'));
      document.getElementById('goToSetupBtn').addEventListener('click', () => {
        const url = `${location.origin}${location.pathname}`;
        window.open(url, '_blank');
        toggleMenu();
      });
      document.getElementById('numParticipants').addEventListener('change', createNameFields);
      document.getElementById('initTrip').addEventListener('click', () => run(initTrip));
      document.getElementById('addExpense').addEventListener('click', () => run(addOrUpdateExpense));
      $('login').onclick=()=>run(async()=>{
        await ready;
        const provider=new authApi.GoogleAuthProvider();
        if(auth.currentUser?.isAnonymous) {
          try { await authApi.linkWithPopup(auth.currentUser,provider); }
          catch(error) { if(error.code==='auth/credential-already-in-use') await authApi.signInWithCredential(auth,authApi.GoogleAuthProvider.credentialFromError(error)); else throw error; }
        } else await authApi.signInWithPopup(auth,provider);
        if(tripId) await rememberTrip();
        await loadHistory();
      });
      $('logout').onclick=()=>run(async()=>{await ready;await authApi.signOut(auth);await authApi.signInAnonymously(auth);});
      $('splitMode').onchange=()=>renderWeights();
      $('expenseOrder').onchange=renderExpenses;
      window.addEventListener('hashchange',()=>{
        if(busy){location.reload();return;}
        tripId=location.hash.slice(1)||null;
        if(tripId)run(()=>loadTrip(tripId));
        else {loadedId=null;confirmed=null;$('calculator').style.display='none';$('setup').style.display='block';$('menuBtn').style.display='none';$('groupNameHeading').textContent='旅行割り勘計算機';}
      });
      const hash = location.hash.slice(1);
      if (hash) { tripId = hash; run(()=>loadTrip(hash)); }
      renderHistory();
    }

    function toggleMenu() {
      const panel = document.getElementById('menuPanel');
      const btn = document.getElementById('menuBtn');
      const isOpen = panel.classList.toggle('open');
      btn.textContent = isOpen ? '✕' : '☰';
    }

    function showForm(id) {
      ['addMemberForm','changeGroupForm','goToSetupForm'].forEach(mid => {
        document.getElementById(mid).style.display = 'none';
      });
      document.getElementById(id).style.display = 'block';
    }

    async function addMember() {
      const input = document.getElementById('newMemberName');
      const name = input.value.trim();
      if (!name) return;
      if(names.includes(name)) throw new Error('同じ名前のメンバーがいます');
      names.push(name);
      await saveData();
      refreshMembers(); renderWeights(); renderSummary();
      resetButton('addMemberSubmit');
      input.value = '';
    }

    async function changeGroup() {
      const input = document.getElementById('newGroupName');
      const name = input.value.trim();
      if (!name) return;
      groupName = name;
      document.getElementById('groupNameHeading').textContent = groupName;
      await saveData();
      resetButton('changeGroupSubmit');
      input.value = '';
    }

    function resetButton(id) {
      const btn = document.getElementById(id);
      const orig = btn.textContent;
      btn.textContent = orig.includes('完了') ? orig : `${orig}完了`;
      setTimeout(() => btn.textContent = orig, 2000);
    }

    function createNameFields() {
      const n = Math.min(100,Math.max(2,Math.floor(Number(document.getElementById('numParticipants').value)||2)));
      $('numParticipants').value=n;
      const container = document.getElementById('nameFields');
      container.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const div = document.createElement('div');
        div.className = 'field';
        div.innerHTML = `<label>参加者${i+1}</label><input class=\"participantName\" placeholder=\"名前を入力\"/>`;
        container.appendChild(div);
      }
    }

    async function initTrip() {
      names = Array.from(document.querySelectorAll('.participantName'))
        .map(el => el.value.trim())
        .filter(v => v);
      groupName = document.getElementById('groupNameInput').value.trim() || '旅行割り勘';
      if (names.length < 2) {
        alert('名前を2人以上入力してください');
        return;
      }
      if(new Set(names).size!==names.length) throw new Error('メンバー名は重複しないようにしてください');
      expenses=[]; editingIndex=null;
      tripId = generateId(); loadedId=null; confirmed=null;
      await saveData(true);
      enterCalculator();
    }

    function enterCalculator() {
      document.getElementById('menuBtn').style.display = 'block';
      document.getElementById('setup').style.display = 'none';
      document.getElementById('calculator').style.display = 'block';
      document.getElementById('groupNameHeading').textContent = groupName;
      editingIndex=null; $('addExpense').textContent='経費を追加';
      $('description').value=''; $('amount').value='';
      refreshMembers(); renderWeights();
      renderExpenses();
      renderSummary(); updateDisabled();
    }

    async function loadTrip(id) {
      loadedId=null; confirmed=null;
      const cached=readLocal('trip:'+id,null);
      const apply=data=>{names=data.names;expenses=data.expenses;groupName=data.groupName;enterCalculator();};
      if(cached) apply(cached);
      else $('calculator').style.display='none';
      $('status').textContent=cached?'保存済みの内容を表示中・最新情報を確認しています':'読み込み中…';
      await ready;
      const snapshot=await api.getDoc(api.doc(db,'trips',id));
      if(id!==tripId) return;
      if(!snapshot.exists()) throw new Error('精算が見つかりません。URLを確認してください。');
      const data=snapshot.data();
      confirmed=structuredClone(data); loadedId=id;
      apply(data); writeLocal('trip:'+id,data);
      $('status').textContent=''; await rememberTrip();
    }
    async function saveData(creating=false) {
      await ready;
      if(!creating && loadedId!==tripId) throw new Error('精算の読み込みが完了していません。ページを再読み込みしてください。');
      const id=tripId, baseline=confirmed;
      const data=structuredClone({names,expenses,groupName});
      try {
        await api.runTransaction(db,async transaction=>{
          const ref=api.doc(db,'trips',id), current=await transaction.get(ref);
          if(creating ? current.exists() : !current.exists() || !sameTrip(current.data(),baseline)) {
            throw new Error('ほかのメンバーが更新しました。ページを再読み込みしてから入力し直してください。');
          }
          transaction.set(ref,data);
        });
      } catch(error) {
        if(baseline){names=structuredClone(baseline.names);expenses=structuredClone(baseline.expenses);groupName=baseline.groupName;$('groupNameHeading').textContent=groupName;}
        throw error;
      }
      confirmed=structuredClone(data);loadedId=id;
      writeLocal('trip:'+id,data);
      history.replaceState(null,'','#'+id);
      $('status').textContent='保存しました';
      await rememberTrip();
    }

    function refreshMembers() {
      const box = document.getElementById('memberCheckboxes');
      box.innerHTML = '';
      names.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'member-btn';
        btn.textContent = name;
        btn.addEventListener('click', () => {btn.classList.toggle('active');renderWeights();});
        box.appendChild(btn);
      });
      const sel = document.getElementById('payerSelect');
      sel.innerHTML = '<option value="">--選択--</option>';
      names.forEach(name => {
        const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
        sel.appendChild(opt);
      });
    }

    async function addOrUpdateExpense() {
      const desc = document.getElementById('description').value.trim();
      const amt  = parseFloat(document.getElementById('amount').value);
      const parts = Array.from(document.querySelectorAll('.member-btn.active'))
        .map(btn => btn.textContent);
      const payer = document.getElementById('payerSelect').value;
      if (!desc || isNaN(amt) || amt<=0 || parts.length===0 || !payer) {
        alert('入力項目をすべて埋めてください');
        return;
      }
      if(!Number.isSafeInteger(amt)) throw new Error('金額は1円単位の整数で入力してください');
      const weights={};
      if($('splitMode').value==='weighted') for(const n of parts) {
        const value=Number([...$('weights').querySelectorAll('input')].find(input=>input.dataset.name===n)?.value);
        if(!Number.isFinite(value)||value<=0||value>1000000) throw new Error('比率は0より大きく100万以下で入力してください');
        Object.defineProperty(weights,n,{value,enumerable:true,configurable:true,writable:true});
      }
      const previous=editingIndex===null?null:expenses[editingIndex];
      const record={desc,amt,participants:parts,payer,weights,createdAt:previous ? previous.createdAt??editingIndex : Date.now()};
      if (editingIndex!==null) {
        expenses[editingIndex] = record;

      } else {
        expenses.push(record);
      }
      await saveData();
      editingIndex=null; $('addExpense').textContent='経費を追加';
      renderExpenses();
      renderSummary();
      document.getElementById('description').value = '';
      document.getElementById('amount').value = '';
    }

    function renderExpenses() {
      const el = document.getElementById('expensesList');
      if (!expenses.length) { el.textContent=''; return; }
      el.innerHTML = '<ul class="expense-list">' +
        expenses.map((e,i)=>({e,i})).sort((a,b)=>($('expenseOrder').value==='newest'?-1:1)*((a.e.createdAt??a.i)-(b.e.createdAt??b.i)||a.i-b.i)).map(({e,i}) =>
          `<li class="expense-item">
             <div>${i+1}. ${escapeHtml(e.desc)} - ¥${e.amt}<br><small>支払:${escapeHtml(e.payer)}, 割り勘:${e.participants.map(n=>escapeHtml(n)+(Object.hasOwn(e.weights||{},n)?' ×'+escapeHtml(e.weights[n]):'')).join(',')}</small></div>
             <button class="edit-btn" data-index="${i}">編集</button>
           </li>`
        ).join('') + '</ul>';
      bindEditButtons();
    }

    function bindEditButtons() {
      document.querySelectorAll('.edit-btn').forEach(btn =>
        btn.addEventListener('click', ()=>{
          const i = Number(btn.dataset.index), e = expenses[i];
          editingIndex = i;
          $('splitMode').value=Object.keys(e.weights||{}).length?'weighted':'equal';
          document.getElementById('description').value = e.desc;
          document.getElementById('amount').value = e.amt;
          document.querySelectorAll('.member-btn').forEach(b =>
            b.classList.toggle('active', e.participants.includes(b.textContent)));
          renderWeights(e.weights);
          document.getElementById('payerSelect').value = e.payer;
          document.getElementById('addExpense').textContent = '更新';
        })
      );
    }

    function renderSummary() {
      const stats=totals(names,expenses);
      $('memberTotals').innerHTML='<table><thead><tr><th>名前</th><th>立替額</th><th>負担額</th></tr></thead><tbody>'+names.map(n=>`<tr><td>${escapeHtml(n)}</td><td>¥${stats[n].paid.toLocaleString()}</td><td>¥${stats[n].used.toLocaleString()}</td></tr>`).join('')+'</tbody></table>';
      const bal=Object.fromEntries(names.map(n=>[n,stats[n].balance]));
      const debt = Object.entries(bal).filter(([,v])=>v<0).map(([n,v])=>({n,amt:-v}));
      const cred = Object.entries(bal).filter(([,v])=>v>0).map(([n,v])=>({n,amt:v}));
      const lines=[]; let i=0,j=0;
      while(i<debt.length && j<cred.length) {
        const d=debt[i], c=cred[j], x=Math.min(d.amt,c.amt);
        lines.push(`${d.n} → ${c.n} : ¥${x}`);
        d.amt-=x; c.amt-=x;
        if(d.amt===0) i++; if(c.amt===0) j++;
      }
      const summaryDiv = document.getElementById('summary');
      if(!lines.length) {
        summaryDiv.innerHTML = '<div class="summary-item"><div>精算不要です</div></div>';
        return;
      }
      summaryDiv.innerHTML = '<ul class="summary-list">' +
        lines.map(l => `<li class="summary-item"><div>${escapeHtml(l)}</div></li>`).join('') +
      '</ul>';
    }
