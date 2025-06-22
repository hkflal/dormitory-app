const admin = require('firebase-admin');
const path = require('path');
const OpenCC = require('opencc-js');

// --- CONFIG ---
// Convert from Traditional (Hong Kong) to Simplified (China)
const converter = OpenCC.Converter({ from: 'hk', to: 'cn' });
const BATCH_LIMIT = 450;
// --- END CONFIG ---

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function commitChunks(ops) {
  let batch = db.batch();
  let counter = 0;
  for (const { ref, data } of ops) {
    batch.update(ref, data);
    if (++counter >= BATCH_LIMIT) {
      await batch.commit();
      console.log(`Committed ${counter} updates...`);
      batch = db.batch();
      counter = 0;
    }
  }
  if (counter > 0) {
    await batch.commit();
    console.log(`Committed final ${counter} updates.`);
  }
}

(async () => {
  console.log('Loading employees and normalizing names...');
  const employeesSnap = await db.collection('employees').get();
  const employeesByNormalizedName = new Map();
  employeesSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.name) {
      const normalizedName = converter(data.name);
      if (!employeesByNormalizedName.has(normalizedName)) {
        employeesByNormalizedName.set(normalizedName, { id: doc.id, ...data });
      }
    }
  });
  console.log(`Loaded ${employeesByNormalizedName.size} unique normalized employees.`);

  console.log('Fetching all invoices to check for linking issues...');
  const invoicesSnap = await db.collection('invoices').get();
  console.log(`Found ${invoicesSnap.size} invoices.`);

  const ops = [];
  let updatedCount = 0;
  let notFoundCount = 0;
  const notFoundNames = [];

  for (const invoiceDoc of invoicesSnap.docs) {
    const invoiceData = invoiceDoc.data();
    const employeeNames = invoiceData.employee_names;

    if (Array.isArray(employeeNames) && employeeNames.length > 0) {
      const primaryEmployeeName = employeeNames[0];
      const normalizedInvoiceName = converter(primaryEmployeeName);
      const employee = employeesByNormalizedName.get(normalizedInvoiceName);

      if (employee) {
        const updates = {};
        if (invoiceData.company !== employee.company) {
          updates.company = employee.company;
        }
        if (invoiceData.uid !== employee.uid) {
          updates.uid = employee.uid;
        }
        if (invoiceData.linked_employee_id !== employee.id) {
          updates.linked_employee_id = employee.id;
        }

        if (Object.keys(updates).length > 0) {
          ops.push({ ref: invoiceDoc.ref, data: updates });
          updatedCount++;
        }
      } else {
        notFoundCount++;
        notFoundNames.push(`${primaryEmployeeName} (invoice: ${invoiceDoc.id})`);
      }
    }
  }

  console.log(`\nPrepared ${ops.length} updates for ${updatedCount} invoices.`);
  if (notFoundCount > 0) {
    console.log(`Could not find matching employees for ${notFoundCount} invoices. Unmatched names:`);
    notFoundNames.forEach(name => console.log(`- ${name}`));
  }

  if (ops.length > 0) {
    await commitChunks(ops);
    console.log('Successfully updated invoices with correct company and UID links.');
  } else {
    console.log('No invoices needed updating.');
  }

  process.exit(0);
})().catch(err => {
  console.error('An error occurred:', err);
  process.exit(1);
}); 