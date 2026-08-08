import { db, auth } from "./firebase.js";
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentAdmin=null, inbounds=[], filtered=[], selectedInbound=null, selectedSizeData=null, productsMap={};
let customDesignUrl = "", customType = "jersey";
let customPlayers = [];
let deliveryType = "shop";
let html5QrCode = null;
let currentCategory = "jersey";

const CLOUDINARY_CLOUD = "dwxhgon31";
const CLOUDINARY_PRESET = "ksupload";

const CATEGORY_FORMS = {
  jersey: { label: "⚽ Jersey" }, tshirt: { label: "👕 T-Shirt" }, "t-shirt": { label: "👕 T-Shirt" },
  polo: { label: "👕 Polo" }, hoodie: { label: "🧥 Hoodie" }, cap: { label: "🧢 Cap" },
  mug: { label: "☕ Mug" }, combo: { label: "🎁 Combo Set" }, "combo set": { label: "🎁 Combo Set" },
  default: { label: "🎨 Custom" }
};

function getCategoryConfig(cat){
  const c = (cat||'').toLowerCase();
  if(CATEGORY_FORMS[c]) return CATEGORY_FORMS[c];
  if(c.includes('jersey')) return CATEGORY_FORMS.jersey;
  if(c.includes('hoodie')) return CATEGORY_FORMS.hoodie;
  if(c.includes('tshirt')||c.includes('t-shirt')||c.includes('polo')) return CATEGORY_FORMS.tshirt;
  if(c.includes('cap')) return CATEGORY_FORMS.cap;
  if(c.includes('mug')) return CATEGORY_FORMS.mug;
  if(c.includes('combo')) return CATEGORY_FORMS.combo;
  return CATEGORY_FORMS.default;
}

function renderCustomFormByCategory(cat){
  const config = getCategoryConfig(cat);
  currentCategory = cat;
  let html = `<div class="flex gap-2 mb-4 flex-wrap"><span class="bg-[#FFC300] text-black px-4 py-1.5 rounded-full text-xs font-black">${config.label}</span><span class="bg-white/10 text-white/50 px-3 py-1.5 rounded-full text-[10px]">Unlimited Scan + Manual</span></div>
  <div class="mb-4 bg-black border border-[#FFC300]/20 rounded-2xl px-4 py-3 flex justify-between items-center"><label class="text-xs font-black text-[#FFC300]">কাস্টম চার্জ /pc</label><div class="flex items-center gap-2"><span class="text-xs">৳</span><input id="customChargeInput" type="number" value="100" class="w-20 bg-[#080808] border border-white/10 rounded-full px-3 py-2 text-sm text-center font-black outline-none"></div></div>`;
  html += `<div class="mb-3"><label class="text-xs text-white/40">টিম / গ্রুপ নাম (ঐচ্ছিক)</label><input id="customTeam" placeholder="Dhaka Strikers" class="w-full mt-1 bg-black border border-white/10 rounded-full px-4 py-3 text-sm outline-none"></div>`;
  html += `<div class="space-y-3"><div class="grid grid-cols-2 gap-3"><div><label class="text-xs text-white/40">নাম</label><input id="customName" placeholder="ATIK" class="w-full mt-1 bg-black border border-white/10 rounded-full px-4 py-3 text-sm outline-none"></div><div><label class="text-xs text-white/40">নাম্বার</label><input id="customNumber" placeholder="10" class="w-full mt-1 bg-black border border-white/10 rounded-full px-4 py-3 text-sm outline-none"></div></div><button type="button" onclick="addPlayer()" class="bg-[#FFC300] text-black px-5 py-2.5 rounded-full text-xs font-black w-full">➕ নাম যোগ করুন (সব ক্যাটাগরি)</button><div id="playersList" class="mt-2 space-y-2 max-h-[180px] overflow-y-auto"></div></div>`;
  if(cat.toLowerCase().includes('mug')) html += `<div class="mt-3 grid grid-cols-2 gap-3"><div><label class="text-xs text-white/40">মগে লেখা</label><input id="customText" placeholder="Happy Birthday..." class="w-full mt-1 bg-black border border-white/10 rounded-full px-4 py-3 text-sm outline-none"></div><div><label class="text-xs text-white/40">কালার</label><input id="customMugColor" placeholder="White" class="w-full mt-1 bg-black border border-white/10 rounded-full px-4 py-3 text-sm outline-none"></div></div>`;
  if(cat.toLowerCase().includes('cap')) html += `<div class="mt-3"><label class="text-xs text-white/40">লোগো কোথায়</label><input id="customLogoText" placeholder="সামনে" class="w-full mt-1 bg-black border border-white/10 rounded-full px-4 py-3 text-sm outline-none"></div>`;
  html += `<div class="mt-3"><label class="text-xs text-white/40">নোট - কোথায় কি বসবে</label><textarea id="customNote" rows="2" class="w-full mt-1 bg-black border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none resize-none"></textarea></div>`;
  html += `<div class="mt-4"><label class="text-xs text-white/40">ডিজাইন / লোগো ছবি</label><input id="customFile" type="file" accept="image/*" class="w-full mt-2 bg-black border border-white/10 rounded-full px-4 py-3 text-xs"><p id="uploadStatus" class="text-xs text-[#FFC300] mt-2 hidden"></p><img id="customPreview" src="" class="hidden w-32 h-32 bg-white rounded-xl object-contain mt-3 border-2 border-[#FFC300]"></div>`;
  const container = document.getElementById('customFieldsContainer');
  if(container){ container.innerHTML = html; setTimeout(()=>{ document.getElementById('customChargeInput')?.addEventListener('input', calc); document.getElementById('customFile')?.addEventListener('change', handleFileUpload); renderPlayers(); calc(); },100); }
}

onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.href='admin-login.html'; return; }
  const snap = await getDoc(doc(db,"admins",user.uid));
  if(!snap.exists()){ location.href='admin-login.html'; return; }
  currentAdmin={uid:user.uid, role:snap.data().role||'owner', email:user.email||''};
  document.getElementById('loading').classList.add('hidden');
  document.body.classList.remove('hidden');
  loadData();
});

async function loadData(){
  try{ const prodSnap = await getDocs(collection(db,"products")); prodSnap.forEach(d=>{ productsMap[d.id.toLowerCase()] = d.id; }); }catch(e){}
  const snap=await getDocs(collection(db,"inbounds"));
  inbounds=snap.docs.map(d=>({id:d.id,...d.data()}));
  filtered=[...inbounds];
  renderList();
}

function getAvailableCount(sizeObj){ if(sizeObj.serials && Array.isArray(sizeObj.serials)) return sizeObj.serials.filter(s=>s.status==='in').length; return Number(sizeObj.qty||0); }

function renderList(){
  document.getElementById('prodCount').innerText=filtered.length;
  document.getElementById('productList').innerHTML=filtered.map(i=>{
    let totalAv=0; if(i.sizes) i.sizes.forEach(s=> totalAv+=getAvailableCount(s)); else totalAv=i.qty||0;
    return `<div onclick='selectInbound("${i.id}")' class="bg-[#080808] border border-white/10 rounded-2xl p-3 flex gap-3 items-center hover:border-[#FFC300]/40 cursor-pointer"><img src="${i.imageUrl||''}" class="w-12 h-12 rounded-xl object-cover bg-white"><div class="flex-1 min-w-0"><p class="font-bold text-sm truncate">${i.productName||'No Name'}</p><p class="text-xs text-white/40 truncate">${i.category||''} • ${i.inId||''} • Rack:${i.rack||''} • Av:${totalAv}</p></div><span class="text-xs bg-[#FFC300]/20 text-[#FFC300] px-3 py-1 rounded-full font-black">Select →</span></div>`;
  }).join('');
}

