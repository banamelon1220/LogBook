const firebaseConfig = {
  apiKey: "AIzaSyDFz8H6OBvtd_uiaB8SgaUF5iOGWkz9Mtg",
  authDomain: "logbook-dc604.firebaseapp.com",
  projectId: "logbook-dc604",
  storageBucket: "logbook-dc604.firebasestorage.app",
  messagingSenderId: "979380007846",
  appId: "1:979380007846:web:43605154005d6209de5567"
};

// Initialize Firebase (Compat SDK)
firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();
