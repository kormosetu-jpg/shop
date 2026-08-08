import { db, auth } from "./firebase.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let allIn=[], allOrders=[], allManual=[], allExpense=[], stockRows=[], dueList=[];

onAuthStateChanged(auth, async (user)=>{
  if(!user) return location.href='admin-login.html';
  const snap = await getDoc(doc(db,"admins",user.uid));
  if(!snap.exists()) return location.href='admin-login.html';
  document.body.classList.remove('hidden');
  document.getElementById('loading').classList.add('hidden');
  loadAll();
});

async function loadAll(){
  const [inSnap, orderSnap, manualSnap, expSnap] = await Promise.all([
    getDocs(collection(db,"inbounds")),
    getDocs(collection(db,"orders")),
    getDocs(collection(db,"manual_sales")),
    getDocs(collection(db,"expenses")).catch(()=>({forEach:()=>{}}))
  ]);
  allIn=[]; allOrders=[]; allManual=[]; allExpense=[];
  inSnap.forEach(d=>allIn.push({id:d.id,...d.data()}));
  orderSnap.forEach(d=>allOrders.push({id:d.id,...d.data()}));
  manualSnap.forEach(d=>allManual.push({id:d.id,...d.data()}));
  expSnap.forEach(d=>allExpense.push({id:d.id,...d.data()}));
  calculate();
}

