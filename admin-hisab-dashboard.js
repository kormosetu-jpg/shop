import { db, auth } from "./firebase.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let allIn=[], allOrders=[], allManual=[], allExpense=[];
let totalStockQty=0, totalStockVal=0, totalAllBuyQty=0, totalAllBuyCost=0;

onAuthStateChanged(auth, async (user)=>{
  if(!user) return location.href='admin-login.html';
  const snap = await getDoc(doc(db,"admins",user.uid));
  if(!snap.exists()) return location.href='admin-login.html';
  document.body.classList.remove('hidden');
  document.getElementById('loading').classList.add('hidden');
  await loadAll();
});

async function loadAll(){
  const [inSnap, orderSnap, manualSnap, expenseSnap] = await Promise.all([
    getDocs(collection(db,"inbounds")),
    getDocs(collection(db,"orders")),
    getDocs(collection(db,"manual_sales")),
    getDocs(collection(db,"expenses")).catch(()=>({forEach:()=>{}}))
  ]);
  allIn=[]; allOrders=[]; allManual=[]; allExpense=[];
  inSnap.forEach(d=>allIn.push({id:d.id,...d.data()}));
  orderSnap.forEach(d=>allOrders.push({id:d.id,...d.data()}));
  manualSnap.forEach(d=>allManual.push({id:d.id,...d.data()}));
  expenseSnap.forEach(d=>allExpense.push({id:d.id,...d.data()}));

  totalStockQty=0; totalStockVal=0; totalAllBuyQty=0; totalAllBuyCost=0;
  allIn.forEach(o=>{
    let inQ=0,stQ=0;
    if(o.sizes){ o.sizes.forEach(s=>{ const t=s.serials?s.serials.length:Number(s.qty||0); const st=s.serials?s.serials.filter(x=>x.status==='in').length:Number(s.qty||0); inQ+=t; stQ+=st; }); }
    else{ inQ=Number(o.totalQty||o.qty||0); stQ=inQ; }
    totalAllBuyQty+=inQ;
    totalAllBuyCost+=inQ*Number(o.buyPrice||0);
    totalStockQty+=stQ;
    totalStockVal+=stQ*Number(o.buyPrice||0);
  });

  let expTotal=0, garivara=0;
  allExpense.forEach(e=>{
    expTotal+=Number(e.amount||0);
    if(e.category==='garivara') garivara+=Number(e.amount||0);
  });
  const expEl=document.getElementById('expenseTotal');
  if(expEl) expEl.innerText='৳'+expTotal+' খরচ (গাড়ি ৳'+garivara+')';
  let dueCount=0;
  [...allOrders,...allManual].forEach(o=>{ if(Number(o.due||o.remainingAmount||0)>0) dueCount++; });
  const dueEl=document.getElementById('dueCount');
  if(dueEl) dueEl.innerText=dueCount+' জন বাকি';

  calculate();
}

function parseItemDate(rawDate){
  if(!rawDate) return null;
  if(typeof rawDate.toDate==='function') return rawDate.toDate();
  if(rawDate.seconds) return new Date(rawDate.seconds*1000);
  const d=new Date(rawDate);
  return isNaN(d.getTime())?null:d;
}
function getDocDate(docData){
  return parseItemDate(docData.createdAt) || parseItemDate(docData.date) || parseItemDate(docData.timestamp) || null;
}
function isInRange(docData, from, to){
  if(!from||!to) return true;
  const d=getDocDate(docData);
  if(!d) return false;
  return d>=from && d<=to;
}

