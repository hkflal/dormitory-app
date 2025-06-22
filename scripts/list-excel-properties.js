const ExcelJS=require('exceljs');
(async()=>{
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.readFile('csv/06.18dormitory.xlsx');
 const sheet=wb.worksheets[0];
 const headers=sheet.getRow(1).values.map(v=>(v||'').toString().toLowerCase().trim());
 const idx=headers.indexOf('assignedproperty');
 if(idx===-1){console.error('assignedProperty column not found');process.exit(1);} 
 const set=new Set();
 sheet.eachRow((r,n)=>{if(n===1)return;const val=r.getCell(idx).value;if(val)set.add(val.toString().trim());});
 const arr=Array.from(set).sort();
 console.log('Excel unique properties',arr.length);
 arr.forEach((p,i)=>console.log(`${i+1}. ${p}`));
})(); 