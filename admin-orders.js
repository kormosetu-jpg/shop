import { db, auth } from "./firebase.js";
import { collection, query, getDocs, orderBy, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let allOrders=[], activeOrdersList=[], filteredOrders=[], selectedOrderId=null;
let scannedBarcodes = [], itemsNeedingScan = [];
let html5Qr = null;
let currentCustomFilter = 'all';
const ordersList=document.getElementById('ordersList');
const loadingBox=document.getElementById('loadingBox');

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "admin-login.html";
  try {
    const snap = await getDoc(doc(db, "admins", user.uid));
    if (!snap.exists() || snap.data().active===false) { await signOut(auth); return location.href = "admin-login.html"; }
    document.body.classList.remove('hidden');
    initYearFilter(); fetchAll();
  } catch (e) { document.body.classList.remove('hidden'); initYearFilter(); fetchAll(); }
});

function initYearFilter(){
  const yearSel = document.getElementById('yearFilter');
  if(yearSel && yearSel.options.length <=1){
    const curYear = new Date().getFullYear();
    yearSel.innerHTML = '';
    for(let y=curYear; y>=2023; y--) yearSel.innerHTML += `<option value="${y}" ${y===curYear?'selected':''}>${y}</option>`;
    yearSel.innerHTML += `<option value="all">All Year</option>`;
  }
}
function formatDate(ts){ if(!ts) return ''; const d=ts.toDate?ts.toDate():new Date(ts); return d.toLocaleString('bn-BD'); }
function statusColor(s){ s=(s||'pending').toLowerCase(); if(s==='pending') return 'bg-yellow-400 text-black'; if(s==='processing'||s==='confirmed') return 'bg-blue-500 text-white'; if(s==='shipped'||s==='on_the_way') return 'bg-purple-500 text-white'; if(s==='delivered'||s==='completed') return 'bg-green-500 text-white'; if(s==='cancelled') return 'bg-red-500 text-white'; return 'bg-white/10'; }
function safe(u){ return (u||'').toString().replace(/'/g,'%27').replace(/"/g,'%22'); }
function getInId(it){ return it?.inboundId || it?.inId || it?.IN_ID || it?.inID || it?.in_id || it?.inIdCode || it?.inBoundId || it?.custom?.inId || it?.customDetails?.inId || it?.productCode || 'IN-260725-O9AT'; }

// ✅ ফায়ারস্টোরের সঠিক পাথ থেকে Design URL বের করার ফাংশন
function getDesignUrl(item, order){
  return item?.customDetails?.designUrl || item?.customDetails?.designImageUrl || item?.custom?.designUrl || item?.designUrl || order?.customDetails?.designUrl || order?.custom?.designUrl || order?.items?.[0]?.customDetails?.designUrl || order?.items?.[0]?.custom?.designUrl || '';
}
function getProdImg(item){ return item?.imageUrl || item?.images?.[0] || item?.image || item?.productImage || ''; }
function hasCustom(order){ return order.isCustom || (order.customCharge||0)>0 || (order.items||[]).some(it => it.isCustom || getDesignUrl(it, order) || it.customDetails || it.custom); }

function getPlayersFromItem(it){
  if(it.customDetails?.items && Array.isArray(it.customDetails.items)) return it.customDetails.items;
  if(it.custom?.items && Array.isArray(it.custom.items)) return it.custom.items;
  if(it.custom?.players) return it.custom.players;
  if(it.custom?.list) return it.custom.list;
  return [];
}

function ensureModals(){
  if(!document.getElementById('orderModal')){
    const m = document.createElement('div');
    m.id='orderModal';
    m.className='hidden fixed inset-0 bg-black/80 backdrop-blur z-[100] p-3 flex items-center justify-center';
    m.innerHTML=`<div class="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto no-scrollbar"><div class="p-5 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#121212] z-10"><div><p id="mId" class="font-mono font-black text-sm"></p><p id="mDate" class="text-xs text-white/40"></p></div><button onclick="closeOrderModal()" class="w-8 h-8 bg-white/10 rounded-full">✕</button></div><div id="mBody" class="p-5 space-y-4"></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click',(e)=>{ if(e.target.id==='orderModal') closeOrderModal(); });
  }
  if(!document.getElementById('imgViewer')){
    const v = document.createElement('div');
    v.id='imgViewer';
    v.className='hidden fixed inset-0 bg-black/95 z-[200] flex flex-col items-center justify-center p-4';
    v.innerHTML=`<button onclick="closeImgViewer()" class="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full text-white text-xl">✕</button><img id="viewerImg" src="" class="max-w-full max-h-[75vh] rounded-2xl object-contain bg-white"><div class="flex gap-3 mt-5"><a id="downloadBtn" href="" download target="_blank" class="bg-[#FFC300] text-black px-6 py-3 rounded-full font-black text-sm">⬇️ Download</a><button onclick="closeImgViewer()" class="bg-white/10 text-white px-6 py-3 rounded-full font-bold text-sm">Close</button></div>`;
    document.body.appendChild(v);
  }
}

async function fetchAll(){
  loadingBox.classList.remove('hidden');
  const q=query(collection(db,"orders"), orderBy("createdAt","desc"));
  let snap; try{ snap=await getDocs(q); }catch(e){ snap=await getDocs(collection(db,"orders")); }
  allOrders=[]; snap.forEach(d=> allOrders.push({id:d.id,...d.data()}));
  allOrders.sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  ensureModals(); applyMonthFilter(); loadingBox.classList.add('hidden');
}

function applyMonthFilter(){
  const mVal=document.getElementById('monthFilter').value; const yVal=document.getElementById('yearFilter').value;
  let monthFiltered=allOrders;
  if(mVal!=='all'){ const m=parseInt(mVal); const y=parseInt(yVal); monthFiltered=allOrders.filter(o=>{ const d=o.createdAt?.toDate?o.createdAt.toDate():new Date(o.createdAt); return d.getMonth()===m && (yVal==='all' || d.getFullYear()===y); }); }
  else if(yVal!=='all'){ const y=parseInt(yVal); monthFiltered=allOrders.filter(o=>{ const d=o.createdAt?.toDate?o.createdAt.toDate():new Date(o.createdAt); return d.getFullYear()===y; }); }
  activeOrdersList=monthFiltered.filter(o=>!['delivered','completed','cancelled'].includes((o.status||'pending').toLowerCase()));
  applyCustomFilterInternal(monthFiltered);
}
function resetMonth(){ document.getElementById('monthFilter').value='all'; document.getElementById('yearFilter').value=new Date().getFullYear(); applyMonthFilter(); }
function updateSummary(monthFiltered){
  const delivered=monthFiltered.filter(o=>['delivered','completed'].includes((o.status||'').toLowerCase()));
  document.getElementById('activeOrders').innerText=activeOrdersList.length;
  document.getElementById('pendingCount').innerText=activeOrdersList.filter(o=>(o.status||'pending').toLowerCase()==='pending').length;
  document.getElementById('totalAmount').innerText=activeOrdersList.reduce((s,o)=>s+(o.total||0),0)+'৳';
  document.getElementById('totalIncome').innerText=delivered.reduce((s,o)=>s+(o.subTotal||0),0)+'৳';
  document.getElementById('totalIncomeSub').innerText=`${delivered.length} টা Delivered`;
  document.getElementById('totalDelivery').innerText=delivered.reduce((s,o)=>s+(o.deliveryCharge||0),0)+'৳';
  document.getElementById('activeOrdersSub').innerText=`এই মাসে মোট ${monthFiltered.length} অর্ডার`;
  document.getElementById('todayOrders').innerText=monthFiltered.length;
}
function applyCustomFilterInternal(monthFiltered){
  let base = monthFiltered? monthFiltered.filter(o=>!['delivered','completed','cancelled'].includes((o.status||'pending').toLowerCase())) : activeOrdersList;
  if(currentCustomFilter==='custom') filteredOrders = base.filter(o=> hasCustom(o));
  else if(currentCustomFilter==='normal') filteredOrders = base.filter(o=>!hasCustom(o));
  else filteredOrders = [...base];
  if(monthFiltered) activeOrdersList = base;
  render();
  if(monthFiltered) updateSummary(monthFiltered);
}
function render(){
  if(filteredOrders.length===0){ ordersList.innerHTML=`<div class="bg-[#121212] border border-white/10 rounded-2xl p-10 text-center text-white/50">কোনো একটিভ অর্ডার নেই</div>`; return; }
  ordersList.innerHTML = filteredOrders.map(o=>{
    const firstImg=getProdImg(o.items?.[0]||{}) || 'https://via.placeholder.com/100';
    const isShipped = ['shipped','on_the_way'].includes((o.status||'').toLowerCase());
    const isFree = o.deliveryCharge===0;
    const isCustom = hasCustom(o);
    const totalQty = o.items?.reduce((s,it)=> s + (getPlayersFromItem(it).length || it.quantity || it.qty || 1), 0) || 0;
    return `<div class="bg-[#121212] border ${isShipped?'border-purple-500/30':'border-white/10'} rounded-2xl p-3"><div class="flex gap-3 cursor-pointer" onclick="openOrderModal('${o.id}')"><img src="${safe(firstImg)}" class="w-16 h-16 rounded-xl bg-white object-contain shrink-0"><div class="flex-1 min-w-0"><div class="flex flex-wrap gap-1.5 items-center"><span class="font-mono bg-white text-black px-2 py-0.5 rounded-full text-xs font-black">#${o.id.slice(0,8).toUpperCase()}</span><span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold ${statusColor(o.status)}">${(o.status||'PENDING').toUpperCase()}</span>${isCustom?`<span class="bg-[#FFC300] text-black text-[10px] px-2 py-0.5 rounded-full font-black">CUSTOM</span>`:''}${isFree?`<span class="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">FREE DEL</span>`:''}</div><p class="text-xs text-white/40 mt-1">${formatDate(o.createdAt)}</p><p class="font-bold text-sm truncate">${o.customer?.name||''} - ${o.customer?.phone||''}</p><p class="text-xs mt-1">Items: ${o.items?.length||0} (${totalQty} pcs) | Total: ৳${o.total||0}</p></div><span class="text-[#FFC300] text-xs self-center">View →</span></div><div class="grid grid-cols-3 gap-2 mt-3"><button onclick="openStatusModal('${o.id}','${o.status||'pending'}')" class="bg-[#FFC300] text-black py-2 rounded-full text-xs font-black">Status</button><a href="invoice.html?id=${o.id}" target="_blank" class="bg-white text-black py-2 rounded-full text-xs font-bold text-center">Invoice</a><a href="tel:${o.customer?.phone||''}" class="bg-green-600 text-white py-2 rounded-full text-xs font-bold text-center">📞 Call</a></div></div>`;
  }).join('');
}

window.openOrderModal = (id)=>{
  ensureModals();
  const o = allOrders.find(x=>x.id===id); if(!o) return;
  document.getElementById('mId').innerText = '#'+id.slice(0,8).toUpperCase()+' - '+(o.status||'').toUpperCase();
  document.getElementById('mDate').innerText = formatDate(o.createdAt);
  const firstItem = o.items?.[0] || {};
  const prodImgMain = safe(getProdImg(firstItem));
  const designUrl = getDesignUrl(firstItem, o);
  const totalQty = o.items?.reduce((s,it)=> s + (getPlayersFromItem(it).length || it.quantity || it.qty || 1), 0) || 0;
  const teamName = firstItem.customDetails?.teamName || firstItem.custom?.teamName || o.teamName || '';

  let designBlock = '';
  if(designUrl){
    designBlock = `<div class="bg-black border-2 border-[#FFC300] rounded-2xl p-3"><p class="text-xs font-black text-[#FFC300] mb-2">🎨 কাস্টম ডিজাইন ফটো</p><img onclick="openImg('${safe(designUrl)}')" src="${safe(designUrl)}" class="w-full max-h-[450px] object-contain bg-white rounded-xl cursor-pointer"><div class="flex gap-2 mt-3"><button onclick="openImg('${safe(designUrl)}')" class="flex-1 bg-white text-black py-2.5 rounded-full text-xs font-bold">🔍 বড় করুন</button><a href="${safe(designUrl)}" download target="_blank" class="flex-1 bg-[#FFC300] text-black py-2.5 rounded-full text-xs font-black text-center">⬇️ Download</a></div></div>`;
  }

  const allItemsHTML = (o.items||[]).map((it)=>{
    const pls = getPlayersFromItem(it);
    const qty = pls.length || it.qty || it.quantity || 1;
    const base = it.basePrice? parseInt(it.basePrice) : Math.max(0, parseInt(it.price||0) - parseInt(it.customChargePerUnit||0));
    const perC = it.customChargePerUnit? parseInt(it.customChargePerUnit) : 0;
    const pImg = safe(getProdImg(it));
    const note = it.customDetails?.note || it.custom?.note || '';
    return `<div class="bg-[#181818] border border-white/10 rounded-xl p-3 space-y-2"><div class="flex gap-3"><img src="${pImg}" class="w-14 h-14 bg-white rounded-lg object-contain shrink-0"><div class="flex-1 text-xs space-y-0.5"><p class="font-bold text-sm">${it.productName||it.name} (${qty} Pcs)</p><p>মূল্য: <b>${base}৳</b> ${perC?`+ Custom Charge: <b>${perC}৳</b>`:''} = <b class="text-[#FFC300]">${(base+perC)*qty}৳</b></p><p class="text-white/50 text-[11px]">IN ID: ${getInId(it)} | Barcode: ${it.barcode||'Not Scanned'}</p>${teamName?`<p class="text-[#FFC300]">Team Name: <b>${teamName}</b></p>`:''}</div></div>${pls.length?`<div class="bg-black/60 rounded-xl p-2.5 space-y-1"><p class="text-[10px] text-[#FFC300] font-black">👕 কাস্টম প্লেয়ার লিস্ট (${pls.length}):</p>${pls.map(p=>`<div class="flex justify-between items-center text-xs bg-white/5 px-2 py-1 rounded-lg"><span>নাম: <b>${p.name||'-'}</b> | নাম্বার: <b>${p.number||'-'}</b></span><span class="bg-[#FFC300] text-black px-2 py-0.5 rounded-full font-bold text-[10px]">${p.size||'M'}</span></div>`).join('')}</div>`:''}${note?`<p class="text-[11px] text-white/70 bg-white/5 p-2 rounded-lg">📝 নোট: ${note}</p>`:''}</div>`;
  }).join('');

  document.getElementById('mBody').innerHTML = `
    <div class="bg-[#121212] border border-white/10 rounded-2xl p-3 space-y-2">
      <div class="flex gap-3">
        <img src="${prodImgMain}" class="w-20 h-20 bg-white rounded-xl object-contain shrink-0">
        <div class="text-xs space-y-1 flex-1">
          <p class="font-black text-sm">${firstItem.productName||'Product'} - ${totalQty} পিস</p>
          <p>সাবটোটাল: <b>${o.subTotal||0}৳</b> + কাস্টম চার্জ: <b>${o.customCharge||0}৳</b> + ডেলিভারি: <b class="${o.deliveryCharge===0?'text-green-400':''}">${o.deliveryCharge===0?'FREE':o.deliveryCharge+'৳'}</b> = <b class="text-[#FFC300] text-sm">৳${o.total}</b></p>
          <p>পেমেন্ট মেথড: <b>${o.paymentMethod||'COD'}</b> ${o.couponCode?`| কুপন (${o.couponCode}) -${o.couponDiscount||0}৳`:''}</p>
        </div>
      </div>
    </div>
    <div class="bg-black/40 rounded-2xl p-3 text-xs space-y-1 border border-white/5">
      <p class="font-black text-[#FFC300]">👤 কাস্টমার ইনফরমেশন</p>
      <p>নাম: <b>${o.customer?.name}</b></p>
      <p>ফোন: <a href="tel:${o.customer?.phone}" class="text-green-400 font-bold underline">${o.customer?.phone}</a></p>
      <p>ঠিকানা: ${o.customer?.address}, ${o.customer?.thana || ''}, ${o.customer?.district || ''}</p>
    </div>
    ${designBlock}
    <div class="space-y-2"><p class="text-xs font-black text-[#FFC300]">📦 প্রোডাক্ট ও কাস্টম বিবরণ</p>${allItemsHTML}</div>
    <div class="grid grid-cols-2 gap-2 pt-2">
      <button onclick="openStatusModal('${o.id}','${o.status||'pending'}')" class="bg-[#FFC300] text-black py-3 rounded-full text-xs font-black">📦 Status + Scan</button>
      <a href="invoice.html?id=${o.id}" target="_blank" class="bg-white text-black py-3 rounded-full text-xs font-bold text-center">Invoice</a>
      <a href="packing-label.html?id=${o.id}" target="_blank" class="bg-blue-600 text-white py-3 rounded-full text-xs font-bold text-center">🏷️ Packing Label</a>
      <a href="tel:${o.customer?.phone||''}" class="bg-green-600 text-white py-3 rounded-full text-xs font-black text-center">📞 কল দিন</a>
    </div>
  `;
  document.getElementById('orderModal').classList.remove('hidden');
}

window.closeOrderModal = ()=> document.getElementById('orderModal')?.classList.add('hidden');
window.openImg = (url)=>{ if(!url) return; ensureModals(); const u=safe(url); document.getElementById('viewerImg').src=u; document.getElementById('downloadBtn').href=u; document.getElementById('imgViewer').classList.remove('hidden'); }
window.closeImgViewer = ()=> document.getElementById('imgViewer')?.classList.add('hidden');

function applyFilters(){
  const search=document.getElementById('searchInput').value.toLowerCase();
  let base = activeOrdersList;
  if(currentCustomFilter==='custom') base = base.filter(o=> hasCustom(o));
  else if(currentCustomFilter==='normal') base = base.filter(o=>!hasCustom(o));
  filteredOrders=base.filter(o=> o.id.toLowerCase().includes(search) || o.customer?.phone?.includes(search) || o.customer?.name?.toLowerCase().includes(search));
  render();
}

window.openStatusModal=(id,cur)=>{
  selectedOrderId=id; scannedBarcodes=[]; itemsNeedingScan=[];
  document.getElementById('newStatus').value=cur.toLowerCase();
  document.getElementById('serialInput').value=''; document.getElementById('scannedList').innerHTML='';
  document.getElementById('statusModal').classList.remove('hidden');
  const order = allOrders.find(o=>o.id===selectedOrderId);
  if(order){
    document.getElementById('modalOrderInfo').innerHTML = `<p>#${order.id.slice(0,8).toUpperCase()} - ${order.customer?.name} | Total ${order.total}৳ (Base ${order.subTotal||0}+Custom ${order.customCharge||0})</p>`;
    const map = new Map();
    (order.items||[]).forEach(it=>{
      const players = getPlayersFromItem(it);
      const inId = getInId(it);
      const pName = it.productName||it.name||'Product';
      if(players.length>0){
        players.forEach(p=>{
          const size = (p.size||'M').toUpperCase();
          const key = `${pName}-${size}`;
          if(!map.has(key)) map.set(key, {productName: pName, size: size, qty: 0, inboundId: inId, scanned: []});
          map.get(key).qty += 1;
        });
      } else {
        const size = (it.selectedSize||it.size||it.custom?.size||it.customDetails?.size||'M').toUpperCase();
        const key = `${pName}-${size}`;
        if(!map.has(key)) map.set(key, {productName: pName, size: size, qty: 0, inboundId: inId, scanned: []});
        map.get(key).qty += (it.quantity||it.qty||1);
      }
    });
    itemsNeedingScan = Array.from(map.values());
    renderItemsToScan();
    scannedBarcodes = itemsNeedingScan.flatMap(it=>it.scanned);
  }
  toggleSerialArea();
}
window.closeStatusModal=()=>{ document.getElementById('statusModal').classList.add('hidden'); selectedOrderId=null; scannedBarcodes=[]; itemsNeedingScan=[]; closeScanner(); }
function toggleSerialArea(){ const ns=document.getElementById('newStatus').value; const area=document.getElementById('serialScanArea'); if(ns==='delivered'||ns==='cancelled'){ area.classList.remove('hidden'); renderItemsToScan(); renderScanned(); } else area.classList.add('hidden'); }
function renderItemsToScan(){
  const box = document.getElementById('itemsToScan'); if(!box) return;
  if(itemsNeedingScan.length===0){ box.innerHTML=`<p class="text-[11px] text-white/30 text-center">No items</p>`; return; }
  box.innerHTML = itemsNeedingScan.map(it=>`<div class="bg-black border ${it.scanned.length>=it.qty?'border-green-500/50':'border-white/10'} rounded-xl p-2 flex justify-between items-center"><div class="text-xs"><p class="font-bold">${it.productName} - Size: <span class="bg-white text-black px-2 py-0.5 rounded-full">${it.size}</span> x ${it.qty}</p><p class="text-[10px] text-white/40">IN: ${it.inboundId} | Scanned: ${it.scanned.length}/${it.qty}</p><div class="flex flex-wrap gap-1 mt-1">${it.scanned.map(c=>`<span class="bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full text-[9px]">${c}</span>`).join('')}</div></div><span>${it.scanned.length>=it.qty?'✅':'⏳'}</span></div>`).join('');
}
function renderScanned(){
  const totalNeeded = itemsNeedingScan.reduce((a,b)=>a+b.qty,0); const totalScanned = itemsNeedingScan.reduce((a,b)=>a+b.scanned.length,0);
  document.getElementById('scannedList').innerHTML = `<div class="bg-[#FFC300]/20 border border-[#FFC300]/30 rounded-xl p-2 text-xs text-center">মোট: <b>${totalScanned}/${totalNeeded}</b></div>${itemsNeedingScan.map(it=>it.scanned.map(c=>`<div class="flex justify-between bg-white/5 px-2 py-1 rounded-full text-[10px] mt-1"><span>${it.size} - ${c}</span><button onclick="removeSerial('${c}')" class="text-red-400">✕</button></div>`).join('')).join('')}`;
}
function addSerial(code){ code=code.trim().toUpperCase(); if(!code) return; if(itemsNeedingScan.some(it=>it.scanned.includes(code))){ alert('Already scanned!'); return; } let added=false; for(let it of itemsNeedingScan){ if(it.scanned.length < it.qty){ it.scanned.push(code); added=true; break; } } if(!added){ alert('সব Scan হয়ে গেছে!'); return; } scannedBarcodes.push(code); renderItemsToScan(); renderScanned(); document.getElementById('serialInput').value=''; }
window.removeSerial=(code)=>{ for(let it of itemsNeedingScan){ const idx=it.scanned.indexOf(code); if(idx>=0){ it.scanned.splice(idx,1); break; } } scannedBarcodes = scannedBarcodes.filter(c=>c!==code); renderItemsToScan(); renderScanned(); }
async function updateSerialStatus(barcode, status){ const snap = await getDocs(collection(db, "inbounds")); for(const d of snap.docs){ const data = d.data(); let changed=false; const newSizes=(data.sizes||[]).map(sz=>{ const newSerials=(sz.serials||[]).map(se=>{ if(se.barcode===barcode){ changed=true; return {...se, status:status, soldAt: status==='sold'? new Date():null }; } return se; }); return {...sz, serials:newSerials}; }); if(changed){ await updateDoc(doc(db, "inbounds", d.id), { sizes:newSizes }); return true; } } return false; }
async function updateStatus(){
  if(!selectedOrderId) return; const ns=document.getElementById('newStatus').value; const orderRef=doc(db,"orders",selectedOrderId); const orderSnap=await getDoc(orderRef); if(!orderSnap.exists()) return alert('Order not found'); const orderData=orderSnap.data(); const prevStatus=(orderData.status||'').toLowerCase(); const totalNeeded = itemsNeedingScan.reduce((a,b)=>a+b.qty,0); const totalScanned = itemsNeedingScan.reduce((a,b)=>a+b.scanned.length,0);
  try{
    if(ns==='delivered' &&!['delivered','completed'].includes(prevStatus)){ if(totalScanned < totalNeeded) return alert(`সব Barcode স্ক্যান করুন! ${totalScanned}/${totalNeeded}`); for(let it of itemsNeedingScan){ for(let code of it.scanned) await updateSerialStatus(code, 'sold'); } }
    if(ns==='cancelled' && ['delivered','completed'].includes(prevStatus)){ for(let it of itemsNeedingScan){ for(let code of it.scanned) await updateSerialStatus(code, 'in'); } }
    const allBarcodes = itemsNeedingScan.flatMap(it=>it.scanned);
    await updateDoc(orderRef,{ status:ns, barcodes: allBarcodes,...(ns==='delivered' && {deliveredAt:new Date(), isPaid:true}),...(ns==='cancelled' && {cancelledAt:new Date()}) });
    alert(ns==='delivered'?`✅ ${totalScanned} Sold`:`Status ${ns}`); closeStatusModal(); closeOrderModal(); fetchAll();
  }catch(e){ alert('Error: '+e.message); }
}
function exportExcel(){ let csv="OrderID,Date,Name,Phone,Size,IN ID,Barcode,Base,Custom,Total,Status\n"; filteredOrders.forEach(o=>{ (o.items||[]).forEach(it=>{ const pls=getPlayersFromItem(it); const base=it.basePrice||it.price||0; const perC=it.customChargePerUnit||it.customCharge||0; if(pls.length>0){ pls.forEach(p=>{ csv+=`"${o.id}","${formatDate(o.createdAt)}","${o.customer?.name}","${o.customer?.phone}","${p.size}","${getInId(it)}","${it.barcode||''}","${base}","${perC}","${o.total}","${o.status}"\n`; }); } else { csv+=`"${o.id}","${formatDate(o.createdAt)}","${o.customer?.name}","${o.customer?.phone}","${it.selectedSize||''}","${getInId(it)}","${it.barcode||''}","${base}","${perC}","${o.total}","${o.status}"\n`; } }); }); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='ks-orders-full.csv'; a.click(); }
function openScanner(){ document.getElementById('scannerModal').classList.remove('hidden'); html5Qr=new Html5Qrcode("reader"); html5Qr.start({facingMode:"environment"}, {fps:10, qrbox:{width:250, height:100}}, (decoded)=>{ addSerial(decoded); }, ()=>{}); }
function closeScanner(){ if(html5Qr){ html5Qr.stop().then(()=>{ html5Qr.clear(); html5Qr=null; }).catch(()=>{}); } document.getElementById('scannerModal').classList.add('hidden'); }

window.addEventListener('customFilter', (e)=>{
  currentCustomFilter = e.detail;
  applyFilters();
});

document.getElementById('monthFilter')?.addEventListener('change',applyMonthFilter);
document.getElementById('yearFilter')?.addEventListener('change',applyMonthFilter);
document.getElementById('resetMonthBtn')?.addEventListener('click',resetMonth);
document.getElementById('filterBtn')?.addEventListener('click',applyFilters);
document.getElementById('searchInput')?.addEventListener('input',applyFilters);
document.getElementById('closeModalBtn')?.addEventListener('click',closeStatusModal);
document.getElementById('updateStatusBtn')?.addEventListener('click',updateStatus);
document.getElementById('newStatus')?.addEventListener('change',toggleSerialArea);
document.getElementById('addSerialBtn')?.addEventListener('click',()=> addSerial(document.getElementById('serialInput').value));
document.getElementById('serialInput')?.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); addSerial(e.target.value); } });
document.getElementById('openScannerBtn')?.addEventListener('click',openScanner);
document.getElementById('closeScanner')?.addEventListener('click',closeScanner);
window.applyMonthFilter=applyMonthFilter; window.resetMonth=resetMonth; window.applyFilters=applyFilters; window.exportExcel=exportExcel; window.updateStatus=updateStatus;