document.getElementById('startScanBtn').onclick = () => {
  const readerDiv = document.getElementById('reader');
  readerDiv.classList.toggle('hidden');
  if(!readerDiv.classList.contains('hidden')){
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 100 } },
      (decodedText) => {
        const t = decodedText.trim(); let found=null;
        for(let inbound of inbounds){ if(inbound.sizes){ for(let sz of inbound.sizes){ if(sz.serials && sz.serials.some(s=>s.barcode===t)){ found=inbound; break; } } } if(found) break; if(inbound.inId===t) found=inbound; }
        if(found){ selectInbound(found.id); Swal.fire({icon:'success', background:'#121212', color:'#fff', title:'পাওয়া গেছে!', timer: 1000, showConfirmButton: false}); html5QrCode.stop(); readerDiv.classList.add('hidden'); }
      }, ()=>{}
    );
  } else { if(html5QrCode) html5QrCode.stop(); }
};

document.getElementById('productSearch').addEventListener('input',(e)=>{
  const q=e.target.value.toLowerCase();
  filtered=!q? [...inbounds] : inbounds.filter(i=> (i.productName||'').toLowerCase().includes(q) || (i.inId||'').toLowerCase().includes(q) || (i.styleNo||'').toLowerCase().includes(q) || JSON.stringify(i.sizes||[]).toLowerCase().includes(q));
  renderList();
});

window.selectInbound=(id)=>{
  selectedInbound=inbounds.find(x=>x.id===id);
  document.getElementById('selImg').src=selectedInbound.imageUrl||'';
  document.getElementById('selName').innerText=selectedInbound.productName||'';
  document.getElementById('selInfo').innerText=`${selectedInbound.category||''} • ${selectedInbound.inId||''} • Rack:${selectedInbound.rack||''}`;
  let prodCat = (selectedInbound.category||'').toLowerCase();
  document.getElementById('autoCat').innerText = prodCat? `Category: ${prodCat}` : '';
  document.getElementById('formArea').classList.remove('hidden');
  document.getElementById('buyPrice').value=selectedInbound.buyPrice||0;
  document.getElementById('sellPrice').value=Number(selectedInbound.buyPrice||0)+150;
  const sizes=selectedInbound.sizes||[];
  const sizeSelect=document.getElementById('sizeSelect');
  if(sizes.length>0){ sizeSelect.innerHTML=sizes.map(s=>{ let av=getAvailableCount(s); return `<option value="${s.size}" data-qty="${av}">${s.size} - ${av} pcs</option>`; }).join(''); updateStock(); }
  customPlayers=[]; customDesignUrl="";
  renderCustomFormByCategory(prodCat || 'jersey');
  calc();
  document.getElementById('formArea').scrollIntoView({behavior:'smooth'});
};

window.clearProduct=()=>{ selectedInbound=null; selectedSizeData=null; customPlayers=[]; document.getElementById('formArea').classList.add('hidden'); };
document.getElementById('sizeSelect').addEventListener('change',updateStock);

