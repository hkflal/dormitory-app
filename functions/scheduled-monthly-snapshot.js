const functions = require('firebase-functions');
const admin = require('firebase-admin');

/**
 * Calculate monthly financial snapshot data
 * @param {number} year - Target year
 * @param {number} month - Target month (0-based)
 * @returns {Promise<Object>} Calculated snapshot data
 */
async function calculateMonthlySnapshot(year, month) {
  const db = admin.firestore();
  
  try {
    console.log(`📊 Calculating monthly snapshot for ${year}-${month + 1}`);
    
    // Fetch all required data
    const [employeesSnapshot, propertiesSnapshot, invoicesSnapshot] = await Promise.all([
      db.collection('employees').get(),
      db.collection('properties').get(),
      db.collection('invoices').get()
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 1. Total Rent Cost = Sum of all property costs
    const total_rent_cost = properties.reduce((sum, prop) => 
      sum + (parseFloat(prop.cost) || 0), 0);
    
    // 2. Total Receivable Rent = Sum of rent from housed employees (exclude resigned)
    const total_receivable_rent = employees
      .filter(emp => emp.status === 'housed' && emp.status !== 'resigned')
      .reduce((sum, emp) => sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0), 0);
    
    // 3. Actual Received Rent = Sum of paid invoices for the month
    const actual_received_rent = invoices
      .filter(inv => {
        const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
        return issueDate.getFullYear() === year && 
               issueDate.getMonth() === month && 
               inv.status === 'paid';
      })
      .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
    
    // 4. Number of Employees = Count of housed employees (exclude resigned)
    const number_of_employees = employees
      .filter(emp => emp.status === 'housed' && emp.status !== 'resigned').length;
    
    // 5. Collection rate calculation
    const collection_rate = total_receivable_rent > 0 ? 
      (actual_received_rent / total_receivable_rent * 100) : 0;

    return {
      total_rent_cost,
      total_receivable_rent,
      actual_received_rent,
      number_of_employees,
      properties_count: properties.length,
      collection_rate: Math.round(collection_rate * 100) / 100
    };
  } catch (error) {
    console.error('❌ Error calculating monthly snapshot:', error);
    throw error;
  }
}

/**
 * Create a monthly snapshot document
 * @param {number} year - Target year
 * @param {number} month - Target month (0-based)
 * @param {boolean} isManual - Whether this is a manual creation
 * @param {string} notes - Optional notes
 * @returns {Promise<Object>} Created snapshot document
 */
async function createMonthlySnapshot(year, month, isManual = false, notes = '') {
  const db = admin.firestore();
  
  try {
    const snapshotId = `${year}-${String(month + 1).padStart(2, '0')}-31`;
    
    // Check if snapshot already exists
    const existingDoc = await db.collection('monthly_financial_snapshots').doc(snapshotId).get();
    if (existingDoc.exists && !isManual) {
      console.log(`⚠️ Snapshot for ${snapshotId} already exists`);
      return existingDoc.data();
    }

    // Calculate snapshot data
    const snapshotData = await calculateMonthlySnapshot(year, month);
    
    // Create snapshot document
    const snapshot = {
      id: snapshotId,
      year,
      month,
      snapshot_date: new Date(),
      data: {
        ...snapshotData,
        notes: notes || `${new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })} 月度快照`
      },
      created_at: new Date(),
      calculation_method: isManual ? 'manual' : 'auto'
    };

    // Save to Firestore
    await db.collection('monthly_financial_snapshots').doc(snapshotId).set(snapshot);
    
    console.log(`✅ Monthly snapshot created for ${snapshotId}`);
    return snapshot;
  } catch (error) {
    console.error('❌ Error creating monthly snapshot:', error);
    throw error;
  }
}

/**
 * Scheduled function to create monthly snapshots
 * Runs on the last day of each month at 23:59
 */
exports.scheduledMonthlySnapshot = functions.pubsub
  .schedule('59 23 28-31 * *') // Run at 23:59 on days 28-31 of every month
  .timeZone('Asia/Taipei')
  .onRun(async (context) => {
    console.log('🕐 Running scheduled monthly snapshot...');
    
    try {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      // Check if today is the last day of the month
      const isLastDayOfMonth = today.getMonth() !== tomorrow.getMonth();
      
      if (!isLastDayOfMonth) {
        console.log('ℹ️ Today is not the last day of the month, skipping snapshot creation');
        return null;
      }
      
      const year = today.getFullYear();
      const month = today.getMonth();
      
      console.log(`📅 Creating monthly snapshot for ${year}-${month + 1} (last day of month)`);
      
      // Create the snapshot
      const snapshot = await createMonthlySnapshot(year, month, false, 
        `自動生成 - ${year}年${month + 1}月月末快照`);
      
      // Validate snapshot data
      const validation = validateSnapshotData(snapshot.data);
      if (!validation.isValid) {
        console.warn('⚠️ Snapshot validation issues:', validation.issues);
        
        // Send notification about validation issues (implement as needed)
        // await sendNotification('Monthly Snapshot Validation Issues', validation.issues.join(', '));
      }
      
      console.log('✅ Scheduled monthly snapshot completed successfully');
      console.log('📊 Snapshot summary:', {
        total_rent_cost: snapshot.data.total_rent_cost,
        total_receivable_rent: snapshot.data.total_receivable_rent,
        actual_received_rent: snapshot.data.actual_received_rent,
        collection_rate: snapshot.data.collection_rate,
        number_of_employees: snapshot.data.number_of_employees
      });
      
      return { success: true, snapshotId: snapshot.id };
      
    } catch (error) {
      console.error('❌ Error in scheduled monthly snapshot:', error);
      
      // Send error notification (implement as needed)
      // await sendErrorNotification('Monthly Snapshot Failed', error.message);
      
      throw error;
    }
  });

/**
 * Manual monthly snapshot creation function
 * Can be called via HTTP for manual snapshot creation
 */
exports.createMonthlySnapshotManual = functions.https.onCall(async (data, context) => {
  try {
    console.log('📋 Manual monthly snapshot creation triggered');
    
    const { year, month, notes } = data;
    
    // Validate input
    if (!year || month === undefined || month < 0 || month > 11) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid year or month provided'
      );
    }
    
    // Create the snapshot
    const snapshot = await createMonthlySnapshot(year, month, true, notes);
    
    console.log(`✅ Manual snapshot created for ${year}-${month + 1}`);
    
    return { 
      success: true, 
      snapshot,
      message: `月度快照已創建：${year}年${month + 1}月` 
    };
    
  } catch (error) {
    console.error('❌ Error in manual monthly snapshot:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to create monthly snapshot: ' + error.message
    );
  }
});