function calculate(fromVal=null, toVal=null){
  let fromDate=null,toDate=null,isFiltered=false;
  if(fromVal && toVal){
    fromDate=new Date(fromVal); fromDate.setHours(0,0,0,0);
    toDate=new Date(toVal); toDate.setHours(23,59,59,999);
    isFiltered=true;
    document.getElementById('filterLabel').innerText=`${fromVal} to ${toVal} - Filtered`;
    document.getElementById('hBuyPeriod').innerText=`${fromVal} to ${toVal}`;
  }else{
    document.getElementById('filterLabel').innerText='গাড়ি ভাড়া সহ Net লাভ - All Time';
    document.getElementById('hBuyPeriod').innerText='সব কেনা';
  }

  let fInQty=0,fBuyCost=0,fInCount=0;
  if(isFiltered){
    allIn.forEach(o=>{
      if(!isInRange(o,fromDate,toDate)) return;
      let inQ=0;
      if(o.sizes){ o.sizes.forEach(s=>{ inQ+=s.serials?s.serials.length:Number(s.qty||0); }); }
      else{ inQ=Number(o.totalQty||o.qty||0); }
      fInQty+=inQ;
      fBuyCost+=inQ*Number(o.buyPrice||0);
      fInCount++;
    });
  }else{
    fInQty=totalAllBuyQty;
    fBuyCost=totalAllBuyCost;
    fInCount=allIn.length;
  }

  const stockQty=totalStockQty;
  const stockVal=totalStockVal;

  let soldQty=0,soldBuyCost=0;
  if(isFiltered){
    if(fInQty>0 && totalAllBuyQty>0){
      const ratio = fInQty / totalAllBuyQty;
      const filteredStockQty = stockQty * ratio;
      const filteredStockVal = stockVal * ratio;
      soldQty = fInQty - filteredStockQty;
      soldBuyCost = fBuyCost - filteredStockVal;
    }else{
      soldQty=0;
      soldBuyCost=0;
    }
  }else{
    soldQty=totalAllBuyQty - totalStockQty;
    soldBuyCost=totalAllBuyCost - totalStockVal;
  }
  if(soldQty<0) soldQty=0;
  if(soldBuyCost<0) soldBuyCost=0;
  soldQty=Math.round(soldQty);
  soldBuyCost=Math.round(soldBuyCost);

  let onlineProd=0,onlineDel=0,onlinePaid=0,onlineDue=0,onlineCount=0;
  let cancelledCount=0, cancelledProductQty=0; // ✅ ক্যানসেলড কাউন্ট ভেরিয়েবল

  allOrders.forEach(o=>{
    const orderStatus = (o.status || '').toLowerCase();
    
    // ✅ ক্যানসেলড অর্ডার ফিল্টার ও হিসাব
    if(orderStatus === 'cancelled' || orderStatus === 'cancel') {
      if(!isInRange(o, fromDate, toDate)) return; // ডেট ফিল্টার থাকলে ডেট চেক করবে
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

    if(!['delivered','completed'].includes(orderStatus)) return;
    if(!isInRange(o,fromDate,toDate)) return;
    const del=Number(o.deliveryCharge||o.customer?.deliveryCharge||0);
    const sub=o.subTotal!=null?Number(o.subTotal):Number(o.total||0)-del;
    const custom=Number(o.customCharge||0);
    onlineProd+=sub+custom;
    onlineDel+=del;
    onlinePaid+=Number(o.paid||o.advanceAmount||o.total||0);
    onlineDue+=Number(o.due||o.remainingAmount||0);
    onlineCount++;
  });

  let offProd=0,offDel=0,offPaid=0,offDue=0,offCount=0;
  allManual.forEach(s=>{
    if(!isInRange(s,fromDate,toDate)) return;
    const c=s.customer||{};
    const del=Number(s.deliveryCharge||c.deliveryCharge||0);
    offProd+=Number(s.total||0)-del;
    offDel+=del;
    offPaid+=Number(s.paid||0);
    offDue+=Number(s.due||0);
    offCount++;
  });

  let expenseTotal=0,garivaraTotal=0;
  allExpense.forEach(e=>{
    if(!isInRange(e,fromDate,toDate)) return;
    const amt=Number(e.amount||0);
    expenseTotal+=amt;
    if(e.category==='garivara') garivaraTotal+=amt;
  });

  let dueCount=0;
  [...allOrders,...allManual].forEach(o=>{
    if(!isInRange(o,fromDate,toDate)) return;
    if(Number(o.due||o.remainingAmount||0)>0) dueCount++;
  });

  const totalProdSell=onlineProd+offProd;
  const totalDel=onlineDel+offDel;
  const totalSell=totalProdSell+totalDel;
  const totalPaid=onlinePaid+offPaid;
  const totalDue=onlineDue+offDue;
  const prodProfit= totalProdSell - soldBuyCost;
  const netProfit= prodProfit + totalDel - expenseTotal;

  document.getElementById('hBuyQty').innerText=fInQty+' pcs';
  document.getElementById('hBuyCount').innerText=fInCount+' বার';
  document.getElementById('hBuyCost').innerText='৳'+fBuyCost;
  document.getElementById('hStockQty').innerText=stockQty+' pcs';
  document.getElementById('hStockVal').innerText='Value ৳'+stockVal;
  document.getElementById('hSoldCost').innerText='৳'+soldBuyCost;
  document.getElementById('hSoldQty').innerText=soldQty+' pcs Sold';

  // ✅ HTML এ ক্যানসেলড অর্ডারের ডেটা বসানো (যদি এলিমেন্ট থাকে)
  if(document.getElementById('cancelledOrderCount')) document.getElementById('cancelledOrderCount').innerText = cancelledCount + ' টি';
  if(document.getElementById('cancelledProductQty')) document.getElementById('cancelledProductQty').innerText = cancelledProductQty + ' pcs';

  document.getElementById('hOnlineProd').innerText='৳'+onlineProd;
  document.getElementById('hOnlineCount').innerText=onlineCount+' Delivered';
  document.getElementById('hOnlineDel').innerText='৳'+onlineDel;
  document.getElementById('hOffProd').innerText='৳'+offProd;
  document.getElementById('hOffCount').innerText=(isFiltered?offCount:allManual.length)+' টা';
  document.getElementById('hOffDel').innerText='৳'+offDel;
  document.getElementById('hTotalSell').innerText='৳'+totalSell;
  document.getElementById('hTotalProdSell').innerText='৳'+totalProdSell;

  document.getElementById('hPaid').innerText='৳'+totalPaid;
  document.getElementById('hDue').innerText='৳'+totalDue;
  document.getElementById('hDelTotal').innerText='৳'+totalDel;

  document.getElementById('hProdProfit').innerText='৳'+prodProfit;
  document.getElementById('hDelProfit').innerText='৳'+totalDel;
  document.getElementById('hExpense').innerText='৳'+expenseTotal;
  document.getElementById('hGarivara').innerText='৳'+garivaraTotal;
  document.getElementById('hNetProfit').innerText='৳'+netProfit;

  document.getElementById('fBuy').innerText='৳'+fBuyCost;
  document.getElementById('fStock').innerText='৳'+stockVal;
  document.getElementById('fSell').innerText='৳'+totalSell;
  document.getElementById('fExpense').innerText='৳'+expenseTotal;
  document.getElementById('fCash').innerText='৳'+totalPaid;
  document.getElementById('fDue').innerText='৳'+totalDue;
  document.getElementById('fProfit').innerText='৳'+netProfit;

  document.getElementById('dueCount').innerText=dueCount+' জন বাকি';
  document.getElementById('expenseTotal').innerText='৳'+expenseTotal+' খরচ (গাড়ি ৳'+garivaraTotal+')';
}

window.applyDateFilter=()=>{
  const from=document.getElementById('fromDate').value;
  const to=document.getElementById('toDate').value;
  if(!from||!to) return alert('From To Date দিন');
  if(new Date(from)>new Date(to)) return alert('From Date To Date এর থেকে বড় হতে পারবে না');
  calculate(from,to);
}
window.resetFilter=()=>{
  document.getElementById('fromDate').value='';
  document.getElementById('toDate').value='';
  calculate();
     }
