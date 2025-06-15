const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, writeBatch, serverTimestamp, getDocs } = require('firebase/firestore');

// Load Firebase config from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Safely creates a Date object from a string.
 * Returns null if the string is empty or results in an invalid date.
 * @param {string} dateString The date string to parse.
 * @returns {Date|null} A valid Date object or null.
 */
const safeNewDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
        return null;
    }
    const date = new Date(dateString);
    // Check if the date is valid. An invalid date's time is NaN.
    if (isNaN(date.getTime())) {
        return null;
    }
    return date;
};

async function generateAndStoreInvoices() {
  console.log('--- Starting Invoice Generation Process ---');

  const batch = writeBatch(db);
  const invoicesRef = collection(db, 'invoices');

  try {
    // Step 1: Clear out any old data to ensure a clean slate.
    console.log('Clearing existing invoices to prevent duplicates...');
    const existingInvoices = await getDocs(invoicesRef);
    if (!existingInvoices.empty) {
        existingInvoices.docs.forEach(doc => batch.delete(doc.ref));
        console.log(`- Marked ${existingInvoices.size} old records for deletion.`);
    } else {
        console.log('- No old records to delete.');
    }

    // Step 2: Read the authoritative list of invoices from the CSV file.
    const csvPath = path.resolve(process.cwd(), 'csv', 'financial.csv.csv');
    console.log(`Reading invoice data from: ${csvPath}`);
    const fileContent = fs.readFileSync(csvPath);
    const records = parse(fileContent, {
      columns: header => header.map(h => h.trim().toLowerCase().replace(/\s+/g, '_')),
      skip_empty_lines: true,
    });
    console.log(`- Found ${records.length} employee records in the source file.`);

    // Step 3: Group employees by their assigned invoice number.
    const invoiceGroups = {};
    const contractGroups = {};

    for (const record of records) {
        const invoiceNumber = record.recent_invoice;
        const contractNumber = record.ctr;

        if (invoiceNumber) {
            if (!invoiceGroups[invoiceNumber]) {
                invoiceGroups[invoiceNumber] = {
                    contract_number: contractNumber,
                    employee_names: [],
                    start_date: safeNewDate(record.rental_period_start_date),
                    end_date: safeNewDate(record.rental_period_end_date),
                    amount: parseFloat(record.rent) || 3500,
                };
            }
            invoiceGroups[invoiceNumber].employee_names.push(record.name);
        }

        if (contractNumber) {
            if (!contractGroups[contractNumber]) {
                contractGroups[contractNumber] = { employee_names: [], hasRealInvoice: false };
            }
            contractGroups[contractNumber].employee_names.push(record.name);
            if (invoiceNumber) {
                contractGroups[contractNumber].hasRealInvoice = true;
            }
        }
    }
    
    // Step 4: Generate a new database record for each unique invoice.
    let invoiceCount = 0;
    console.log('Generating records for existing invoices...');
    for (const invoiceNumber in invoiceGroups) {
        const group = invoiceGroups[invoiceNumber];
        const newInvoiceData = {
            invoice_number: invoiceNumber,
            contract_number: group.contract_number,
            employee_names: group.employee_names,
            amount: group.amount,
            start_date: group.start_date,
            end_date: group.end_date,
            status: 'pending',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            notes: 'Generated from authoritative source file.',
        };
        const newDocRef = doc(invoicesRef);
        batch.set(newDocRef, newInvoiceData);
        invoiceCount++;
    }
    console.log(`- Marked ${invoiceCount} new invoices for creation in the database.`);
    if(Object.keys(invoiceGroups).includes('D10102-Z007')){
        console.log("- Confirmed that invoice 'D10102-Z007' is included in the generation set.");
    }


    // Step 5: Generate placeholder records for contracts without invoices.
    let placeholderCount = 0;
    console.log('Generating placeholders for newly signed contracts...');
     for (const contractNumber in contractGroups) {
        const group = contractGroups[contractNumber];
        if (!group.hasRealInvoice) {
            const newPlaceholderData = {
                invoice_number: `CONTRACT-${contractNumber}`,
                contract_number: contractNumber,
                employee_names: group.employee_names,
                amount: null,
                start_date: null,
                end_date: null,
                status: 'newly_signed',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
                notes: 'Placeholder for a new contract from the source file.',
            };
            const newDocRef = doc(invoicesRef);
            batch.set(newDocRef, newPlaceholderData);
            placeholderCount++;
        }
    }
    console.log(`- Marked ${placeholderCount} new 'newly_signed' placeholders for creation.`);

    // Step 6: Commit all changes to the database.
    console.log('Saving all generated records to the database...');
    await batch.commit();

    console.log('--- ✅ Generation Complete! ---');
    console.log(`The 'invoices' collection in your database has been successfully populated.`);

  } catch (error) {
    console.error('\n--- ❌ An error occurred during the generation process: ---');
    console.error(error);
  }
}

// Run the generation function
generateAndStoreInvoices(); 