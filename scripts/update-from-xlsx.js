#!/usr/bin/env node
/**
 * Update Firestore from the dormitory Excel sheet.
 * USAGE
 *   node scripts/update-from-xlsx.js --file csv/06.18dormitory.xlsx --dry
 *   node scripts/update-from-xlsx.js                                 # live run
 *
 * Invoices / financial_records logic is stubbed with clear TODOs.
 */
const admin   = require('firebase-admin');
const ExcelJS = require('exceljs');
const fs      = require('fs/promises');
const path    = require('path');
// Optional pretty logging (chalk v5 is ESM-only). Fallback to no-op styles when not available.
let chalk;
try {
  chalk = require('chalk');
  if (chalk && chalk.default) chalk = chalk.default;
} catch { /* ignore */ }
const style = fn => (chalk && typeof chalk[fn] === 'function') ? chalk[fn] : (s=>s);

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
let credential;
if (require('fs').existsSync(serviceAccountPath)) {
  credential = admin.credential.cert(require(serviceAccountPath));
} else {
  credential = admin.credential.applicationDefault();
}

admin.initializeApp({ credential });
const db = admin.firestore();

const BATCH_LIMIT  = 450;
const DEFAULT_FILE = 'csv/06.18dormitory.xlsx';
const argv         = process.argv.slice(2);
const DRY_RUN      = argv.includes('--dry');
const fileArgIdx   = argv.indexOf('--file');
const FILE_PATH    = fileArgIdx !== -1 ? argv[fileArgIdx + 1] : DEFAULT_FILE;

