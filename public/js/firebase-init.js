/* ============================================================
   firebase-init.js — 連 Firebase（Firestore + Anonymous Auth）
   ・由 <script type="module"> 載入
   ・把 SDK 物件掛到 window.fb，給非 module 的 common.js / 各頁 JS 使用
   ・準備好之後 dispatch 'fb:ready'，common.js 監聽到才會啟動 DataStore
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot,
  query, orderBy, where, doc, runTransaction, serverTimestamp,
  getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, signInWithPopup, signOut,
  GoogleAuthProvider, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

/* ★ 婚禮版建議：到 Firebase 另建一個新專案，把下面 config 換掉，
   避免婚禮的祝福/信件跟原本生日站的資料混在同一個資料庫。
   （沿用現有 config 也能跑，只是資料會共用同一個 Firestore） */
const firebaseConfig = {
  apiKey: "AIzaSyAjmsRisQP7tR-cQGi4EqxdAaY2CeJe4_E",
  authDomain: "birthday-mo2026.firebaseapp.com",
  projectId: "birthday-mo2026",
  storageBucket: "birthday-mo2026.firebasestorage.app",
  messagingSenderId: "634251755712",
  appId: "1:634251755712:web:21ec5b9b100fffb6d7ed25"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

window.fb = {
  db, auth,
  collection, addDoc, onSnapshot, query, orderBy, where, doc,
  runTransaction, serverTimestamp, getDocs, deleteDoc,
  signInAnonymously, signInWithPopup, signOut,
  GoogleAuthProvider, onAuthStateChanged,
};

/* 只在還沒登入時才匿名登入；已用 Google 登入過的訪客會保留原帳號 */
onAuthStateChanged(auth, user => {
  if(!user) signInAnonymously(auth).catch(e => console.warn('[fb] 匿名登入失敗：', e));
});

window.dispatchEvent(new Event('fb:ready'));
