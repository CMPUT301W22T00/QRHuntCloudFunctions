const admin = require('firebase-admin');

admin.initializeApp({
  apiKey: "AIzaSyASIrI4jSNSC4JUvddRb5hN_i1Jb_VUURk",
  authDomain: "sandbox-266120.firebaseapp.com",
  projectId: "sandbox-266120",
  storageBucket: "sandbox-266120.appspot.com",
  messagingSenderId: "720758025190",
  appId: "1:720758025190:web:37366b80685eb792228427",
  measurementId: "G-QEHCQSN6EE"
});

db = admin.firestore();
(async function() {
  console.log(await db.collection("users").get("04717e93-d613-46da-99e4-aa97e6fe8793"))
})()

console.log("loaded 👎")

