import { auth, db } from "../firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export function protectAdmin(){
  onAuthStateChanged(auth, async (user)=>{
    if(!user){ location.href="admin-login.html"; return; }
    // কোডে Gmail চেক নাই, চেক হবে Firestore এর ভিতরে
    const adminDoc = await getDoc(doc(db,"admins", user.uid));
    if(!adminDoc.exists()){
      alert("Access Denied! আপনি অ্যাডমিন না");
      await signOut(auth);
      location.href="../index.html";
      return;
    }
    document.body.classList.remove('hidden');
    console.log("Admin UID:", user.uid); // প্রথমবার UID নিতে এটা দেখে নিন
  });
}
