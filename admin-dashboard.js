import { db, auth } from "./firebase.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "admin-login.html";
  try {
    const snap = await getDoc(doc(db, "admins", user.uid));
    if (!snap.exists()) {
      alert("আপনি Owner না!");
      await signOut(auth);
      return location.href = "admin-login.html";
    }
    document.body.classList.remove('hidden');
    document.getElementById('loading')?.classList.add('hidden');
    const emailEl = document.getElementById('adminEmail');
    if(emailEl) emailEl.innerText = user.email;
    const uidEl = document.getElementById('uidShort');
    if(uidEl) uidEl.innerText = user.uid.slice(0, 10) + "...";
    const dateEl = document.getElementById('todayDate');
    if(dateEl) dateEl.innerText = new Date().toLocaleDateString('bn-BD');
    loadStats();
  } catch (e) {
    console.error(e);
    document.body.classList.remove('hidden');
    document.getElementById('loading')?.classList.add('hidden');
    loadStats();
  }
});

async function loadStats() {
  const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; };
  const parseDate = (raw) => {
    if(!raw) return null;
    if(typeof raw.toDate==='function') return raw.toDate();
    if(raw.seconds) return new Date(raw.seconds*1000);
    const d=new Date(raw);
    return isNaN(d.getTime())?null:d;
  };

  let totalBuyCostGlobal = 0, totalStockQtyGlobal = 0, totalStockValueGlobal = 0, totalAllBuyQtyGlobal = 0;
  let lowStockCount = 0;

  try {
    let prodSize = 0;
    try { const snap = await getDocs(collection(db, "products_live")); prodSize = snap.size; } 
    catch { const snap2 = await getDocs(collection(db, "products")); prodSize = snap2.size; }
    setText('totalProducts', `${prodSize} টা প্রোডাক্ট`);

    const inboundSnap = await getDocs(collection(db, "inbounds"));
    let totalBuyQty = 0, totalBuyCost = 0;
    inboundSnap.forEach(d => {
      const data = d.data();
      let inQ=0, stQ=0;
      if(data.sizes && data.sizes.length>0){
        data.sizes.forEach(s=>{
          const sizeQty = Number(s.qty||0);
          const t=s.serials?s.serials.length:sizeQty;
          const st=s.serials?s.serials.filter(x=>x.status==='in').length:sizeQty;
          inQ+=t;
          stQ+=st;
          if(st < 10){
            lowStockCount++;
          }
        });
      } else { 
        inQ=Number(data.totalQty||data.qty||0); 
        stQ=inQ;
        if(stQ < 10) lowStockCount++;
      }
      totalAllBuyQtyGlobal+=inQ;
      totalBuyCostGlobal+=inQ*Number(data.buyPrice||0);
      totalStockQtyGlobal+=stQ;
      totalStockValueGlobal+=stQ*Number(data.buyPrice||0);
      totalBuyQty+=inQ;
      totalBuyCost+=inQ*Number(data.buyPrice||0);
    });

    setText('totalBuy', `৳${totalBuyCost} খরচ`);
    setText('totalBuyQty', `${totalBuyQty} pcs কেনা`);
    setText('stockValue', `Stock Value ৳${totalStockValueGlobal}`);
    setText('lowStockAlert', `${lowStockCount}`);
  } catch (e) { console.log("inbound error", e); }

  try {
    let custSize = 0;
    try{ const snap = await getDocs(collection(db, "users")); custSize = snap.size; }
    catch{ const snap2 = await getDocs(collection(db, "customers")); custSize = snap2.size; }
    setText('totalCustomers', `${custSize} জন`);
  } catch {}

  let deliveredRevenue = 0, deliveryIncomeGlobal = 0;
  let todaySellAmount = 0, todaySellCount = 0;
  let dueAmount = 0, dueCount = 0;
  let recentOrdersHTML = "";

  try {
    const orderSnap = await getDocs(collection(db, "orders"));
    const manualSnap = await getDocs(collection(db, "manual_sales")).catch(()=>({forEach:()=>{}, size:0}));
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);

    let allOrdersArr = [];

    orderSnap.forEach(d => {
      const o = d.data();
      allOrdersArr.push({id:d.id, ...o, type:'online'});
      const status = (o.status || '').toLowerCase().trim();
      const total = Number(o.total || o.totalAmount || o.grandTotal || 0);
      const delivery = Number(o.deliveryCharge || o.customer?.deliveryCharge || 0);
      const due = Number(o.due || o.remainingAmount || 0);

      // যদি অর্ডার ক্যানসেল করা না হয়, তবেই বাকি টাকা (Due) যোগ করবে
      if(status !== 'cancelled' && status !== 'canceled' && due > 0){
        dueAmount += due;
        dueCount++;
      }

      if(['delivered','completed'].includes(status)){
        const productSell = o.subTotal ? Number(o.subTotal) : (total - delivery);
        const rev = productSell>0?productSell:total;
        deliveredRevenue+=rev;
        deliveryIncomeGlobal+=delivery;
        const cd = parseDate(o.createdAt) || new Date();
        if(cd>=todayStart){ todaySellAmount+=rev; todaySellCount++; }
      }
    });

    manualSnap.forEach(d => {
      const s = d.data();
      allOrdersArr.push({id:d.id, ...s, type:'offline'});
      const status = (s.status || '').toLowerCase().trim();
      const total = Number(s.total||0);
      const del = Number(s.deliveryCharge || s.customer?.deliveryCharge || 0);
      const due = Number(s.due||0);

      // ম্যানুয়াল সেলের ক্ষেত্রেও ক্যানসেল চেক করা হলো
      if(status !== 'cancelled' && status !== 'canceled' && due > 0){
        dueAmount += due;
        dueCount++;
      }

      deliveredRevenue+=(total-del);
      deliveryIncomeGlobal+=del;
      const cd = parseDate(s.createdAt) || parseDate(s.date) || new Date();
      if(cd>=todayStart){ todaySellAmount+=(total-del); todaySellCount++; }
    });

    allOrdersArr.sort((a,b)=>{
      const da=parseDate(a.createdAt)||parseDate(a.date)||new Date(0);
      const db=parseDate(b.createdAt)||parseDate(b.date)||new Date(0);
      return db-da;
    });

    const recent5 = allOrdersArr.slice(0,5);
    if(recent5.length===0){
      recentOrdersHTML = `<p class="text-white/30">কোনো অর্ডার নাই</p>`;
    }else{
      recent5.forEach(o=>{
        const name = o.customer?.name || o.customerName || o.name || "Customer";
        const amt = o.total || o.totalAmount || 0;
        const status = o.status || "completed";
        const color = status==='delivered' || status==='completed' ? 'text-green-400' : 'text-yellow-400';
        recentOrdersHTML += `<div class="flex justify-between bg-black rounded-xl p-3"><div><p class="font-bold">${name}</p><p class="text-white/30 text-[10px]">${o.type}</p></div><div class="text-right"><p class="font-black">৳${amt}</p><p class="${color} text-[10px]">${status}</p></div></div>`;
      });
    }

    const totalOrdersSize = orderSnap.size + (manualSnap.size||0);
    setText('totalOrders', `${totalOrdersSize} টা অর্ডার`);
    setText('totalSellAmount', `Sell ৳${deliveredRevenue}`);
    setText('todaySell', `৳${todaySellAmount}`);
    setText('todaySellCount', `${todaySellCount} টা`);
    setText('dueAlert', `৳${dueAmount}`);
    setText('dueAlertCount', `${dueCount} জন`);
  } catch (e) { console.log("orders error", e); }

  try{
    const expenseSnap = await getDocs(collection(db, "expenses")).catch(()=>({forEach:()=>{}}));
    let expenseTotal=0;
    expenseSnap.forEach(d=> expenseTotal+=Number(d.data().amount||0));
    const profit = deliveredRevenue - totalBuyCostGlobal - expenseTotal + deliveryIncomeGlobal;
    setText('totalRevenue', `৳${profit>0?profit:0} লাভ`);
    setText('totalExpense', `খরচ ৳${expenseTotal}`);
  }catch{}

  const recentEl = document.getElementById('recentOrders');
  if(recentEl) recentEl.innerHTML = recentOrdersHTML || `<p class="text-white/30">কোনো অর্ডার নাই</p>`;
}

const logoutBtn = document.getElementById('logoutBtn');
if(logoutBtn){
  logoutBtn.onclick = async () => {
    await signOut(auth);
    location.href = "admin-login.html";
  };
}
