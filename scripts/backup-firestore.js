#!/usr/bin/env node
/**
 * Back-up Firestore collections to JSON files.
 *   node scripts/backup-firestore.js                  -> all four collections
 *   node scripts/backup-firestore.js employees,props  -> custom list
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS *or*
 *   gcloud auth application-default login
 */
const admin = require('firebase-admin');
const fs = require('fs/promises');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
let credential;
if (require('fs').existsSync(serviceAccountPath)) {
  credential = admin.credential.cert(require(serviceAccountPath));
} else {
  credential = admin.credential.applicationDefault();
}

admin.initializeApp({ credential });
const db = admin.firestore();

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

(async () => {
  const list = (process.argv[2]?.split(',') || [
    'employees',
    'properties',
    'invoices',
    'financial_records'
  ]).map(s => s.trim()).filter(Boolean);

  const outDir = path.join(__dirname, '..', 'backups', timestamp());
  await fs.mkdir(outDir, { recursive: true });
  console.log(`📂 Saving backups in ${outDir}`);

  for (const col of list) {
    process.stdout.write(`↪ ${col} …`);
    const docs = (await db.collection(col).get())
      .docs.map(d => ({ id: d.id, ...d.data() }));
    await fs.writeFile(
      path.join(outDir, `${col}.json`),
      JSON.stringify(docs, null, 2)
    );
    console.log(` ${docs.length} docs`);
  }

  console.log('✅ Backup complete');
  process.exit(0);
})().catch(err => {
  console.error('❌ Backup failed', err);
  process.exit(1);
}); 