function updateStock(){
  const sel=document.getElementById('sizeSelect')?.selectedOptions[0];
  if(sel) document.getElementById('stockQty').innerText=(sel.dataset.qty||0)+' pcs';
  const sizeVal = document.getElementById('sizeSelect').value;
  selectedSizeData = selectedInbound?.sizes?.find(s=>s.size===sizeVal) || selectedInbound?.sizes?.[0] || null;
  calc();
}
function calc(){
  const qtyEl = document.getElementById('qty');
  let qty = Number(qtyEl?.value||1);
  if(qty<1) qty=1;
  if(document.getElementById('isCustomCheck')?.checked && customPlayers.length > qty){
    qty = customPlayers.length;
    qtyEl.value = qty;
  }
  const sell=Number(document.getElementById('sellPrice').value||0);
  const buy=Number(document.getElementById('buyPrice').value||0);
  const paid=Number(document.getElementById('paidAmt').value||0);
  const isCustom=document.getElementById('isCustomCheck')?.checked||false;
  const chargePerPc=Number(document.getElementById('customChargeInput')?.value||0);
  const deliveryCharge=deliveryType==='home'? Number(document.getElementById('deliveryCharge')?.value||0):0;
  const customCharge=isCustom? chargePerPc*qty:0;
  const productTotal=qty*sell;
  const grandTotal=productTotal+customCharge+deliveryCharge;
  const totalEl=document.getElementById('totalPrice');
  if(totalEl) totalEl.innerHTML=`৳${grandTotal} <span class="text-xs text-white/40">${isCustom? `(প্রো ${productTotal}৳ + কাস্টম ${customCharge}৳)` : ''} ${deliveryCharge>0? `+ ডেলি ${deliveryCharge}৳`:''}</span>`;
  if(document.getElementById('profitAmt')) document.getElementById('profitAmt').innerText='৳'+((sell-buy)*qty + customCharge);
  if(document.getElementById('dueAmt')) document.getElementById('dueAmt').innerText='৳'+Math.max(0,grandTotal-paid);
  return { productTotal, customCharge, deliveryCharge, grandTotal, qty, chargePerPc };
}

document.addEventListener('input',(e)=>{ if(['qty','sellPrice','paidAmt','deliveryCharge'].includes(e.target.id)) calc(); });
document.addEventListener('click',(e)=>{
  const btn=e.target.closest('.del-btn'); if(!btn) return;
  deliveryType=btn.dataset.del;
  document.querySelectorAll('.del-btn').forEach(b=>{ b.className=b.dataset.del===deliveryType? 'del-btn w-full bg-[#FFC300] text-black py-3 rounded-full text-xs font-black':'del-btn w-full bg-white/10 text-white py-3 rounded-full text-xs font-bold'; });
  document.getElementById('deliveryFields')?.classList.toggle('hidden', deliveryType!=='home'); calc();
});
document.getElementById('halfPayBtn').onclick=()=>{ const { grandTotal }=calc(); document.getElementById('paidAmt').value=Math.round(grandTotal/2); calc(); };
document.getElementById('isCustomCheck').addEventListener('change',(e)=>{ document.getElementById('customFieldsContainer').classList.toggle('hidden',!e.target.checked); document.getElementById('customArea').classList.toggle('hidden',!e.target.checked); calc(); });

window.addPlayer=()=>{
  const name=document.getElementById('customName')?.value.trim()||'';
  const number=document.getElementById('customNumber')?.value.trim()||'';
  const size=document.getElementById('sizeSelect').value||'M';
  const team=document.getElementById('customTeam')?.value.trim()||'';
  if(!name &&!number){ Swal.fire({icon:'warning', background:'#121212', color:'#fff', title:'নাম বা নাম্বার দিন'}); return; }
  customPlayers.push({ name:name||'No Name', number:number||'', size:size, teamName:team||'', note:document.getElementById('customNote')?.value||'', category:currentCategory });
  document.getElementById('customName').value=''; document.getElementById('customNumber').value='';
  renderPlayers();
  const currentQty = Number(document.getElementById('qty').value||1);
  if(customPlayers.length > currentQty) document.getElementById('qty').value = customPlayers.length;
  calc();
};
  function renderPlayers(){
  const list=document.getElementById('playersList'); if(!list) return;
  if(customPlayers.length===0){ list.innerHTML='<p class="text-xs text-white/30 text-center py-2">কোনো নাম নেই</p>'; return; }
  list.innerHTML=customPlayers.map((p,i)=>`<div class="flex justify-between items-center bg-black border border-white/10 rounded-full px-4 py-2 text-xs"><span>${i+1}. ${p.name} ${p.number? '#'+p.number:''} (${p.size})</span><button onclick="removePlayer(${i})" class="w-6 h-6 bg-red-500/20 text-red-400 rounded-full">✕</button></div>`).join('');
}