function calculate(){
  let totalInQty=0, totalBuyCost=0, stockQty=0, stockVal=0, rackMap={};
  stockRows=[]; dueList=[];
  
  allIn.forEach(o=>{
    let inQ=0, stQ=0, sizeDetails=[];
    if(o.sizes){
      o.sizes.forEach(s=>{
        const t=s.serials?s.serials.length:Number(s.qty||0);
        const st=s.serials?s.serials.filter(x=>x.status==='in').length:Number(s.qty||0);
        inQ+=t; stQ+=st;
        sizeDetails.push(`${s.size||''}:${st}/${t}`);
      });
    } else { inQ=Number(o.totalQty||o.qty||0); stQ=inQ; }
    
    totalInQty+=inQ; totalBuyCost+=inQ*Number(o.buyPrice||0);
    stockQty+=stQ; stockVal+=stQ*Number(o.buyPrice||0);
    
    const rack=o.rack||'N/A';
    if(!rackMap[rack]) rackMap[rack]={qty:0,val:0};
    rackMap[rack].qty+=stQ; rackMap[rack].val+=stQ*Number(o.buyPrice||0);

    const styleNumber = o.styleNo || o.styleCode || o.productCode || o.barcode || o.style || o.productName || o.styleName || o.name || o.inboundId || 'N/A';
    const inboundId = o.inboundId || o.id || '';

    stockRows.push({
      style: styleNumber, 
      inboundId: inboundId,
      rack, inQ, stQ, sold:inQ-stQ, 
      val:stQ*Number(o.buyPrice||0), 
      sizes:sizeDetails.join(' '), 
      search:(styleNumber+' '+inboundId+' '+rack+' '+(o.barcode||'')+' '+sizeDetails.join(' ')).toLowerCase()
    });
  });

  let onlineProd=0, onlineDel=0, onlinePaid=0, onlineDue=0, onlineCount=0;
  let cancelledCount=0, cancelledProductQty=0;

  allOrders.forEach(o=>{
    const orderStatus = (o.status || '').toLowerCase();
    
    if(orderStatus === 'cancelled' || orderStatus === 'cancel') {
      cancelledCount++;
      if(o.items && Array.isArray(o.items)) {
        o.items.forEach(item => {
          cancelledProductQty += Number(item.qty || item.quantity || 1);
        });
      } else {
        cancelledProductQty += 1;
      }
      return; 
    }

    const due=Number(o.due||o.remainingAmount||0);
    if(due>0) dueList.push({name:o.customer?.name||o.customerName||'Customer', phone:o.customer?.phone||o.phone||'', type:'Online', due, search:(o.customer?.name+' '+o.customer?.phone+' Online').toLowerCase()});
    if(!['delivered','completed'].includes(orderStatus)) return;
    
    const del=Number(o.deliveryCharge || o.customer?.deliveryCharge || 0);
    const sub=o.subTotal!=null?Number(o.subTotal):Number(o.total||0)-del;
    onlineProd+=sub+Number(o.customCharge||0); onlineDel+=del;
    onlinePaid+=Number(o.paid||o.advanceAmount||o.total||0); onlineDue+=due; onlineCount++;
  });

  let offProd=0, offDel=0, offPaid=0, offDue=0;
  allManual.forEach(s=>{
    const customerMap = s.customer || {};
    const del=Number(s.deliveryCharge || customerMap.deliveryCharge || s.custDeliveryCharge || 0);
    const total=Number(s.total||0);
    offProd+=total-del; offDel+=del; offPaid+=Number(s.paid||0); offDue+=Number(s.due||0);
    const due=Number(s.due||0);
    if(due>0) dueList.push({name:customerMap.name||s.custName||s.customerName||'Customer', phone:customerMap.phone||s.custPhone||'', type:'Offline', due, search:((customerMap.name||s.custName||'')+' Offline').toLowerCase()});
  });

  const totalProdSell=onlineProd+offProd;
  const totalDel=onlineDel+offDel;
  const totalSell=totalProdSell+totalDel;
  const totalPaid=onlinePaid+offPaid;
  const totalDue=onlineDue+offDue;
  const soldBuyCost=totalBuyCost-stockVal;
  const prodProfit=totalProdSell-soldBuyCost;

  const expenseTotal=allExpense.reduce((a,b)=>a+Number(b.amount||0),0);
  const garivaraTotal=allExpense.filter(e=>e.category==='garivara').reduce((a,b)=>a+Number(b.amount||0),0);
  const rentTotal=allExpense.filter(e=>e.category==='rent').reduce((a,b)=>a+Number(b.amount||0),0);
  const salaryTotal=allExpense.filter(e=>e.category==='salary').reduce((a,b)=>a+Number(b.amount||0),0);
  const otherExpense=expenseTotal - garivaraTotal;

  const netProfit=prodProfit+totalDel-expenseTotal;

  document.getElementById('rBuyCost').innerText='৳'+totalBuyCost;
  document.getElementById('rSell').innerText='৳'+totalSell;
  document.getElementById('rStockVal').innerText='৳'+stockVal;
  document.getElementById('rProfit').innerText='৳'+netProfit;

  document.getElementById('bInCount').innerText=allIn.length+' বার';
  document.getElementById('bTotalQty').innerText=totalInQty+' pcs';
  document.getElementById('bCost').innerText='৳'+totalBuyCost;

  document.getElementById('sOnlineProd').innerText='৳'+onlineProd;
  document.getElementById('sOnlineCount').innerText=onlineCount+' টা | Delivery ৳'+onlineDel;
  document.getElementById('sOffProd').innerText='৳'+offProd;
  document.getElementById('sOffCount').innerText=allManual.length+' টা | Delivery ৳'+offDel;

  document.getElementById('cPaid').innerText='৳'+totalPaid;
  document.getElementById('cDue').innerText='৳'+totalDue;
  document.getElementById('cDel').innerText='৳'+totalDel;

  if(document.getElementById('cancelledOrderCount')) document.getElementById('cancelledOrderCount').innerText = cancelledCount + ' টি';
  if(document.getElementById('cancelledProductQty')) document.getElementById('cancelledProductQty').innerText = cancelledProductQty + ' pcs';

  document.getElementById('rackTable').innerHTML=Object.entries(rackMap).map(([r,v])=>`<span class="bg-black border border-white/10 px-3 py-2 rounded-full">🗄️ ${r}: ${v.qty} pcs (৳${v.val})</span>`).join('');

  renderStock(stockRows);
  renderDue(dueList);

  document.getElementById('pProdSell').innerText='৳'+totalProdSell;
  document.getElementById('pBuyCost').innerText='৳'+soldBuyCost;
  document.getElementById('pProdProfit').innerText='৳'+prodProfit;
  document.getElementById('pDelProfit').innerText='৳'+totalDel;
  document.getElementById('pExpense').innerText='৳'+expenseTotal;
  if(document.getElementById('pGarivara')) document.getElementById('pGarivara').innerText='৳'+garivaraTotal;
  if(document.getElementById('pRent')) document.getElementById('pRent').innerText='৳'+rentTotal;
  if(document.getElementById('pSalary')) document.getElementById('pSalary').innerText='৳'+salaryTotal;
  if(document.getElementById('pOtherExp')) document.getElementById('pOtherExp').innerText='৳'+otherExpense;
  document.getElementById('pNet').innerText='৳'+netProfit;
}

