require('dotenv').config({ path: '.env.local' });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, query, where } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Handle different date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // M/D/YYYY
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) { // YYYY-MM-DD
        return new Date(match[1], match[2] - 1, match[3]);
      } else { // MM/DD/YYYY or M/D/YYYY
        return new Date(match[3], match[1] - 1, match[2]);
      }
    }
  }
  
  return new Date(dateStr);
}

function generateInvoiceNumber(contractNumber, sequence = 1) {
  return `${contractNumber}-Z${String(sequence).padStart(3, '0')}`;
}

function calculateRentalPeriod(startDate, endDate) {
  if (!startDate || !endDate) return { months: 1, days: 30 };
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const months = Math.ceil(diffDays / 30);
  
  return { months, days: diffDays };
}

function determineInvoiceStatus(startDate, endDate, today = new Date()) {
  if (!endDate) return 'pending';
  
  const end = new Date(endDate);
  const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
  
  if (end < thirtyDaysAgo) {
    return 'overdue';
  } else if (end < today) {
    return 'pending';
  } else {
    return 'pending';
  }
}

async function readFinancialData() {
  const csvPath = path.join(__dirname, '../csv/financial.csv.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('Financial CSV file not found at:', csvPath);
    process.exit(1);
  }

  const records = [];
  const parser = fs.createReadStream(csvPath).pipe(parse({
    columns: true,
    skip_empty_lines: true,
    trim: true
  }));

  for await (const record of parser) {
    records.push(record);
  }

  return records;
}

async function checkExistingInvoices(contractNumber) {
  const invoicesQuery = query(
    collection(db, 'invoices'),
    where('contract_number', '==', contractNumber)
  );
  
  const snapshot = await getDocs(invoicesQuery);
  return snapshot.size;
}

async function generateInvoicesFromFinancials() {
  console.log('🚀 Starting invoice generation from financial data...');
  
  try {
    const financialRecords = await readFinancialData();
    console.log(`📊 Found ${financialRecords.length} financial records`);
    
    const invoicesToCreate = [];
    const errors = [];
    let processed = 0;
    let skipped = 0;
    
    for (const record of financialRecords) {
      processed++;
      
      try {
        // Skip if no contract number
        if (!record.contract_number || record.contract_number.trim() === '') {
          skipped++;
          continue;
        }
        
        // Check if invoices already exist for this contract
        const existingCount = await checkExistingInvoices(record.contract_number);
        if (existingCount > 0) {
          console.log(`⏭️  Skipping ${record.contract_number} - already has ${existingCount} invoices`);
          skipped++;
          continue;
        }
        
        // Parse dates
        const startDate = parseDate(record.start_date);
        const endDate = parseDate(record.end_date);
        
        // Calculate rental period and generate invoices
        const period = calculateRentalPeriod(startDate, endDate);
        const monthlyAmount = parseFloat(record.amount) || 0;
        
        // Generate monthly invoices for the rental period
        for (let month = 0; month < period.months; month++) {
          const invoiceStartDate = new Date(startDate);
          invoiceStartDate.setMonth(invoiceStartDate.getMonth() + month);
          
          const invoiceEndDate = new Date(invoiceStartDate);
          invoiceEndDate.setMonth(invoiceEndDate.getMonth() + 1);
          invoiceEndDate.setDate(invoiceEndDate.getDate() - 1); // Last day of the month
          
          const invoiceNumber = generateInvoiceNumber(record.contract_number, month + 1);
          const status = determineInvoiceStatus(invoiceStartDate, invoiceEndDate);
          
          const invoice = {
            invoice_number: invoiceNumber,
            contract_number: record.contract_number,
            employee_names: record.employee_names ? record.employee_names.split(',').map(name => name.trim()) : [],
            amount: monthlyAmount,
            start_date: invoiceStartDate,
            end_date: invoiceEndDate,
            status: status,
            notes: `Generated from financial record - Month ${month + 1}`,
            created_at: new Date(),
            updated_at: new Date(),
            // Additional metadata
            property_name: record.property_name || '',
            room_number: record.room_number || '',
            original_record_id: record.id || ''
          };
          
          invoicesToCreate.push(invoice);
        }
        
        console.log(`✅ Prepared ${period.months} invoices for contract ${record.contract_number}`);
        
      } catch (error) {
        errors.push({
          record: record.contract_number || 'unknown',
          error: error.message
        });
        console.error(`❌ Error processing record ${record.contract_number}:`, error.message);
      }
    }
    
    console.log(`\n📋 Summary:`);
    console.log(`- Processed: ${processed} records`);
    console.log(`- Skipped: ${skipped} records`);
    console.log(`- Invoices to create: ${invoicesToCreate.length}`);
    console.log(`- Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(err => console.log(`  - ${err.record}: ${err.error}`));
    }
    
    if (invoicesToCreate.length === 0) {
      console.log('\n⚠️  No invoices to create. All contracts may already have invoices.');
      return;
    }
    
    // Ask for confirmation
    console.log(`\n🤔 Do you want to create ${invoicesToCreate.length} invoices? (This is a simulation - actually creating them)`);
    
    // Create invoices in batches
    let created = 0;
    const batchSize = 10;
    
    for (let i = 0; i < invoicesToCreate.length; i += batchSize) {
      const batch = invoicesToCreate.slice(i, i + batchSize);
      
      for (const invoice of batch) {
        try {
          const docRef = await addDoc(collection(db, 'invoices'), invoice);
          created++;
          console.log(`✅ Created invoice ${invoice.invoice_number} (${created}/${invoicesToCreate.length})`);
        } catch (error) {
          console.error(`❌ Failed to create invoice ${invoice.invoice_number}:`, error.message);
        }
      }
      
      // Small delay between batches to avoid overwhelming Firestore
      if (i + batchSize < invoicesToCreate.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`\n🎉 Successfully created ${created} invoices!`);
    console.log(`\n📊 You can now view them at: http://localhost:3000/invoices`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
generateInvoicesFromFinancials().then(() => {
  console.log('\n✅ Invoice generation complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
}); 