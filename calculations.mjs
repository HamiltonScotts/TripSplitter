export function shares(e) {
  const weights = e.participants.map(n => Object.hasOwn(e.weights || {}, n) ? e.weights[n] : 1);
  const total = weights.reduce((a,b) => a+b,0);
  const raw = weights.map(w => e.amt*w/total);
  const amounts = raw.map(Math.floor);
  let remainder = e.amt-amounts.reduce((a,b)=>a+b,0);
  const order = raw.map((v,i)=>({i,f:v-amounts[i]})).sort((a,b)=>b.f-a.f || a.i-b.i);
  for(let i=0;i<remainder;i++) amounts[order[i].i]++;
  return e.participants.map((name,i)=>({name,amount:amounts[i]}));
}
export function totals(names, expenses) {
  const result = Object.fromEntries(names.map(n=>[n,{paid:0,used:0,balance:0}]));
  for(const e of expenses) {
    result[e.payer].paid += e.amt;
    for(const s of shares(e)) result[s.name].used += s.amount;
  }
  for(const v of Object.values(result)) v.balance=v.paid-v.used;
  return result;
}

function canonical(value) {
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export function sameTrip(a,b) {
  const content=t=>({names:t.names,expenses:t.expenses,groupName:t.groupName});
  return JSON.stringify(canonical(content(a)))===JSON.stringify(canonical(content(b)));
}
