import { db, auth } from "./firebase.js";
import { collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let allCategories = [];
let categoryProducts = {};
let selectedCat = "All";
let selectedStock = null;
let html5QrCode = null;

const urlParams = new URLSearchParams(window.location.search);
const editId = urlParams.get('id');
const editCat = urlParams.get('cat');
const isEditMode =!!(editId && editCat);

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "admin-login.html";
  const snap = await getDoc(doc(db, "admins", user.uid));
  if (!snap.exists()) return location.href = "admin-login.html";
  document.body.classList.remove('hidden');

  if(isEditMode){
    document.querySelector('h1').innerText = "✏️ প্রোডাক্ট এডিট";
    const btn = document.getElementById('saveBtn');
    if(btn) btn.innerText = "💾 আপডেট করুন";
    loadEditProduct();
  } else {
    loadFromInbound();
  }
});

async function loadEditProduct(){
  try{
    let snap = null;
    let foundRef = null;
    try{
      const ref1 = doc(db, `products/${editCat}/live`, editId);
      snap = await getDoc(ref1);
      if(snap.exists()) foundRef = ref1;
    } catch(e){}
    if(!snap ||!snap.exists()){
      try{
        const ref2 = doc(db, `products_live`, editId);
        snap = await getDoc(ref2);
        if(snap.exists()) foundRef = ref2;
      } catch(e){}
    }
    if(!snap ||!snap.exists()){
      alert(`প্রোডাক্ট পাওয়া যায়নি!\nCat: ${editCat}\nID: ${editId}`);
      return;
    }
    const p = snap.data();
    selectedStock = {_catId: editCat, id: editId, _ref: foundRef,...p};
    document.getElementById('categoryTabs').innerHTML = `<span class="bg-[#FFC300] text-black px-4 py-2 rounded-full text-xs font-bold">📁 ${editCat} ফিল্ড এডিট</span>`;
    document.getElementById('productGrid').innerHTML = `<div class="bg-[#FFC300]/10 border border-[#FFC300]/20 rounded-2xl p-3 flex gap-3"><img src="${p.imageUrl||p.image||''}" class="w-16 h-16 rounded-xl bg-black object-contain"><div><p class="font-bold text-sm">${p.name}</p><p class="text-xs text-white/40">${editCat}</p><p class="text-xs text-green-400">✅ লোড হয়েছে</p></div></div>`;
    showPreview(p);
    document.getElementById('price').value = p.price||'';
    document.getElementById('comparePrice').value = p.comparePrice||'';
    document.getElementById('description').value = p.description||'';
    const feat = document.getElementById('isFeatured'); if(feat) feat.checked =!!p.isFeatured;
    const banner = document.getElementById('isBanner'); if(banner) banner.checked =!!p.isBanner;
    const status = document.getElementById('status'); if(status) status.value = p.status||'active';
  } catch(e){ console.error(e); alert("Load Error: " + e.message); }
}

