const admin=require('firebase-admin');
const path=require('path');
const fs=require('fs');
admin.initializeApp({credential:admin.credential.cert(require(path.join(__dirname,'..','serviceAccountKey.json')))});
const db=admin.firestore();

const backupPath=path.join(__dirname,'..','backups','2025-06-20T04-34-09-274Z','employees.json');
if(!fs.existsSync(backupPath)){console.error('Backup file not found',backupPath);process.exit(1);} 
const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
const genderByName=new Map();
backup.forEach(row=>{if(row.name && row.gender)genderByName.set(row.name,row.gender);});

(async()=>{
 const snap=await db.collection('employees').get();
 const batch=db.batch();
 let changes=0;
 snap.docs.forEach(doc=>{
   const data=doc.data();
   const name=data.name;
   const current=data.gender||'male';
   const correct=genderByName.get(name);
   if(correct && correct!==current){
     batch.set(doc.ref,{gender:correct},{merge:true});
     changes++;
   }
 });
 await batch.commit();
 console.log('Updated gender for',changes,'employees');
 process.exit(0);
})(); 