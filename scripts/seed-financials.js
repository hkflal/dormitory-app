const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, updateDoc, addDoc, deleteDoc } = require('firebase/firestore');
const csv = require('csv-parser');
const iconv = require('iconv-lite');

// --- Firebase Configuration ---
// It's recommended to use environment variables for Firebase config in production
const firebaseConfig = {
  apiKey: "AIzaSyDPbwDZ2a0cgbRoRZiuoO2Ywh5vq4xKGFo",
  authDomain: "dormitory-management-6c1a5.firebaseapp.com",
  projectId: "dormitory-management-6c1a5",
  storageBucket: "dormitory-management-6c1a5.firebasestorage.app",
  messagingSenderId: "600480501319",
  appId: "1:600480501319:web:eb1350c03dbcba3cbeeb62"
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Parses date in M/D/YYYY format to proper Date object
 * @param {string} dateStr - Date string in format like "8/12/2024"
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  try {
    // Handle M/D/YYYY format
    const [month, day, year] = dateStr.split('/').map(num => parseInt(num, 10));
    if (!month || !day || !year) return null;
    
    return new Date(year, month - 1, day); // month is 0-indexed in JS Date
  } catch (error) {
    console.error('Error parsing date:', dateStr, error);
    return null;
  }
}

/**
 * Calculates financial status based on rent period and current date
 * @param {Date} rentStart - Rent period start date
 * @param {Date} rentEnd - Rent period end date
 * @returns {object} Financial status information
 */
function calculateFinancialStatus(rentStart, rentEnd) {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  if (!rentStart || !rentEnd) {
    return {
      status: 'pending',
      isOverdue: false,
      needsNotification: false,
      daysUntilDue: null
    };
  }
  
  const rentEndMidnight = new Date(rentEnd.getFullYear(), rentEnd.getMonth(), rentEnd.getDate());
  const timeDiff = rentEndMidnight - todayMidnight;
  const daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  
  // Calculate notification date (14 days before rent_end)
  const notificationDate = new Date(rentEnd);
  notificationDate.setDate(notificationDate.getDate() - 14);
  const notificationMidnight = new Date(notificationDate.getFullYear(), notificationDate.getMonth(), notificationDate.getDate());
  
  const isOverdue = todayMidnight > rentEndMidnight;
  const needsNotification = todayMidnight >= notificationMidnight && todayMidnight <= rentEndMidnight;
  
  let status = 'current';
  if (isOverdue) {
    status = 'overdue';
  } else if (needsNotification) {
    status = 'due_soon';
  }
  
  return {
    status,
    isOverdue,
    needsNotification,
    daysUntilDue,
    notificationDate: notificationMidnight || null
  };
}

/**
 * Generates next invoice number based on CTR and existing invoices
 * @param {string} ctr - Contract number
 * @param {Array} existingInvoices - Array of existing invoices
 * @returns {string} New invoice number
 */
function generateInvoiceNumber(ctr, existingInvoices) {
  const ctrInvoices = existingInvoices.filter(inv => inv.contractNumber === ctr);
  const maxSequence = ctrInvoices.reduce((max, inv) => {
    const match = inv.invoiceNumber.match(/-Z(\d+)$/);
    if (match) {
      return Math.max(max, parseInt(match[1], 10));
    }
    return max;
  }, 0);
  
  const nextSequence = (maxSequence + 1).toString().padStart(3, '0');
  return `${ctr}-Z${nextSequence}`;
}

/**
 * Clear existing financial data collections
 */
async function clearFinancialData() {
  console.log('Clearing existing financial data...');
  
  try {
    // Clear financial records
    const financialSnapshot = await getDocs(collection(db, 'financial_records'));
    for (const doc of financialSnapshot.docs) {
      await deleteDoc(doc.ref);
    }
    
    // Clear invoices
    const invoiceSnapshot = await getDocs(collection(db, 'invoices'));
    for (const doc of invoiceSnapshot.docs) {
      await deleteDoc(doc.ref);
    }
    
    console.log('Existing financial data cleared.');
  } catch (error) {
    console.error('Error clearing financial data:', error);
  }
}

