import { totals, sameTrip } from './calculations.mjs?v=20261019-controls-1';
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function report(error) { console.error(error); $('status').textContent='操作を完了できませんでした。通信状態を確認して再試行してください。'+(error.message||''); }
let busy=0;
function updateDisabled() {
  // Keep navigation, history search and dialog close buttons usable during I/O.
  document.querySelectorAll('#calculator button,#calculator input,#calculator select,#setup button,#setup input,#menuPanel input,#addMemberSubmit,#changeGroupSubmit,#confirmDelete,#login,#logout,.history-open,.history-row .text-button,.history-remove').forEach(el=>el.disabled=busy>0);
  document.querySelectorAll('[data-group-only]').forEach(el=>el.hidden=!loadedId);
  if(!loadedId && tripId) document.querySelectorAll('#calculator button,#calculator input,#calculator select').forEach(el=>el.disabled=true);
}
async function run(action) {
  if(busy){$('status').textContent='処理が完了してから、もう一度お試しください。';return;}
  busy++; updateDisabled();
  try {await action();} catch(e){report(e);} finally{busy--;updateDisabled();}
}
function readLocal(key,fallback) {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function writeLocal(key,value) {try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function lastSplit() {
  return expenses.length ? expenses[expenses.length-1] : null;
}
function selectedMembers() {
  return [...document.querySelectorAll('.member-btn.active')].map(button=>button.textContent);
}
function updateSplitHint() {
  document.querySelectorAll('.member-btn').forEach(button=>button.setAttribute('aria-pressed',button.classList.contains('active')));
  const members=selectedMembers();
  const inputs=[...$('weights').querySelectorAll('input')];
  document.querySelectorAll('[data-ratio]').forEach(button=>{
    const [left,right]=button.dataset.ratio.split(':').map(Number);
    const ratio=$('splitMode').value==='equal'?1:inputs.length===2?Number(inputs[0].value)/Number(inputs[1].value):NaN;
    button.setAttribute('aria-pressed',members.length===2&&Math.abs(ratio-left/right)<1e-9);
  });
  $('splitHint').textContent=members.length
    ? ($('splitMode').value==='weighted'
      ? inputs.map(input=>input.dataset.name+'：'+input.value).join(' / ')
      : members.join('・')+'で均等に負担します。')
    : '割り勘メンバーを選んでください。';
  const amount=Number($('amount').value),weights=Object.fromEntries(inputs.map(input=>[input.dataset.name,Number(input.value)]));
  const validWeights=inputs.every(input=>Number.isFinite(Number(input.value))&&Number(input.value)>0);
  if(members.length&&Number.isSafeInteger(amount)&&amount>0&&validWeights){
    const stats=totals(names,[{amt:amount,participants:members,payer:members[0],weights}]);
    $('splitPreview').textContent=members.map(name=>name+' ¥'+stats[name].used.toLocaleString('ja-JP')).join(' / ');
  }else $('splitPreview').textContent='';
}

function renderWeights(saved={}) {
  const old=Object.fromEntries([...$('weights').querySelectorAll('input')].map(input=>[input.dataset.name,input.value]));
  const previous=lastSplit()?.weights||{};
  $('weights').replaceChildren();
  if($('splitMode').value==='weighted') for(const name of selectedMembers()) {
    const label=document.createElement('label'); label.append(document.createTextNode(name+' の比率'));
    const input=document.createElement('input'); input.type='number';input.min='0.01';input.step='any';
    input.value=Object.hasOwn(saved,name)?saved[name]:Object.hasOwn(old,name)?old[name]:Object.hasOwn(previous,name)?previous[name]:1;
    input.dataset.name=name; input.oninput=updateSplitHint;
    label.append(input);$('weights').append(label);
  }
  updateSplitHint();
}
function restoreSplit(silent=false) {
  const previous=lastSplit();
  if(!previous) {if(!silent)$('splitHint').textContent='経費を保存すると、次回からそのメンバーと比率を呼び出せます。';return;}
  document.querySelectorAll('.member-btn').forEach(button=>button.classList.toggle('active',previous.participants.includes(button.textContent)));
  $('splitMode').value=Object.keys(previous.weights||{}).length?'weighted':'equal';
  $('weights').replaceChildren(); renderWeights(previous.weights||{});
}
function applyPreset(left,right) {
  let members=selectedMembers();
  if(members.length!==2 && names.length===2) {
    document.querySelectorAll('.member-btn').forEach(button=>button.classList.add('active'));members=selectedMembers();
  }
  if(members.length!==2) {const message='この比率ボタンは2人用です。負担するメンバーを2人選んでください。';$('splitHint').textContent=message;$('status').textContent=message;return;}
  $('splitMode').value='weighted';
  renderWeights(Object.fromEntries([[members[0],left],[members[1],right]]));
  $('status').textContent=members[0]+' '+left+'：'+members[1]+' '+right+' を適用しました。';
}
function swapRatio() {
  const inputs=[...$('weights').querySelectorAll('input')];
  if($('splitMode').value!=='weighted'||inputs.length!==2) {$('splitHint').textContent='比率の入れ替えは、傾斜をつけるメンバーが2人のときに使えます。';return;}
  [inputs[0].value,inputs[1].value]=[inputs[1].value,inputs[0].value];updateSplitHint();
}
let cloudHistory=[], historyView='active', pendingDelete=null;
function historyRows() {
  const rows=auth?.currentUser&&!auth.currentUser.isAnonymous?cloudHistory:readLocal('recentTrips',[]);
  return [...rows].sort((a,b)=>(b.deletedAt||b.visitedAt)-(a.deletedAt||a.visitedAt));
}
function renderHistory() {
  $('history').replaceChildren();
  $('activeHistoryBtn').setAttribute('aria-pressed',historyView==='active');
  $('deletedHistoryBtn').setAttribute('aria-pressed',historyView==='deleted');
  const search=$('historySearch').value.trim().toLocaleLowerCase();
  const rows=historyRows().filter(row=>!!row.deletedAt===(historyView==='deleted')&&row.groupName.toLocaleLowerCase().includes(search));
  for(const row of rows) {
    const item=document.createElement('div');item.className='history-row';
    const open=document.createElement('button');open.className='history-open';
    const title=document.createElement('strong');title.textContent=row.groupName;
    const date=document.createElement('small');date.textContent=(row.deletedAt?'削除日 ':'最後に開いた日 ')+new Date(row.deletedAt||row.visitedAt).toLocaleDateString('ja-JP');
    open.append(title,date);open.onclick=()=>row.deletedAt?run(()=>restoreGroup(row)):openTrip(row.id);
    const action=document.createElement('button');action.className='text-button';action.textContent=row.deletedAt?'復元':'削除';action.setAttribute('aria-label',row.groupName+(row.deletedAt?'を復元':'を削除'));
    action.onclick=()=>row.deletedAt?run(()=>restoreGroup(row)):requestDelete(row);
    item.append(open,action);
    if(!row.deletedAt) {
      const remove=document.createElement('button');remove.className='history-remove';remove.textContent='履歴から外す';remove.setAttribute('aria-label',row.groupName+'を自分の履歴から外す');remove.onclick=()=>run(()=>forgetHistory(row.id));item.append(remove);
    }
    $('history').append(item);
  }
  if(!rows.length) {const empty=document.createElement('p');empty.className='empty-state';empty.textContent=search?'一致するグループがありません。':historyView==='deleted'?'削除したグループはありません。':'まだ精算履歴がありません。​共有URLを開くと、ここから選べるようになります。';$('history').append(empty);}
  updateDisabled();
}
async function persistHistory(row) {
  const user=auth.currentUser;
  writeLocal('recentTrips',[row,...readLocal('recentTrips',[]).filter(r=>r.id!==row.id)]);
  if(user&&!user.isAnonymous) {
    await api.setDoc(api.doc(db,'users',user.uid,'trips',row.id),row);
    if(auth.currentUser?.uid===user.uid) cloudHistory=[row,...cloudHistory.filter(r=>r.id!==row.id)];
  }
  renderHistory();
}
async function rememberTrip() {
  try {await persistHistory({id:tripId,groupName,visitedAt:Date.now(),deletedAt:0});}
  catch(error){$('status').textContent='精算は保存できましたが、アカウントの履歴を保存できませんでした。';console.error(error);}
}
async function loadHistory() {
  if(!auth?.currentUser||auth.currentUser.isAnonymous){cloudHistory=[];renderHistory();return;}
  const uid=auth.currentUser.uid;
  const result=await api.getDocs(api.collection(db,'users',uid,'trips'));
  if(auth.currentUser?.uid!==uid)return;
  cloudHistory=result.docs.map(doc=>doc.data());renderHistory();
}
async function forgetHistory(id) {
  await ready;
  if(auth.currentUser&&!auth.currentUser.isAnonymous) await api.deleteDoc(api.doc(db,'users',auth.currentUser.uid,'trips',id));
  writeLocal('recentTrips',readLocal('recentTrips',[]).filter(row=>row.id!==id));
  cloudHistory=cloudHistory.filter(row=>row.id!==id);renderHistory();
  $('status').textContent='自分の履歴から外しました。共有URLから再び開けます。';
}
function openDialog(id) {
  const dialog=$(id);if(dialog.open)return;
  dialog.returnFocus=document.activeElement;
  if(typeof dialog.showModal==='function')dialog.showModal();
  else {dialog.setAttribute('open','');dialog.dataset.fallback='true';document.body.classList.add('has-fallback-modal');dialog.querySelector('button,input')?.focus();}
}
function closeDialog(id) {
  const dialog=$(id);if(!dialog.open)return;
  if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
  delete dialog.dataset.fallback;
  if(!document.querySelector('dialog[data-fallback]'))document.body.classList.remove('has-fallback-modal');
  dialog.returnFocus?.focus();
}
function openTrip(id) {
  if(busy){$('status').textContent='処理が完了してからグループを切り替えてください。';return;}
  closeDialog('historyDialog');closeDialog('menuPanel');
  run(async()=>{tripId=id;history.replaceState(null,'','#'+id);await loadTrip(id);});
}
function showSetup(force=false) {
  if(busy&&force!==true){$('status').textContent='処理が完了してから新しいグループを作成してください。';return;}
  tripId=null;loadedId=null;confirmed=null;names=[];expenses=[];editingIndex=null;
  history.replaceState(null,'',location.pathname+location.search);
  ['historyDialog','menuPanel','deleteDialog'].forEach(closeDialog);
  $('calculator').style.display='none';$('setup').style.display='block';$('menuBtn').style.display='block';
  $('groupNameHeading').textContent='気持ちよく、割り勘。';
  $('heroDescription').innerHTML='一緒に過ごす時間を、もっとシンプルに。<br>旅も、食事も。お金のことは、ここでさっと。';
  $('status').textContent='';updateDisabled();
}
function requestDelete(row) {
  pendingDelete={id:row.id,groupName:row.groupName};
  closeDialog('menuPanel');closeDialog('historyDialog');
  $('deleteDescription').textContent='「'+row.groupName+'」を削除します。';openDialog('deleteDialog');
}
async function deleteGroup() {
  if(!pendingDelete)return;
  const row={...pendingDelete}, deletedAt=Date.now();
  await ready;
  await api.runTransaction(db,async transaction=>{
    const ref=api.doc(db,'trips',row.id),snapshot=await transaction.get(ref);
    if(!snapshot.exists())throw new Error('グループが見つかりません。');
    row.groupName=snapshot.data().groupName;
    transaction.set(ref,{deletedAt},{merge:true});
  });
  // A tombstone keeps all expenses recoverable; shared links respect it too.
  try {localStorage.removeItem('trip:'+row.id);}catch{}
  if(tripId===row.id)showSetup(true);else closeDialog('deleteDialog');
  pendingDelete=null;
  try {await persistHistory({...row,visitedAt:Date.now(),deletedAt});}
  catch(error){report(error);return;}
  historyView='deleted';renderHistory();$('status').textContent='グループを削除しました。「過去の精算」の削除済みから復元できます。';
}
async function restoreGroup(row) {
  await ready;
  let data;
  await api.runTransaction(db,async transaction=>{
    const ref=api.doc(db,'trips',row.id),snapshot=await transaction.get(ref);
    if(!snapshot.exists())throw new Error('グループが見つかりません。');
    data=snapshot.data();transaction.set(ref,{deletedAt:0},{merge:true});
  });
  await persistHistory({id:row.id,groupName:data.groupName,visitedAt:Date.now(),deletedAt:0});
  historyView='active';renderHistory();$('status').textContent='グループを復元しました。過去の精算から開けます。';
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
        showSetup();
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
      $('restoreSplit').onclick=()=>restoreSplit();
      document.querySelectorAll('[data-ratio]').forEach(button=>button.onclick=()=>applyPreset(...button.dataset.ratio.split(':').map(Number)));
      $('swapRatio').onclick=swapRatio;
      $('expenseOrder').onchange=renderExpenses;
      $('historyBtn').onclick=()=>{renderHistory();openDialog('historyDialog');};
      $('activeHistoryBtn').onclick=()=>{historyView='active';renderHistory();};
      $('deletedHistoryBtn').onclick=()=>{historyView='deleted';renderHistory();};
      $('historySearch').oninput=renderHistory;
      $('createFromHistory').onclick=showSetup;
      document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>closeDialog(button.dataset.close));
      $('deleteGroupBtn').onclick=()=>requestDelete({id:tripId,groupName});
      $('confirmDelete').onclick=()=>run(deleteGroup);
      $('cancelDelete').onclick=()=>{pendingDelete=null;closeDialog('deleteDialog');};
      $('shareBtn').onclick=()=>run(async()=>{await navigator.clipboard.writeText(location.href);$('status').textContent='共有リンクをコピーしました。';});
      $('cancelEdit').onclick=()=>{editingIndex=null;$('description').value='';$('amount').value='';$('addExpense').textContent='経費を追加';$('entryTitle').textContent='経費を追加';$('cancelEdit').hidden=true;restoreSplit(true);};
      $('amount').addEventListener('input',updateSplitHint);
      document.addEventListener('keydown',event=>{
        const dialog=document.querySelector('dialog[data-fallback][open]');if(!dialog)return;
        if(event.key==='Escape'){event.preventDefault();closeDialog(dialog.id);}
        if(event.key==='Tab'){
          const focusable=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(el=>!el.hidden);
          const first=focusable[0],last=focusable[focusable.length-1];
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        }
      });
      createNameFields();
      window.addEventListener('hashchange',()=>{
        if(busy){location.reload();return;}
        tripId=location.hash.slice(1)||null;
        if(tripId)run(()=>loadTrip(tripId));
        else showSetup();
      });
      const hash = location.hash.slice(1);
      if (hash) { tripId = hash; run(()=>loadTrip(hash)); }
      renderHistory();
    }

    function toggleMenu() {
      if($('menuPanel').open)closeDialog('menuPanel');else openDialog('menuPanel');
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
        div.innerHTML = `<label for="member-${i}">参加者 ${i+1}</label><input id="member-${i}" class="participantName" placeholder="名前を入力" maxlength="100"/>`;
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
      $('heroDescription').textContent='一緒に使ったお金を、気持ちよく。';
      $('cancelEdit').hidden=true;$('entryTitle').textContent='経費を追加';
      editingIndex=null; $('addExpense').textContent='経費を追加';
      $('description').value=''; $('amount').value='';
      $('splitMode').value='equal';$('weights').replaceChildren();
      refreshMembers(); renderWeights(); restoreSplit(true);
      renderExpenses();
      renderSummary(); updateDisabled();
    }

    async function loadTrip(id) {
      loadedId=null; confirmed=null;
      const cached=readLocal('trip:'+id,null);
      const apply=data=>{names=data.names;expenses=data.expenses;groupName=data.groupName;enterCalculator();};
      if(cached&&!cached.deletedAt) apply(cached);
      else $('calculator').style.display='none';
      $('status').textContent=cached?'保存済みの内容を表示中・最新情報を確認しています':'読み込み中…';
      await ready;
      const snapshot=await api.getDoc(api.doc(db,'trips',id));
      if(id!==tripId) return;
      if(!snapshot.exists()) throw new Error('精算が見つかりません。URLを確認してください。');
      const data=snapshot.data();
      if(data.deletedAt) {
        showSetup(true);
        try {localStorage.removeItem('trip:'+id);}catch{}
        await persistHistory({id,groupName:data.groupName,visitedAt:Date.now(),deletedAt:data.deletedAt});
        $('status').textContent='このグループは削除されています。「過去の精算」→「削除済み」から復元できます。';return;
      }
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
          if(creating ? current.exists() : !current.exists() || !!current.data().deletedAt || !sameTrip(current.data(),baseline)) {
            throw new Error('ほかのメンバーが更新しました。ページを再読み込みしてから入力し直してください。');
          }
          transaction.set(ref,data,{merge:true});
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
        btn.className = 'member-btn';btn.setAttribute('aria-pressed','false');
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
      editingIndex=null; $('addExpense').textContent='経費を追加';$('entryTitle').textContent='経費を追加';$('cancelEdit').hidden=true;
      renderExpenses();
      renderSummary();
      document.getElementById('description').value = '';
      document.getElementById('amount').value = '';
      updateSplitHint();
    }

    function renderExpenses() {
      const el = document.getElementById('expensesList');
      if (!expenses.length) { el.innerHTML='<p class="empty-state">まだ経費がありません。<br>最初の思い出を、ひとつ追加しましょう。</p>'; return; }
      el.innerHTML = '<ul class="expense-list">' +
        expenses.map((e,i)=>({e,i})).sort((a,b)=>($('expenseOrder').value==='newest'?-1:1)*((a.e.createdAt??a.i)-(b.e.createdAt??b.i)||a.i-b.i)).map(({e,i}) =>
          `<li class="expense-item">
             <div><div class="expense-title"><strong>${escapeHtml(e.desc)}</strong><span>¥${Number(e.amt).toLocaleString('ja-JP')}</span></div><small>${escapeHtml(e.payer)} が立替 · ${e.participants.map(n=>escapeHtml(n)+(Object.hasOwn(e.weights||{},n)?' ×'+escapeHtml(e.weights[n]):'')).join(' / ')}</small></div>
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
          $('entryTitle').textContent='経費を編集';$('cancelEdit').hidden=false;
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
      $('totalAmount').textContent='¥'+expenses.reduce((total,expense)=>total+expense.amt,0).toLocaleString('ja-JP');
      $('groupMeta').textContent=names.length+'人 · '+expenses.length+'件の経費';
      const stats=totals(names,expenses);
      $('memberTotals').innerHTML='<table><thead><tr><th>名前</th><th>立替額</th><th>負担額</th></tr></thead><tbody>'+names.map(n=>`<tr><td>${escapeHtml(n)}</td><td>¥${stats[n].paid.toLocaleString()}</td><td>¥${stats[n].used.toLocaleString()}</td></tr>`).join('')+'</tbody></table>';
      const bal=Object.fromEntries(names.map(n=>[n,stats[n].balance]));
      const debt = Object.entries(bal).filter(([,v])=>v<0).map(([n,v])=>({n,amt:-v}));
      const cred = Object.entries(bal).filter(([,v])=>v>0).map(([n,v])=>({n,amt:v}));
      const lines=[]; let i=0,j=0;
      while(i<debt.length && j<cred.length) {
        const d=debt[i], c=cred[j], x=Math.min(d.amt,c.amt);
        lines.push(`${d.n} → ${c.n} : ¥${x.toLocaleString('ja-JP')}`);
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
