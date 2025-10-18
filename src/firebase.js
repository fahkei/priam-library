// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 🔧 Your Firebase configuration (copied from Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyCITQ7DzUPFsX8hyzg1g8MDMR2pIKfnir4",
  authDomain: "priam-library.firebaseapp.com",
  projectId: "priam-library",
  storageBucket: "priam-library.firebasestorage.app",
  messagingSenderId: "491044940871",
  appId: "1:491044940871:web:fd76288b5b60481ca35562",
  measurementId: "G-KLGXNMRDRZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services we’ll use
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