window.removePlayer=(idx)=>{ customPlayers.splice(idx,1); renderPlayers(); calc(); };

async function handleFileUpload(e){
  const file=e.target.files[0]; if(!file) return;
  const status=document.getElementById('uploadStatus'); status.classList.remove('hidden'); status.innerText="আপলোড হচ্ছে...";
  const reader=new FileReader(); reader.onload=(ev)=>{ document.getElementById('customPreview').src=ev.target.result; document.getElementById('customPreview').classList.remove('hidden'); customDesignUrl=ev.target.result; }; reader.readAsDataURL(file);
  try{ const fd=new FormData(); fd.append('file', file); fd.append('upload_preset', CLOUDINARY_PRESET); const res=await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {method:'POST', body:fd}); const data=await res.json(); if(data.secure_url){ customDesignUrl=data.secure_url; status.innerText="✅ সেভ হয়েছে"; status.className="text-xs text-green-400 mt-2"; } else { status.innerText="⚠️ Error - Local দিয়েই হবে"; } }catch(err){ status.innerText="⚠️ Net Error - Local দিয়েই হবে"; }
}

document.getElementById('placeOrderBtn').onclick = async () => {
  if(!selectedInbound){ Swal.fire({icon:'warning', background:'#121212', color:'#fff', title:'প্রোডাক্ট সিলেক্ট করুন'}); return; }
  const { qty } = calc();
  let scannedBarcodes=[]; let html5Scanner=null;
  let currentQty = qty;

  Swal.fire({
    title: `📦 ${qty} টা - Scan বা Manual`,
    html: `
      <div class="text-left">
        <p class="text-xs text-white/60 mb-2">Size: <b class="text-[#FFC300]">${document.getElementById('sizeSelect').value}</b> | Qty: <b>${qty}</b> | Done: <b id="scanCount" class="text-green-400">0</b>/${qty}</p>
        <div class="flex gap-2 mb-3">
          <input id="manualBarcodeInput" placeholder="Serial লিখে Enter..." class="flex-1 bg-black border border-white/20 rounded-full px-4 py-2.5 text-sm outline-none focus:border-[#FFC300] text-white">
          <button type="button" id="addManualBtn" class="bg-[#FFC300] text-black px-5 py-2.5 rounded-full text-xs font-black">Add +</button>
        </div>
        <div id="swal-scanner" style="width:100%;max-width:320px;margin:auto;border-radius:16px;overflow:hidden;border:2px solid #FFC300"></div>
        <div class="mt-3 bg-[#080808] rounded-xl p-2">
          <p class="text-[10px] text-white/40 mb-1">Available Click to Add:</p>
          <div id="availableSerials" class="max-h-[100px] overflow-y-auto flex flex-wrap gap-1"></div>
        </div>
        <div id="scannedList" class="mt-3 max-h-[150px] overflow-y-auto bg-black/50 rounded-xl p-2 text-xs space-y-1"></div>
        <p id="scanMsg" class="text-xs mt-2"></p>
      </div>
    `,
    background: '#121212', color: '#fff', width: '95%',
    showCancelButton: true, cancelButtonText: 'বাতিল', confirmButtonText: `✅ Confirm Sell`, confirmButtonColor: '#FFC300',
    didOpen: () => {
      const availableDiv = document.getElementById('availableSerials');
      let allAvailable = [];
      if(selectedInbound?.sizes){
        selectedInbound.sizes.forEach(sz=>{ (sz.serials||[]).forEach(s=>{ if(s.status==='in') allAvailable.push(s.barcode); }); });
      }
      availableDiv.innerHTML = allAvailable.slice(0,50).map(b=> `<button type="button" onclick="window.addManualCode('${b}')" class="bg-white/10 border border-white/10 rounded-full px-2.5 py-1 text-[10px] text-white hover:bg-[#FFC300]/30">${b}</button>`).join('') || '<span class="text-[10px] text-red-400">Stock নেই!</span>';

      const addCode = (code) => {
        code = (code||'').trim(); if(!code) return;
        const msgEl=document.getElementById('scanMsg'), countEl=document.getElementById('scanCount'), listEl=document.getElementById('scannedList');
        if(scannedBarcodes.includes(code)){ msgEl.innerText=`❌ ${code} আগেই আছে!`; msgEl.className="text-xs text-red-400 mt-2"; return; }
        let isValid = false;
        if(selectedInbound?.sizes){ for(let sz of selectedInbound.sizes){ if(sz.serials?.some(s=>s.barcode===code && s.status==='in')){ isValid=true; break; } } }
        if(!isValid){ msgEl.innerText=`❌ ${code} Available নেই!`; msgEl.className="text-xs text-red-400 mt-2"; return; }
        if(scannedBarcodes.length>=currentQty){ msgEl.innerText=`⚠️ ${currentQty} টা হয়ে গেছে`; msgEl.className="text-xs text-yellow-400 mt-2"; return; }
        scannedBarcodes.push(code);
        msgEl.innerText=`✅ ${code} Added`; msgEl.className="text-xs text-green-400 mt-2";
        countEl.innerText=scannedBarcodes.length;
        listEl.innerHTML=scannedBarcodes.map((b,i)=>`<div class="bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1.5 flex justify-between text-white"><span>${i+1}. ${b}</span><button type="button" onclick="window.removeScanned('${b}')" class="text-red-400">✕</button></div>`).join('');
        document.getElementById('manualBarcodeInput').value='';
        if(navigator.vibrate) navigator.vibrate(100);
      };

      window.addManualCode = addCode;
      window.removeScanned = (code)=>{ scannedBarcodes=scannedBarcodes.filter(b=>b!==code); document.getElementById('scanCount').innerText=scannedBarcodes.length; document.getElementById('scannedList').innerHTML=scannedBarcodes.map((b,i)=>`<div class="bg-green-500/10 rounded-full px-3 py-1.5 flex justify-between text-white"><span>${i+1}. ${b}</span><button type="button" onclick="window.removeScanned('${b}')" class="text-red-400">✕</button></div>`).join(''); };

      document.getElementById('addManualBtn').onclick = ()=> addCode(document.getElementById('manualBarcodeInput').value);
      document.getElementById('manualBarcodeInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); addCode(e.target.value); } });

      try{ html5Scanner=new Html5Qrcode("swal-scanner"); html5Scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 100 } }, (decodedText)=> addCode(decodedText), ()=>{}).catch(()=>{}); }catch(e){}
    },
    willClose: async()=>{ try{ if(html5Scanner){ await html5Scanner.stop(); await html5Scanner.clear(); } }catch(e){} },
    preConfirm: ()=>{
      if(scannedBarcodes.length!==currentQty){ Swal.showValidationMessage(`Qty ${currentQty} কিন্তু Scanned ${scannedBarcodes.length} টা!`); return false; }
      return scannedBarcodes;
    }
  }).then(async (result)=>{
    if(result.isConfirmed && result.value && result.value.length>0){
      await processAndSaveOrder(result.value);
    }
  });
};