// --- Main Seeding Function ---
async function seedFinancials() {
  console.log('Starting financial data seeding process...');

  // Clear existing data first
  await clearFinancialData();

  const filePath = path.join(__dirname, '../csv/financial.csv.csv');
  const employeesFromCSV = [];
  const invoices = [];
  
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    fileStream
      .pipe(iconv.decodeStream('gbk')) // Use GBK encoding for Chinese characters
      .pipe(csv())
      .on('data', (row) => {
        employeesFromCSV.push(row);
      })
      .on('end', async () => {
        console.log(`CSV file successfully processed. Found ${employeesFromCSV.length} records.`);
        
        try {
          let processedCount = 0;
          let skippedCount = 0;
          
          for (const csvEmployee of employeesFromCSV) {
            const employeeName = csvEmployee.employee?.trim();

            if (!employeeName || employeeName === '') {
              console.warn('Skipping row due to missing employee name:', csvEmployee);
              skippedCount++;
              continue;
            }

            try {
              // Find employee in database
              const employeesRef = collection(db, 'employees');
              const q = query(employeesRef, where('name', '==', employeeName));
              const querySnapshot = await getDocs(q);

              if (querySnapshot.empty) {
                console.warn(`Employee "${employeeName}" not found in Firestore. Skipping.`);
                skippedCount++;
                continue;
              }

              const employeeDoc = querySnapshot.docs[0];
              
              // Parse dates
              const day1 = parseDate(csvEmployee.day1);
              const rentStart = parseDate(csvEmployee.rent_start);
              const rentEnd = parseDate(csvEmployee.rent_end);
              
              // Parse other fields
              const paymentFrequency = parseInt(csvEmployee.payment, 10) || 1;
              const monthlyRent = parseFloat(csvEmployee.rent) || 3500;
              const contractNumber = csvEmployee.CTR?.trim() || '';
              const recentInvoice = csvEmployee.recent_invoice?.trim() || '';
              
              // Calculate financial status
              const financialStatus = calculateFinancialStatus(rentStart, rentEnd);
              
              // Create financial record
              const financialData = {
                employeeId: employeeDoc.id,
                employeeName: employeeName,
                contractNumber: contractNumber,
                onboardingDate: day1,
                paymentFrequency: paymentFrequency,
                monthlyRent: monthlyRent,
                rentStart: rentStart,
                rentEnd: rentEnd,
                recentInvoice: recentInvoice,
                status: financialStatus.status,
                isOverdue: financialStatus.isOverdue,
                needsNotification: financialStatus.needsNotification,
                daysUntilDue: financialStatus.daysUntilDue,
                lastUpdated: new Date(),
                totalAmountDue: monthlyRent * paymentFrequency
              };
              
              // Only add notificationDate if it's not null/undefined
              if (financialStatus.notificationDate) {
                financialData.notificationDate = financialStatus.notificationDate;
              }
              
              // Save financial record
              await addDoc(collection(db, 'financial_records'), financialData);
              
              // Update employee status if day1 is empty (pending)
              const employeeUpdates = {};
              if (!day1) {
                employeeUpdates.status = 'pending_assignment';
              } else {
                employeeUpdates.status = 'housed';
              }
              
              // Update employee with financial reference
              employeeUpdates.contractNumber = contractNumber;
              employeeUpdates.financialStatus = financialStatus.status;
              employeeUpdates.lastFinancialUpdate = new Date();
              
              await updateDoc(employeeDoc.ref, employeeUpdates);
              
              // Create invoice record if recent_invoice exists
              if (recentInvoice && recentInvoice !== '') {
                const invoiceData = {
                  invoiceNumber: recentInvoice,
                  contractNumber: contractNumber,
                  employeeId: employeeDoc.id,
                  employeeName: employeeName,
                  amount: monthlyRent * paymentFrequency,
                  dueDate: rentEnd,
                  issueDate: rentStart,
                  status: 'paid', // Recent invoice is assumed to be paid
                  paidDate: new Date(), // Assume paid recently
                  paymentMethod: 'bank_transfer',
                  notes: 'Imported from CSV',
                  createdAt: new Date()
                };
                
                await addDoc(collection(db, 'invoices'), invoiceData);
                invoices.push(invoiceData);
              }
              
              processedCount++;
              console.log(`✓ Processed: ${employeeName} (Contract: ${contractNumber})`);

            } catch (error) {
              console.error(`Failed to process employee ${employeeName}:`, error);
              skippedCount++;
            }
          }
          
          console.log('\n=== Financial Data Seeding Summary ===');
          console.log(`Total records in CSV: ${employeesFromCSV.length}`);
          console.log(`Successfully processed: ${processedCount}`);
          console.log(`Skipped: ${skippedCount}`);
          console.log(`Invoices created: ${invoices.length}`);
          console.log('Financial data seeding completed successfully!');
          
          resolve();
        } catch (error) {
          console.error('Error during seeding process:', error);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        reject(error);
      });
  });
}

// --- Execute the script ---
if (require.main === module) {
  seedFinancials()
    .then(() => {
      console.log('Seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedFinancials }; 