// ✅ শুধু inbounds থেকে লোড
async function loadFromInbound() {
  try {
    const q = query(collection(db, "inbounds"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    allCategories = [];
    categoryProducts = {};
    snap.forEach(d => {
      const data = { id: d.id,...d.data() };
      data.name = data.productName || data.name;
      data._catId = data.category;
      data.totalQty = data.totalQty || 0;
      data.styleNo = data.styleNo || "";
      data.inId = data.inId || data.inboundId || d.id;
      if (!categoryProducts[data.category]) {
        categoryProducts[data.category] = [];
        allCategories.push(data.category);
      }
      categoryProducts[data.category].push(data);
    });
    renderTabs();
    renderGrid();
    const el = document.getElementById('totalCatCount'); if(el) el.innerText = `${allCategories.length} টা ক্যাটাগরি - ${Object.values(categoryProducts).flat().length} টা প্রোডাক্ট`;
  } catch (e) {
    console.error(e);
    const grid = document.getElementById('productGrid');
    if(grid) grid.innerHTML = `<p class="text-red-400 text-sm p-4">Error: ${e.message}</p>`;
  }
}

function renderTabs() {
  const container = document.getElementById('categoryTabs'); if(!container) return;
  const allCount = Object.values(categoryProducts).flat().length;
  let html = `<button data-cat="All" class="cat-tab ${selectedCat==='All'?'bg-[#FFC300] text-black border-[#FFC300]':'bg-[#121212] text-white border-white/10'} border px-4 py-2 rounded-full text-xs font-bold">All (${allCount})</button>`;
  allCategories.forEach(cat => {
    const count = (categoryProducts[cat]||[]).length;
    const active = selectedCat===cat? 'bg-[#FFC300] text-black border-[#FFC300]' : 'bg-[#121212] text-white border-white/10';
    html += `<button data-cat="${cat}" class="cat-tab ${active} border px-4 py-2 rounded-full text-xs font-bold">${cat} (${count})</button>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.cat-tab').forEach(b => {
    b.addEventListener('click', () => { selectedCat = b.dataset.cat; renderTabs(); renderGrid(); });
  });
}

function renderGrid() {
  if(isEditMode) return;
  const search = (document.getElementById('productSearch')?.value||'').toLowerCase();
  const grid = document.getElementById('productGrid'); if(!grid) return;
  let list = selectedCat==="All"? Object.values(categoryProducts).flat() : (categoryProducts[selectedCat]||[]);

  // ✅ IN ID / Style No / Name / Category দিয়ে সার্চ
  if(search){
    list = list.filter(p =>
      (p.name||'').toLowerCase().includes(search) ||
      (p._catId||'').toLowerCase().includes(search) ||
      (p.styleNo||'').toLowerCase().includes(search) ||
      (p.inId||'').toLowerCase().includes(search)
    );
  }

  if(list.length===0) { grid.innerHTML = `<div class="col-span-2 text-center py-10"><p class="text-white/30 text-sm">কোনো প্রোডাক্ট পাওয়া যায়নি<br>IN ID বা Style No দিয়ে খুঁজুন</p></div>`; return; }
  grid.innerHTML = "";
  list.slice(0, 200).forEach(p => {
    const isSelected = selectedStock && selectedStock.id===p.id;
    const div = document.createElement('div');
    div.dataset.id = `${p._catId}__${p.id}`;
    div.className = `product-card ${isSelected?'border-[#FFC300] bg-[#FFC300]/10':'border-white/10 bg-[#121212]'} border rounded-2xl p-3 flex gap-3 cursor-pointer hover:border-[#FFC300]/50`;
    div.innerHTML = `
      <img src="${p.imageUrl||''}" class="w-16 h-16 rounded-xl object-contain bg-black border border-white/10">
      <div class="flex-1 min-w-0">
        <p class="font-bold text-sm truncate">${p.name}</p>
        <div class="flex gap-1 mt-1 flex-wrap">
          <span class="text- bg-[#FFC300] text-black px-2 py-0.5 rounded-full font-bold">📁 ${p._catId}</span>
          <span class="text- bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">🎨 ${p.styleNo||'No Style'}</span>
          <span class="text- bg-white/10 text-white/60 px-2 py-0.5 rounded-full font-mono">🆔 ${p.inId?.substring(0,12)||''}</span>
        </div>
        <p class="text-xs text-white/50 mt-1">🎨 ${(p.colors||[]).slice(0,2).join(', ')} | ${p.totalQty||0} pcs | ৳${p.buyPrice} | 📦 ${p.rack||'No Rack'}</p>
      </div>
    `;
    div.addEventListener('click', () => {
      selectedStock = p;
      grid.querySelectorAll('.product-card').forEach(c=>{ c.classList.remove('border-[#FFC300]','bg-[#FFC300]/10'); c.classList.add('border-white/10','bg-[#121212]'); });
      div.classList.remove('border-white/10','bg-[#121212]');
      div.classList.add('border-[#FFC300]','bg-[#FFC300]/10');
      showPreview(p);
    });
    grid.appendChild(div);
  });
}

function showPreview(p) {
  if(!p) return;
  document.getElementById('stockPreview')?.classList.remove('hidden');
  document.getElementById('previewStockImg').src = p.imageUrl||p.image||'https://via.placeholder.com/80';
  document.getElementById('previewStockName').innerText = p.name||p.productName||'';
  document.getElementById('previewStockCat').innerText = (p._catId||editCat) + " | Style: " + (p.styleNo||'N/A') + " | IN: " + (p.inId||'').substring(0,12);
  document.getElementById('previewStockQty').innerText = p.totalQty||0;
  document.getElementById('previewStockBuy').innerText = `৳${p.buyPrice||0}/pc`;
  document.getElementById('previewStockInfo').innerText = `🎨 ${(p.colors||[]).join(', ')} | 📦 ${p.rack||''}`;
  document.getElementById('autoName').innerText = p.name||'';
  document.getElementById('autoCat').innerText = p._catId||editCat||'';
  document.getElementById('autoBuy').innerText = `৳${p.buyPrice||0}`;
  document.getElementById('autoQty').innerText = `${p.totalQty||0} pcs | Style: ${p.styleNo||''} | IN: ${p.inId||''}`;
  document.getElementById('autoColors').innerText = (p.colors||[]).join(', ') || 'N/A';
  document.getElementById('autoSizes').innerText = (p.sizes||[]).map(s=>`${s.size}:${s.qty}`).join(', ') || 'N/A';
}

document.getElementById('productSearch')?.addEventListener('input', renderGrid);

// ✅ BARCODE SCANNER
const scanBtn = document.getElementById('scanBarcodeBtn');
const scannerModal = document.getElementById('scannerModal');
const closeScanner = document.getElementById('closeScanner');
const manualInput = document.getElementById('manualBarcodeInput');
const manualSearchBtn = document.getElementById('manualSearchBtn');

function onScanSuccess(decodedText){
  if(manualInput) manualInput.value = decodedText;
  document.getElementById('productSearch').value = decodedText;
  renderGrid();
  stopScanner();
  if(scannerModal) scannerModal.classList.add('hidden');
}

async function startScanner(){
  if(!scannerModal) return;
  scannerModal.classList.remove('hidden');
  html5QrCode = new Html5Qrcode("reader");
  try{
    await html5QrCode.start({facingMode:"environment"}, {fps:10, qrbox:{width:250, height:250}}, onScanSuccess, ()=>{});
  }catch(e){ console.log(e); }
}
async function stopScanner(){
  if(html5QrCode){
    try{ await html5QrCode.stop(); html5QrCode.clear(); }catch(e){}
    html5QrCode = null;
  }
}
if(scanBtn){ scanBtn.addEventListener('click', startScanner); }
if(closeScanner){ closeScanner.addEventListener('click', ()=>{ stopScanner(); scannerModal.classList.add('hidden'); }); }
if(manualSearchBtn){
  manualSearchBtn.addEventListener('click', ()=>{
    const val = manualInput.value.trim() || document.getElementById('productSearch').value;
    document.getElementById('productSearch').value = val;
    renderGrid();
    stopScanner();
    scannerModal.classList.add('hidden');
  });
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const price = document.getElementById('price').value;
  if (!price) return alert("বিক্রি দাম দিন");
  const btn = document.getElementById('saveBtn');
  const status = document.getElementById('uploadStatus');
  btn.disabled = true;
  btn.innerText = isEditMode? "আপডেট হচ্ছে..." : "পাবলিশ হচ্ছে...";
  if(status){ status.classList.remove('hidden'); status.innerText = isEditMode? "আপডেট হচ্ছে..." : `${selectedStock?._catId} ফিল্ড থেকে পাবলিশ হচ্ছে...`; }
  try {
    const common = {
      price: Number(price),
      comparePrice: Number(document.getElementById('comparePrice')?.value || 0),
      description: document.getElementById('description')?.value.trim() || "",
      isFeatured: document.getElementById('isFeatured')?.checked || false,
      isBanner: document.getElementById('isBanner')?.checked || false,
      status: document.getElementById('status')?.value || "active",
      updatedAt: new Date()
    };
    if(isEditMode){
      await updateDoc(doc(db, `products/${editCat}/live`, editId), common);
      try{
        const allLive = await getDocs(collection(db, "products_live"));
        for(let d of allLive.docs){
          if(d.data().name === selectedStock?.name && d.data().category === editCat){
            await updateDoc(doc(db, "products_live", d.id), common);
          }
        }
      } catch(e){ console.log("products_live update skip", e); }
      alert(`✅ ${editCat} ফিল্ডে আপডেট হয়েছে!`);
      location.href = "products.html";
      return;
    }
    if (!selectedStock) { alert("প্রোডাক্ট সিলেক্ট করুন!"); btn.disabled=false; btn.innerText="🚀 পাবলিশ করুন"; return; }
    const payload = {
      name: selectedStock.name,
      category: selectedStock._catId,
      categoryField: selectedStock._catId,
      imageUrl: selectedStock.imageUrl,
      images: [selectedStock.imageUrl],
      colors: selectedStock.colors || [],
      sizes: selectedStock.sizes || [],
      totalStock: selectedStock.totalQty || 0,
      buyPrice: selectedStock.buyPrice || 0,
      styleNo: selectedStock.styleNo || "",
      inId: selectedStock.inId || "",
      stockRef: `inbounds/${selectedStock.id}`,
     ...common,
      createdAt: new Date()
    };
    await addDoc(collection(db, `products_live`), payload);
    await setDoc(doc(db, `products/${payload.category}`), { categoryName: payload.category, lastUpdated: new Date() }, { merge: true });
    await addDoc(collection(db, `products/${payload.category}/live`), payload);
    alert(`✅ ${payload.category} | Style: ${payload.styleNo} | IN: ${payload.inId} পাবলিশ হয়েছে!`);
    location.href = "products.html";
  } catch (e) {
    console.error(e);
    alert("Error: " + e.message);
    btn.disabled = false;
    btn.innerText = isEditMode? "💾 আপডেট করুন" : "🚀 পাবলিশ করুন";
  }
});
      
