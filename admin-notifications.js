import { db, auth } from "./firebase.js";
import { collection, getDocs, doc, getDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "admin-login.html";
  const snap = await getDoc(doc(db, "admins", user.uid));
  if (!snap.exists()) { await signOut(auth); return location.href = "admin-login.html"; }
  document.body.classList.remove('hidden');
  document.getElementById('loading')?.classList.add('hidden');
  init();
});

async function init(){
  loadStats();
  loadHistory();
  setupPreview();
}

function setupPreview(){
  const titleEl=document.getElementById('notifTitle');
  const bodyEl=document.getElementById('notifBody');
  const previewBox=document.getElementById('previewBox');
  const prevTitle=document.getElementById('prevTitle');
  const prevBody=document.getElementById('prevBody');
  const update=()=>{
    if(titleEl.value||bodyEl.value){
      previewBox.classList.remove('hidden');
      prevTitle.innerText=titleEl.value||'Title';
      prevBody.innerText=bodyEl.value||'Message';
    }else previewBox.classList.add('hidden');
  };
  titleEl.addEventListener('input',update);
  bodyEl.addEventListener('input',update);
}

window.useTemplate=(type)=>{
  const t=document.getElementById('notifTitle');
  const b=document.getElementById('notifBody');
  const ty=document.getElementById('notifType');
  if(type==='new'){ t.value='🔥 New Drop Alert!'; b.value='Zevi Hub এ নতুন Tranding Hoodie চলে এসেছে। এখনই অর্ডার করুন, Stock শেষ হওয়ার আগে!'; ty.value='new'; }
  if(type==='offer'){ t.value='💰 50% OFF - আজকের জন্য!'; b.value='আজ রাত 12 টা পর্যন্ত সব প্রোডাক্টে 50% ছাড়! Coupon: EID50'; ty.value='promo'; }
  if(type==='due'){ t.value='⏰ Due Payment Reminder'; b.value='আপনার Due ৳ বাকি আছে। অনুগ্রহ করে পরিশোধ করুন।'; ty.value='due'; }
  if(type==='stock'){ t.value='⚠️ Low Stock Alert'; b.value='একটা Size এর Stock 10 এর নিচে চলে গেছে। এখনই Restock করুন।'; ty.value='system'; }
  if(type==='eid'){ t.value='🎉 Eid Special Offer'; b.value='ঈদ উপলক্ষে Zevi Hub দিচ্ছে বিশাল ছাড় + Free Delivery!'; ty.value='promo'; }
  t.dispatchEvent(new Event('input')); b.dispatchEvent(new Event('input'));
};

async function loadStats(){
  try{
    const usersSnap=await getDocs(collection(db,"users"));
    document.getElementById('totalUsers').innerText=`${usersSnap.size} Users`;
    const notifSnap=await getDocs(collection(db,"notifications"));
    document.getElementById('totalSent').innerText=notifSnap.size;
    let today=0;
    const todayStart=new Date(); todayStart.setHours(0,0,0,0);
    notifSnap.forEach(d=>{
      const data=d.data();
      const cd=data.createdAt?.toDate?data.createdAt.toDate(): data.createdAt?.seconds? new Date(data.createdAt.seconds*1000): new Date(data.createdAt||0);
      if(cd>=todayStart) today++;
    });
    document.getElementById('todaySent').innerText=today;
    document.getElementById('clickRate').innerText=notifSnap.size>0?'~68%':'0%';
  }catch(e){ console.log(e); }
}

