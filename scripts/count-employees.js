const admin=require('firebase-admin');
const path=require('path');
const serviceAccount=require(path.join(__dirname,'..','serviceAccountKey.json'));
admin.initializeApp({credential:admin.credential.cert(serviceAccount)});
const db=admin.firestore();
(async()=>{
 const snap=await db.collection('employees').get();
 console.log('Employees:',snap.size);
 process.exit(0);
})(); 