function renderStock(rows){
  document.getElementById('stockTable').innerHTML=rows.map(r=>`
  <tr class="border-b border-white/5">
    <td class="py-3">
      <span class="text-[#FFC300] font-black text-sm">${r.style}</span> | ${r.rack}<br>
      <span class="text-[10px] text-white/40">${r.inboundId}</span><br>
      <span class="text-[10px] text-white/30">${r.sizes}</span>
    </td>
    <td class="text-center">${r.inQ}</td>
    <td class="text-center text-green-400 font-bold">${r.stQ}</td>
    <td class="text-center text-red-400">${r.sold}</td>
    <td class="text-right">৳${r.val}</td>
  </tr>`).join('');
  const low=rows.filter(r=>r.stQ>0 && r.stQ<=10);
  const out=rows.filter(r=>r.stQ===0);
  let msg='';
  if(low.length) msg+=`<p class="text-orange-400">⚠️ Low: ${low.map(r=>`${r.style}(${r.stQ})`).join(', ')}</p>`;
  if(out.length) msg+=`<p class="text-red-400">❌ Out: ${out.map(r=>`${r.style}`).join(', ')}</p>`;
  if(!msg) msg=`<p class="text-green-400">✅ সব স্টক ঠিক আছে</p>`;
  document.getElementById('lowStockList').innerHTML=msg;
}

function renderDue(list){
  document.getElementById('dueTable').innerHTML=list.map(d=>`<tr class="border-b border-white/5"><td class="py-2">${d.name}</td><td class="text-center">${d.phone}</td><td class="text-center">${d.type}</td><td class="text-right text-red-400 font-bold">৳${d.due}</td></tr>`).join('') || `<tr><td colspan="4" class="py-3 text-center text-white/30">কোনো বাকি নেই</td></tr>`;
}

window.showOnly=(type)=>{
  hideAll();
  const id='sec-'+type;
  document.getElementById(id)?.classList.remove('hidden');
  window.scrollTo({top:document.getElementById(id).offsetTop-80, behavior:'smooth'});
}
window.showAll=()=>{ document.querySelectorAll('.reportSec').forEach(el=>el.classList.remove('hidden')); }
window.hideAll=()=>{ document.querySelectorAll('.reportSec').forEach(el=>el.classList.add('hidden')); }
window.hideSec=(id)=>{ document.getElementById(id)?.classList.add('hidden'); }

window.liveSearch=(q)=>{
  q=q.toLowerCase();
  if(!q){ hideAll(); return; }
  document.querySelectorAll('.reportSec').forEach(el=>el.classList.add('hidden'));
  if(q.includes('buy')||q.includes('ken')) document.getElementById('sec-buy').classList.remove('hidden');
  if(q.includes('sell')||q.includes('bik')) document.getElementById('sec-sell').classList.remove('hidden');
  if(q.includes('stock')) document.getElementById('sec-stock').classList.remove('hidden');
  if(q.includes('due')||q.includes('baki')) document.getElementById('sec-due').classList.remove('hidden');
  if(q.includes('profit')||q.includes('lav')) document.getElementById('sec-profit').classList.remove('hidden');
  if(q.includes('rack')) document.getElementById('sec-rack').classList.remove('hidden');
  if(q.includes('expense')||q.includes('khoroch')||q.includes('gari')) document.getElementById('sec-profit').classList.remove('hidden');
  const filteredStock=stockRows.filter(r=>r.search.includes(q));
  if(filteredStock.length>0){ document.getElementById('sec-stock').classList.remove('hidden'); renderStock(filteredStock); }
  const filteredDue=dueList.filter(d=>d.search.includes(q));
  if(filteredDue.length>0){ document.getElementById('sec-due').classList.remove('hidden'); renderDue(filteredDue); }
}
window.searchStock=(q)=>{
  const f=stockRows.filter(r=>r.search.includes(q.toLowerCase()));
  renderStock(f);
}
window.searchDue=(q)=>{
  const f=dueList.filter(d=>d.search.includes(q.toLowerCase()));
  renderDue(f);
}