async function processAndSaveOrder(scannedBarcodes=[]){
  if(!scannedBarcodes.length){ Swal.fire({icon:'error', background:'#121212', color:'#fff', title:'Barcode নেই!'}); return; }
  const name=document.getElementById('cName').value.trim()||"Walk-in Customer";
  const phone=document.getElementById('cPhone').value.trim()||"N/A";
  const address=document.getElementById('cAddress')?.value.trim()||"";
  const area=document.getElementById('cArea')?.value.trim()||"";
  const size=document.getElementById('sizeSelect').value||'Free';
  const { productTotal, customCharge, deliveryCharge, grandTotal, chargePerPc } = calc();
  const sellPrice=Number(document.getElementById('sellPrice').value||0);
  const buyPrice=Number(document.getElementById('buyPrice').value||0);
  const paid=Number(document.getElementById('paidAmt').value||0);
  const payMethod=document.getElementById('payMethod').value||'cash';
  const note=document.getElementById('note').value.trim()||'';
  const isCustom=document.getElementById('isCustomCheck').checked;
  let customObj=null;
  if(isCustom){ customObj={ type: currentCategory, category: currentCategory, teamName: document.getElementById('customTeam')?.value||'', designUrl: customDesignUrl||'', designImageUrl: customDesignUrl||'', chargePerPc, note: document.getElementById('customNote')?.value||'', players: customPlayers, items: customPlayers }; }

  try{
    const invoiceNo='INV-'+Date.now().toString().slice(-6);
    const due=Math.max(0,grandTotal-paid);

    // ✅ FINAL FIX: Delivery Charge Root + Customer + Items সব জায়গায় Save হবে
    const manualData={
      invoiceNo,
      deliveryCharge: deliveryCharge,
      deliveryType: deliveryType,
      customCharge: customCharge,
      chargePerPc: chargePerPc,
      subTotal: productTotal,
      total: grandTotal,

      customer:{ name, phone, address: deliveryType==='home'? (address||"N/A"):"Shop Pickup", area, deliveryType, deliveryCharge },
      custName:name, custPhone:phone,

      items:[{
        productName:selectedInbound.productName, price:sellPrice, buyPrice, size, qty:scannedBarcodes.length, quantity:scannedBarcodes.length,
        imageUrl:selectedInbound.imageUrl||'', inboundId:selectedInbound.id, inId:selectedInbound.inId||'', styleNo:selectedInbound.styleNo||'', rack:selectedInbound.rack||'', category:currentCategory,
        barcode:scannedBarcodes[0]||'', barcodes:scannedBarcodes, isCustom, customCharge, chargePerPc, custom:customObj, designUrl:customDesignUrl||'', designImageUrl:customDesignUrl||'',
        deliveryCharge: deliveryCharge, deliveryType: deliveryType
      }],

      barcodes:scannedBarcodes, isCustom, category:currentCategory,
      paid, due, profit:(sellPrice-buyPrice)*scannedBarcodes.length + customCharge,
      paymentMethod:payMethod, note, status:due<=0? 'completed':'due', type:'offline',
      date:new Date().toISOString().split('T')[0], timestamp:Date.now(), createdAt:serverTimestamp(), soldBy:currentAdmin.uid,
    };

    const docRef=await addDoc(collection(db,'manual_sales'), manualData);

    try{
      let sizes=JSON.parse(JSON.stringify(selectedInbound.sizes||[]));
      sizes.forEach(sz=>{
        if(sz.serials){
          sz.serials.forEach(s=>{
            if(scannedBarcodes.includes(s.barcode) && s.status==='in'){ s.status='sold'; s.soldAt=new Date().toISOString(); s.soldBy=currentAdmin.uid; }
          });
          sz.qty = String(sz.serials.filter(x=>x.status==='in').length);
        }
      });
      const newTotal=sizes.reduce((a,b)=> a + (b.serials? b.serials.filter(x=>x.status==='in').length : Number(b.qty||0)), 0);
      await updateDoc(doc(db,"inbounds",selectedInbound.id), {sizes, qty:newTotal, totalQty:newTotal, updatedAt:serverTimestamp()});
    }catch(e){ console.log("stock minus err", e); }

    Swal.fire({icon:'success', background:'#121212', color:'#fff', title:'✅ সেভ হয়েছে', html:`${invoiceNo}<br>৳${grandTotal}<br>Delivery: ৳${deliveryCharge}<br>Barcodes: ${scannedBarcodes.join(', ')}`, confirmButtonColor:'#FFC300'}).then(()=>{ location.href=`invoice.html?id=${docRef.id}`; });

  }catch(e){ Swal.fire({icon:'error', background:'#121212', color:'#fff', title:'Error', text:e.message}); }
};
        