/**
 * Get monthly snapshots function
 * Can be called via HTTP to retrieve snapshots
 */
exports.getMonthlySnapshots = functions.https.onCall(async (data, context) => {
  try {
    const { limit = 12 } = data;
    const db = admin.firestore();
    
    const snapshotsQuery = db.collection('monthly_financial_snapshots')
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
      .limit(limit);
    
    const snapshot = await snapshotsQuery.get();
    const snapshots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return { success: true, snapshots };
    
  } catch (error) {
    console.error('❌ Error fetching monthly snapshots:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to fetch monthly snapshots: ' + error.message
    );
  }
});

/**
 * Validate snapshot data integrity
 * @param {Object} snapshotData - Snapshot data to validate
 * @returns {Object} Validation result with issues array
 */
function validateSnapshotData(snapshotData) {
  const issues = [];
  
  // Check for negative values
  if (snapshotData.total_rent_cost < 0) {
    issues.push('總租金成本不能為負數');
  }
  
  if (snapshotData.total_receivable_rent < 0) {
    issues.push('應收租金總額不能為負數');
  }
  
  if (snapshotData.actual_received_rent < 0) {
    issues.push('實際收到租金不能為負數');
  }
  
  // Check logical consistency
  if (snapshotData.actual_received_rent > snapshotData.total_receivable_rent * 1.1) {
    issues.push('實際收到租金明顯超過應收租金，請檢查資料');
  }
  
  if (snapshotData.number_of_employees === 0 && snapshotData.total_receivable_rent > 0) {
    issues.push('沒有員工但有應收租金，請檢查員工狀態');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Backfill monthly snapshots for historical data
 * Can be called via HTTP for data migration
 */
exports.backfillMonthlySnapshots = functions.https.onCall(async (data, context) => {
  try {
    console.log('🔄 Starting monthly snapshots backfill...');
    
    const { startYear, startMonth, endYear, endMonth } = data;
    
    if (!startYear || startMonth === undefined || !endYear || endMonth === undefined) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Start and end year/month are required'
      );
    }
    
    const results = [];
    let currentYear = startYear;
    let currentMonth = startMonth;
    
    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      try {
        const snapshot = await createMonthlySnapshot(
          currentYear, 
          currentMonth, 
          true, 
          `歷史資料回填 - ${currentYear}年${currentMonth + 1}月`
        );
        
        results.push({
          year: currentYear,
          month: currentMonth,
          success: true,
          snapshotId: snapshot.id
        });
        
        console.log(`✅ Created backfill snapshot for ${currentYear}-${currentMonth + 1}`);
        
      } catch (error) {
        console.error(`❌ Error creating backfill snapshot for ${currentYear}-${currentMonth + 1}:`, error);
        results.push({
          year: currentYear,
          month: currentMonth,
          success: false,
          error: error.message
        });
      }
      
      // Move to next month
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`✅ Backfill completed: ${successCount} successful, ${failureCount} failed`);
    
    return {
      success: true,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount
      }
    };
    
  } catch (error) {
    console.error('❌ Error in monthly snapshots backfill:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to backfill monthly snapshots: ' + error.message
    );
  }
}); 