const admin=require('firebase-admin');
const path=require('path');
const ExcelJS=require('exceljs');
const serviceAccount=require(path.join(__dirname,'..','serviceAccountKey.json'));
admin.initializeApp({credential:admin.credential.cert(serviceAccount)});
const db=admin.firestore();

(async()=>{
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.readFile('csv/06.18dormitory.xlsx');
  const sheet=wb.worksheets[0];
  const headers = sheet.getRow(1).values.map(v=>(v||'').toString().toLowerCase().trim());
  const uidIdx=headers.indexOf('uid');
  if(uidIdx===-1){console.error('uid column not found');process.exit(1);}  
  const sheetUids=new Set();
  sheet.eachRow((r,n)=>{if(n===1)return;const val=r.getCell(uidIdx).value; if(val) sheetUids.add(val.toString().trim());});
  const snap=await db.collection('employees').get();
  let del=0;
  const batch=db.batch();
  snap.docs.forEach(doc=>{
    const data=doc.data();
    const uid=data.uid;
    if(!uid||!sheetUids.has(uid)){
      batch.delete(doc.ref);del++;
    }
  });
  await batch.commit();
  console.log('Deleted',del,'employees');
  const after=(await db.collection('employees').get()).size;
  console.log('Remaining',after);
  process.exit(0);
})(); 