/* ---------- helpers ---------- */
function excelDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000);
  if (v?.result instanceof Date) return v.result;
  const d = new Date(v); return isNaN(+d) ? null : d;
}
async function commitOps(ops) {
  let batch = db.batch(), count = 0;
  for (const op of ops) {
    if (op.delete) {
      batch.delete(op.ref);
    } else {
      op.merge ? batch.set(op.ref, op.data, { merge: true }) : batch.set(op.ref, op.data);
    }
    if (++count === BATCH_LIMIT) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  if (count) await batch.commit();
}
function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([,v]) => v !== undefined));
}
/* ---------- main ---------- */
(async () => {
  console.log(style('cyan')(`📖  Loading workbook: ${FILE_PATH}`));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(FILE_PATH);
  const sheet = wb.worksheets[0];

  /* header index look-ups -------------------------------------------------- */
  const headers = sheet.getRow(1).values.map(v => (v || '').toString().toLowerCase().trim());
  const col = h => headers.indexOf(h);
  const [
    iEMP, iUID, iARR, iFREQ, iINV, iDEP,
    iSTART, iEND, iCTR, iCOMP, iPROP, iRENT
  ] = ['employee','uid','arrival','frequency','invoice_number','deposit_number',
       'start_date','enddate','contract_number','company','assignedproperty','rent']
      .map(col);

  if ([iEMP,iUID,iARR,iFREQ,iINV,iDEP,iSTART,iEND,iCTR,iCOMP,iPROP,iRENT].includes(-1)) {
    console.error('❌  Missing one or more required columns in the header row.'); process.exit(1);
  }

  /* parse rows ------------------------------------------------------------- */
  const rows = [];
  sheet.eachRow((r,n) => {
    if (n === 1) return;
    const get = idx => r.getCell(idx).value;
    rows.push({
      name: get(iEMP)?.toString().trim(),
      uid : get(iUID )?.toString().trim(),
      arrival : excelDate(get(iARR )),
      frequency: Number(get(iFREQ) || 0),
      invoiceNumber : get(iINV )?.toString().trim(),
      depositNumber : get(iDEP )?.toString().trim(),
      startDate : excelDate(get(iSTART)),
      endDate   : excelDate(get(iEND  )),
      ctr       : get(iCTR )?.toString().trim(),
      company   : get(iCOMP)?.toString().trim(),
      property  : get(iPROP)?.toString().trim(),
      rent      : Number(get(iRENT) || 0)
    });
  });
  console.log(style('green')(`✔  Parsed ${rows.length} lines`));

  /* load current firestore ------------------------------------------------- */
  console.log(style('cyan')('🔄  Fetching current Firestore state…'));
  const [empSnap, propSnap] = await Promise.all([
    db.collection('employees').get(),
    db.collection('properties').get()
  ]);
  const empByUid  = new Map();
  empSnap.forEach(d => { const u = d.data().uid; if (!empByUid.has(u)) empByUid.set(u, []); empByUid.get(u).push(d); });
  const propByName = new Map();
  propSnap.docs.forEach(d => {
    const data = d.data();
    if (data && data.name) propByName.set(data.name.toLowerCase(), d);
  });

  /* decide mutations ------------------------------------------------------- */
  const ops = [], log = { employees:{added:[],updated:[],deletedDup:[],removedOld:[]}, properties:{added:[],updated:[]} };

  const sheetUids = new Set(rows.map(r=>r.uid));

  for (const r of rows) {
    let propertyId = null;
    /* --- properties (ensure exists) --- */
    if (r.property) {
      const key = r.property.toLowerCase();
      if (propByName.has(key)) {
        const doc = propByName.get(key);
        propertyId = doc.id;
        if (doc.data().name !== r.property) {
          ops.push({ ref: doc.ref, data:{ name: r.property }, merge:true });
          log.properties.updated.push(doc.id);
        }
      } else {
        const ref = db.collection('properties').doc();
        propertyId = ref.id;
        const newData = { name:r.property, fromExcel:true, createdAt:admin.firestore.FieldValue.serverTimestamp() };
        ops.push({ ref, data:newData, merge:false });
        propByName.set(key, { id: propertyId, ref, data: () => newData });
        log.properties.added.push(ref.id);
      }
    }

    /* --- employees --- */
    const dup = empByUid.get(r.uid) || [];
    const target = dup[0];

    const payload = clean({
      name  : r.name,
      uid   : r.uid,
      arrival: r.arrival,
      status : r.arrival && r.arrival <= new Date() ? 'housed' : 'pending',
      paymentFrequency: r.frequency,
      company: r.company,
      rent   : r.rent,
      assigned_property_id: propertyId,
      activeCtr: r.ctr,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (target) {
      ops.push({ ref: target.ref, data: payload, merge:true });
      log.employees.updated.push(target.id);
      /* remove duplicates */
      dup.slice(1).forEach(d => {
        ops.push({ ref: d.ref, delete: true });
        log.employees.deletedDup.push(d.id);
      });
    } else {
      const ref = db.collection('employees').doc(r.uid);
      ops.push({ ref, data:{ createdAt: admin.firestore.FieldValue.serverTimestamp(), ...payload }, merge:false });
      log.employees.added.push(r.uid);
    }

    /* --- TODO: invoices & financial_records updates --- */
  }

  /* --- delete employees not in sheet --- */
  empSnap.docs.forEach(d => {
    const data = d.data();
    const uidVal = data.uid;
    if (uidVal && !sheetUids.has(uidVal)) {
      ops.push({ ref: d.ref, delete: true });
      log.employees.removedOld.push(d.id);
    }
  });

  console.log(style('cyan')(`🚧  Prepared ${ops.length} batched writes (${DRY_RUN?'dry-run':'live'})`));

  if (!DRY_RUN) await commitOps(ops);
  else console.log(style('yellow')('⚠  Dry-run: no writes executed'));

  /* log -------------------------------------------------------------------- */
  const logDir = path.join(__dirname, '..', 'logs'); await fs.mkdir(logDir,{recursive:true});
  const logFile = path.join(logDir, `update-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  await fs.writeFile(logFile, JSON.stringify(log, null, 2));
  console.log(style('greenBright')(`📝  Log saved to ${logFile}`));

  /* quick count check ------------------------------------------------------ */
  const finalCount = DRY_RUN ? (await db.collection('employees').get()).size
                             : empSnap.size - log.employees.deletedDup.length - log.employees.removedOld.length + log.employees.added.length;
  console.log(finalCount === 202
    ? style('green')('✔  Employee count == 202')
    : style('red')(`⚠  Employee count != 202 (now ${finalCount})`));

  process.exit(0);
})().catch(err => { console.error(style('red')('❌  Update failed'), err); process.exit(1); }); 