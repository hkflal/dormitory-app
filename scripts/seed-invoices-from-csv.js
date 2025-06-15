const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, writeBatch, serverTimestamp } = require('firebase/firestore');

// Load Firebase config
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

// --- Main Seeding Function ---
async function seedInvoices() {
  console.log('Starting the invoice seeding process...');

  try {
    // 1. Read and parse the CSV file
    const csvPath = path.resolve(process.cwd(), 'data', 'financial.csv');
    const fileContent = fs.readFileSync(csvPath);
    const records = parse(fileContent, {
      columns: header => header.map(h => h.trim().toLowerCase().replace(/\s+/g, '_')), // Sanitize headers
      skip_empty_lines: true,
    });
    console.log(`Read ${records.length} records from financial.csv`);

    // 2. Group records by invoice number and contract number
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
                    // Assume dates and amounts are the same for all employees on one invoice
                    start_date: new Date(record.rental_period_start_date),
                    end_date: new Date(record.rental_period_end_date),
                    amount: parseFloat(record.rent) || 3500, // Use rent or default
                };
            }
            invoiceGroups[invoiceNumber].employee_names.push(record.name);
        }

        // Also group by contract to find those without invoices
        if (!contractGroups[contractNumber]) {
            contractGroups[contractNumber] = { employee_names: [], hasRealInvoice: false };
        }
        contractGroups[contractNumber].employee_names.push(record.name);
        if (invoiceNumber) {
            contractGroups[contractNumber].hasRealInvoice = true;
        }
    }
    
    // 3. Prepare batch write to Firestore
    const batch = writeBatch(db);
    const invoicesRef = collection(db, 'invoices');
    let invoiceCount = 0;
    let placeholderCount = 0;

    // Create real invoice documents
    for (const invoiceNumber in invoiceGroups) {
        const group = invoiceGroups[invoiceNumber];
        const newInvoice = {
            invoice_number: invoiceNumber,
            contract_number: group.contract_number,
            employee_names: group.employee_names,
            amount: group.amount,
            start_date: group.start_date,
            end_date: group.end_date,
            status: 'pending', // Default status for seeded invoices
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            notes: 'Seeded from financial.csv',
        };
        const docRef = doc(invoicesRef); // Auto-generate ID
        batch.set(docRef, newInvoice);
        invoiceCount++;
    }

    // Create placeholder "newly_signed" documents
    for (const contractNumber in contractGroups) {
        const group = contractGroups[contractNumber];
        if (!group.hasRealInvoice) {
            const newPlaceholder = {
                invoice_number: `CONTRACT-${contractNumber}`, // A temporary, unique identifier
                contract_number: contractNumber,
                employee_names: group.employee_names,
                amount: null,
                start_date: null,
                end_date: null,
                status: 'newly_signed',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
                notes: 'Placeholder for a new contract from financial.csv',
            };
            const docRef = doc(invoicesRef); // Auto-generate ID
            batch.set(docRef, newPlaceholder);
            placeholderCount++;
        }
    }

    // 4. Commit the batch
    await batch.commit();
    console.log('-------------------------------------------');
    console.log('✅ Seeding complete!');
    console.log(`- Created ${invoiceCount} real invoices.`);
    console.log(`- Created ${placeholderCount} 'newly_signed' placeholders.`);
    console.log('-------------------------------------------');

  } catch (error) {
    console.error('❌ An error occurred during the seeding process:');
    console.error(error);
  }
}

// Run the seeding function
seedInvoices(); 