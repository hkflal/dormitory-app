const admin=require('firebase-admin');
const path=require('path');
admin.initializeApp({credential:admin.credential.cert(require(path.join(__dirname,'..','serviceAccountKey.json')))});
const db=admin.firestore();

// Canonical list (18)
const canonical=[
 '利安','唐七','寶明1','寶明2','文苑樓','文英樓','文華樓','新興','有利','東海','榮華','永利','祥興','耀基','通菜街','遠景','金輪','陶德'
];

// Mapping variants to canonical
const variants={
 '宝明':'寶明1',
 '宝明2号':'寶明2',
 '寶明1':'寶明1',
 '寶明2':'寶明2',
 '宝明2':'寶明2',
 '东海':'東海',
 '東海':'東海',
 '文英楼':'文英樓',
 '文英樓':'文英樓',
 '文苑楼':'文苑樓',
 '文苑樓':'文苑樓',
 '文华楼':'文華樓',
 '文華樓':'文華樓',
 '祥兴':'祥興',
 '祥興':'祥興',
 '荣华':'榮華',
 '榮華':'榮華',
 '金轮':'金輪',
 '金輪':'金輪',
 '有利大廈':'有利',
 '有利':'有利',
};

function canon(name){return variants[name]||name;}

(async()=>{
 const propSnap=await db.collection('properties').get();
 const ops=[];const keepDocIdByCanon={};
 propSnap.docs.forEach(doc=>{
  const data=doc.data();
  const original=data.name;
  const c=canon(original);
  if(!canonical.includes(c)){
   console.log('Non-canonical property found',original,'->',c,'(will keep but flag)');
   // Optionally ignore
  }
  if(c!==original){
   ops.push({ref:doc.ref,data:{name:c},merge:true});
  }
  if(keepDocIdByCanon[c]){
    // duplicate
    ops.push({ref:doc.ref,delete:true});
    console.log('Deleting duplicate property',original,'doc id',doc.id);
  }else{
    keepDocIdByCanon[c]=doc.id;
  }
 });
 // commit
 const batch=db.batch();
 let count=0;const commit=async()=>{await batch.commit();}
 ops.forEach(op=>{
  if(op.delete)batch.delete(op.ref); else batch.set(op.ref,op.data,{merge:true});
  count++; if(count===400){commit();count=0;}
 });
 await commit();
 console.log('Property fix commits done');
 process.exit(0);
})(); 