export const UNASSIGNED = 'unassigned';
export const groups = ['income','expense','transfer','adjustment'];
export const categories = ['Food','Transport','Rent','Bills','Shopping','Business','Salary','Gifts','Savings','Education','Health','Transaction Charges','Other'];
export function cents(value) {
 if (!/^-?\d+(?:\.\d{1,2})?$/.test(String(value))) throw Error('Use an amount with up to two decimal places.');
 const n = Math.round(Number(value)*100);
 if (!Number.isSafeInteger(n) || Math.abs(n)>100000000000) throw Error('Amount is too large.');
 return n;
}
export function accounts(records) { return [{id:UNASSIGNED,description:'Unassigned (existing records)',opening:0,kind:'custom'},...records.filter(x=>x.type==='account'&&!x.deleted).sort((a,b)=>(a.position||0)-(b.position||0)||a.description.localeCompare(b.description))]; }
export function balance(records,id,through='9999-99-99T99:99') {
 let sum=accounts(records).find(a=>a.id===id)?.opening||0;
 for(const x of records) {
  if(x.deleted||!groups.includes(x.type)||`${x.date}T${x.time||'00:00'}`>through) continue;
  if((x.accountId||UNASSIGNED)===id) sum+=(['income','adjustment'].includes(x.type)?x.cents:-x.cents)-(x.fee||0);
  if(x.type==='transfer'&&x.toAccountId===id) sum+=x.cents;
 }
 return sum;
}
export function needsReview(x) { return groups.includes(x.type)&&x.type!=='adjustment'&&(!x.category||!x.accountId||x.accountId===UNASSIGNED||x.review); }
export function totals(records) {
 const t={income:0,expense:0,transfer:0,fees:0,review:0};
 for(const x of records.filter(x=>!x.deleted&&groups.includes(x.type))) { if(x.type!=='adjustment') t[x.type]+=x.cents; t.fees+=x.fee||0; if(needsReview(x)) t.review++; }
 t.expense+=t.fees; return t;
}
export function duplicate(c,records) {return records.find(x=>!x.deleted&&groups.includes(x.type)&&(!c.id||x.id!==c.id)&&((c.reference&&x.reference&&c.reference.toUpperCase()===x.reference.toUpperCase()&&(!c.provider||!x.provider||c.provider===x.provider))||(c.source&&c.source===x.source)||(x.linkedMessages||[]).some(m=>(c.source&&m.source===c.source)||(c.reference&&m.reference===c.reference&&c.provider===m.provider))));}
export function transferMatches(c,records) {return records.filter(x=>!x.deleted&&(!c.id||x.id!==c.id)&&x.type==='transfer'&&x.cents===c.cents&&x.date===c.date&&[x.accountId,x.toAccountId].includes(c.accountId));}
export function parseMessage(raw,wallets=[]) {
 const text=raw.replace(/\s+/g,' ').trim();
 if(!/(confirmed|received|sent|paid|withdraw|deposit|credited|debited|transferred|purchase)/i.test(text)) return null;
 const currency='(?:Kshs?\\.?|KES|USD|UGX|TZS)\\s*', amount='(\\d[\\d,]*(?:\\.\\d{1,2})?)';
 const values=[...text.matchAll(new RegExp(currency+amount,'gi'))]; if(!values.length) return null;
 const cv=s=>cents(s.replace(/,/g,''));
 const feeMatch=text.match(new RegExp('(?:transaction (?:cost|charge)|charges?|fees?)\\s*[:,=]?\\s*(?:'+currency+')?'+amount,'i'));
 const bm=text.match(new RegExp('(?:new\\s+)?(?:M-PESA\\s+|account\\s+|available\\s+)?balance(?:\\s+is)?\\s*[:,=]?\\s*'+currency+amount,'i'));
 const principal=values.find(m=>!/(?:balance(?:\s+is)?|cost|charge|fee|deduction|total debited)\s*[:=]?\s*$/i.test(text.slice(Math.max(0,m.index-28),m.index)));
 const deduction=text.match(new RegExp('total (?:deduction|debited)\\s*[:,=]?\\s*'+currency+amount,'i'));
 if(!principal&&!deduction) return null;
 const fee=feeMatch?cv(feeMatch[1]):0, value=principal?cv(principal[1]):cv(deduction[1])-fee; if(value<=0)return null;
 const provider=/m-pesa|mpesa/i.test(text)?'mpesa':/airtel/i.test(text)?'airtel':'bank';
 const matched=wallets.filter(a=>!a.archived&&(a.kind===provider||(a.description.length>2&&text.toLowerCase().includes(a.description.toLowerCase()))));
 const d=text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/), iso=text.match(/\b\d{4}-\d{2}-\d{2}\b/);
 let date=iso?.[0]||(d?`${d[3].length===2?'20'+d[3]:d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`:'');
 if(date&&(Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))date='';
 const tm=text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
 const hour=tm?Number(tm[1])%(tm[3]?12:24)+(/pm/i.test(tm[3]||'')?12:0):0;
 const time=tm?`${String(hour).padStart(2,'0')}:${tm[2]}`:'';
 const reference=text.match(/^([A-Z0-9]{6,30})\s+confirmed/i)?.[1]||text.match(/(?:ref(?:erence)?|transaction id)\s*[:#]?\s*([A-Z0-9-]{5,40})/i)?.[1]||'';
 const party=text.match(/(?:received from|sent to|paid to|from|to)\s+(.+?)(?=\s+(?:on|at|New|Your|with|transaction)\b|\.|$)/i)?.[1]?.slice(0,100)||'';
 const type=/withdraw|transfer(?:red)?\s+(?:to|from)/i.test(text)?'transfer':/received|credited|deposit/i.test(text)?'income':'expense';
 return {type,cents:value,fee,date,time,reference,provider,description:party,counterparty:party,accountId:matched.length===1?matched[0].id:'',toAccountId:'',category:'',source:text,reportedBalance:bm?cv(bm[1]):null,review:!date,feeConfirmed:!!feeMatch};
}

export function reportTotals(records, filters = {}) {
 const selected=records.filter(x=>!x.deleted&&groups.includes(x.type)&&(!filters.account||(x.accountId||UNASSIGNED)===filters.account||x.toAccountId===filters.account)&&(!filters.from||x.date>=filters.from)&&(!filters.to||x.date<=filters.to)&&(!filters.group||filters.group==='all'||x.type===filters.group||(filters.group==='expense'&&x.fee>0)||(filters.group==='review'&&needsReview(x))));
 return totals(selected.filter(x=>!filters.category||x.category===filters.category||(filters.category==='Transaction Charges'&&x.fee>0)).map(x=>({...x,type:filters.group==='expense'?'expense':x.type,cents:filters.group==='expense'&&x.type!=='expense'?0:filters.category==='Transaction Charges'&&x.category!=='Transaction Charges'?0:x.cents,fee:filters.account&&(x.accountId||UNASSIGNED)!==filters.account?0:x.fee})));
}

// Fee rows are a view of the atomic parent, never independent ledger mutations.
export function activityRows(records) {
 return records.flatMap(x=>x.fee>0?[x,{...x,id:x.id+':fee',parentId:x.id,type:'expense',cents:x.fee,fee:0,toAccountId:'',category:'Transaction Charges',description:'Transaction charge ? '+x.description,review:false}]:[x]);
}
