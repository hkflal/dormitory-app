const admin=require('firebase-admin');
const path=require('path');
admin.initializeApp({credential:admin.credential.cert(require(path.join(__dirname,'..','serviceAccountKey.json')))});
const db=admin.firestore();
(async()=>{
 const snap=await db.collection('properties').get();
 console.log('Properties count:',snap.size);
 console.log(snap.docs.map(d=>d.data().name));
 process.exit(0);
})(); 