async function loadHistory(){
  const list=document.getElementById('historyList');
  try{
    const q=query(collection(db,"notifications"), orderBy("createdAt","desc"));
    const snap=await getDocs(q);
    if(snap.empty){ list.innerHTML=`<p class="text-xs text-white/30">কোনো Notification পাঠানো হয়নি</p>`; return; }
    let html='';
    snap.forEach(d=>{
      const n=d.data();
      const date=n.createdAt?.toDate? n.createdAt.toDate().toLocaleString('bn-BD'): '';
      html+=`
        <div class="bg-black border border-white/10 rounded-2xl p-4">
          <div class="flex justify-between items-start">
            <div class="flex-1"><p class="font-bold text-sm">${n.title||''}</p><p class="text-xs text-white/50 mt-1">${n.body||''}</p><p class="text-[10px] text-white/20 mt-2">${date} • ${n.audience||'all'} • ${n.type||''}</p></div>
            <button onclick="deleteNotif('${d.id}')" class="ml-3 bg-white/5 px-3 py-1 rounded-full text-[10px] hover:bg-red-500/20">Delete</button>
          </div>
          ${n.image?`<img src="${n.image}" class="w-full h-24 object-cover rounded-xl mt-3">`:''}
        </div>`;
    });
    list.innerHTML=html;
  }catch(e){
    console.log(e);
    const snap=await getDocs(collection(db,"notifications"));
    let html='';
    snap.forEach(d=>{ const n=d.data(); html+=`<div class="bg-black border border-white/10 rounded-2xl p-4"><p class="font-bold text-sm">${n.title}</p><p class="text-xs text-white/50">${n.body}</p><button onclick="deleteNotif('${d.id}')" class="mt-2 bg-white/10 px-3 py-1 rounded-full text-[10px]">Delete</button></div>`; });
    list.innerHTML=html||`<p class="text-xs text-white/30">History লোড হয়নি</p>`;
  }
}

window.deleteNotif=async(id)=>{
  if(!confirm('Delete করবে?')) return;
  await deleteDoc(doc(db,"notifications",id));
  loadHistory(); loadStats();
};

document.getElementById('sendBtn').onclick=async()=>{
  const title=document.getElementById('notifTitle').value.trim();
  const body=document.getElementById('notifBody').value.trim();
  const image=document.getElementById('notifImage').value.trim();
  const link=document.getElementById('notifLink').value.trim();
  const audience=document.getElementById('notifAudience').value;
  const type=document.getElementById('notifType').value;
  if(!title||!body) return alert('Title ও Message দিন');

  const btn=document.getElementById('sendBtn');
  btn.disabled=true; btn.innerText='পাঠানো হচ্ছে...';

  try{
    // সব ইউজারের ডাটা ফেচ করে প্রত্যেকের জন্য নোটিফিকেশন তৈরি করা
    const usersSnap = await getDocs(collection(db, "users"));
    
    if(usersSnap.empty) {
      alert('⚠️ কোনো ইউজার পাওয়া যায়নি!');
      btn.disabled=false; btn.innerText='🚀 এখনই পাঠাও';
      return;
    }

    let sendPromises = [];
    usersSnap.forEach((userDoc) => {
      const uid = userDoc.id;
      sendPromises.push(
        addDoc(collection(db, "notifications"), {
          userId: uid, // ইউজারের নিজস্ব আইডি যাতে নোটিফিকেশন পেজে ফিল্টার হয়ে আসে
          title, 
          body, 
          image, 
          link, 
          audience, 
          type,
          isRead: false, // আনরিড স্ট্যাটাস
          createdAt: serverTimestamp(),
          sentBy: auth.currentUser.email,
          clicks: 0, 
          delivered: 0
        })
      );
    });

    await Promise.all(sendPromises);

    alert(`✅ সফলভাবে ${usersSnap.size} জন ইউজারের কাছে নোটিফিকেশন পাঠানো হয়েছে!`);
    document.getElementById('notifTitle').value='';
    document.getElementById('notifBody').value='';
    document.getElementById('notifImage').value='';
    document.getElementById('notifLink').value='';
    document.getElementById('previewBox').classList.add('hidden');
    loadHistory(); loadStats();
  }catch(e){ 
    alert('Error: '+e.message); 
  }
  finally{ 
    btn.disabled=false; btn.innerText='🚀 এখনই পাঠাও'; 
  }
};

document.getElementById('refreshHistory').onclick=()=>{ loadHistory(); loadStats(); };

document.getElementById('logoutBtn')?.addEventListener('click', async()=>{ await signOut(auth); location.href='admin-login.html'; });
