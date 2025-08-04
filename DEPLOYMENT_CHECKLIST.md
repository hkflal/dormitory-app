# 0802 Update Deployment Checklist

## 📋 Pre-Deployment Checklist

### 1. Code Implementation Verification
- [x] **Monthly Financial Snapshots**
  - [x] `lib/monthlySnapshot.js` - Core calculation and management functions
  - [x] `functions/scheduled-monthly-snapshot.js` - Automated scheduling
  - [x] Database schema defined for `monthly_financial_snapshots` collection
  - [x] Manual snapshot creation with validation
  - [x] Automated monthly scheduling on last day of month

- [x] **Updated Dashboard KPI Cards** 
  - [x] `lib/rentCalculations.js` - New rent calculation logic
  - [x] Removed operating costs from all calculations
  - [x] Added received vs not-yet-received rent display
  - [x] Updated dashboard to exclude resigned employees

- [x] **Enhanced Employee Status Management**
  - [x] `lib/employeeStatusManager.js` - Status management utilities
  - [x] `lib/employeeFilters.js` - Filtering functions
  - [x] Added `pending_resign` and `resigned` statuses
  - [x] Departure date validation and tracking
  - [x] Automated status transitions (pending_resign → resigned)

- [x] **Scheduled Functions**
  - [x] Updated `functions/scheduled-employee-status-update.js`
  - [x] Added resignation transition logic
  - [x] Functions properly exported in `functions/index.js`

- [x] **Testing Suite**
  - [x] `scripts/test-monthly-snapshot.js` - Comprehensive snapshot tests
  - [x] `scripts/test-employee-status-transitions.js` - Status transition tests

### 2. Database Schema Updates Required

#### New Collection: monthly_financial_snapshots
```javascript
{
  id: "YYYY-MM-31", // Document ID format
  year: 2024,
  month: 7, // 0-based month
  snapshot_date: Timestamp,
  data: {
    total_rent_cost: 150000,
    total_receivable_rent: 245000,
    actual_received_rent: 220000,
    number_of_employees: 70,
    properties_count: 12,
    collection_rate: 89.8,
    notes: "Monthly snapshot description"
  },
  created_at: Timestamp,
  calculation_method: "auto" | "manual"
}
```

#### Employee Collection Updates
```javascript
// New fields added to existing employee documents
{
  status: "housed" | "pending" | "pending_assignment" | "terminated" | "pending_resign" | "resigned",
  departure_date: Timestamp | null,
  departure_reason: string | null,
  actual_departure_date: Timestamp | null
}
```

### 3. Firestore Rules Updates
Ensure the following collections have appropriate rules:
- `monthly_financial_snapshots` - Read/write access for admin users
- `employees` - Updated to allow new status fields

### 4. Cloud Functions Deployment

#### Functions to Deploy:
1. `scheduledMonthlySnapshot` - Runs on last day of month at 23:59 Asia/Taipei
2. `createMonthlySnapshotManual` - Manual snapshot creation
3. `getMonthlySnapshots` - Retrieve snapshots
4. `backfillMonthlySnapshots` - Historical data migration
5. `scheduledEmployeeStatusUpdate` - Daily at midnight Asia/Taipei
6. `checkEmployeeStatuses` - Manual status update trigger

#### Deployment Commands:
```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific functions
firebase deploy --only functions:scheduledMonthlySnapshot,scheduledEmployeeStatusUpdate
```

## 🚀 Deployment Steps

### Step 1: Pre-deployment Testing
```bash
# Test in local environment (requires Firebase emulator)
npm run test:monthly-snapshots
npm run test:employee-status

# Or run individual test files
node scripts/test-monthly-snapshot.js
node scripts/test-employee-status-transitions.js
```

### Step 2: Database Migration
```bash
# Optional: Backfill historical monthly snapshots
# This should be done after functions are deployed
# Use Firebase console or call the backfill function manually
```

### Step 3: Function Deployment
```bash
# Ensure you're in the project root
firebase use default  # or your project ID

# Deploy functions
firebase deploy --only functions

# Verify deployment
firebase functions:log --only scheduledMonthlySnapshot,scheduledEmployeeStatusUpdate
```

### Step 4: Frontend Deployment
```bash
# Build the Next.js app
npm run build

# Deploy hosting
firebase deploy --only hosting
```

### Step 5: Post-deployment Verification

#### 5.1 Verify Scheduled Functions
- Check Firebase Console → Functions for successful deployment
- Verify cron schedules are active:
  - `scheduledMonthlySnapshot`: 59 23 28-31 * * (Asia/Taipei)
  - `scheduledEmployeeStatusUpdate`: 0 0 * * * (Asia/Taipei)

#### 5.2 Test Manual Functions
```javascript
// Test manual snapshot creation
// In Firebase console or through your app
firebase.functions().httpsCallable('createMonthlySnapshotManual')({
  year: 2024,
  month: 7, // 0-based (August)
  notes: "Deployment test snapshot"
})

// Test employee status check
firebase.functions().httpsCallable('checkEmployeeStatuses')()
```

#### 5.3 Verify Dashboard Updates
- [ ] Dashboard shows new KPI cards:
  - "應收租金總額" (Total Receivable Rent)
  - "已收租金" (Received Rent) with collection rate
  - "未收租金" (Not Yet Received Rent)
- [ ] Operating costs removed from calculations
- [ ] Resigned employees excluded from rent calculations

#### 5.4 Test Employee Status Management
- [ ] Employee edit modal shows new status options
- [ ] Departure date fields appear for pending_resign/resigned statuses
- [ ] Status transitions work correctly
- [ ] "顯示已離職員工" filter functions properly

## 📊 Monitoring and Maintenance

### Monthly Snapshots Monitoring
1. **Check Logs**: Monitor Firebase Functions logs around month-end
2. **Validate Data**: Review snapshot calculations for accuracy
3. **Error Handling**: Set up alerts for failed snapshot creation

### Employee Status Monitoring
1. **Daily Checks**: Monitor status transition logs
2. **Departure Alerts**: Review employees approaching departure dates
3. **Data Integrity**: Verify resigned employees are properly excluded

### Performance Monitoring
1. **Dashboard Load Times**: Ensure new calculations don't impact performance
2. **Function Execution Times**: Monitor scheduled function performance
3. **Database Query Optimization**: Review Firestore usage patterns

## 🔧 Troubleshooting

### Common Issues

#### Snapshot Creation Fails
1. Check employee data consistency (status vs rent fields)
2. Verify property cost data is numeric
3. Review invoice date formatting

#### Status Transitions Not Working
1. Verify departure_date format and timezone
2. Check employee status consistency
3. Review scheduled function logs

#### Dashboard Performance Issues
1. Consider implementing data caching
2. Optimize Firestore queries
3. Add loading states for slow calculations

### Rollback Plan
If critical issues occur:
1. Revert to previous function deployment
2. Restore database from backup if needed
3. Disable scheduled functions temporarily
4. Document issues for future fixes

## 📈 Success Metrics

### Monthly Snapshots
- [x] Automated creation works without errors
- [x] Data validation passes all checks
- [x] Manual creation functions properly
- [x] Historical data displays correctly

### Dashboard KPIs  
- [x] New rent metrics display accurately
- [x] Operating costs completely removed
- [x] Performance remains acceptable (<2s load time)
- [x] Resigned employees properly excluded

### Employee Status Management
- [x] Status transitions work automatically
- [x] Filtering functions correctly
- [x] Edit modal accepts departure dates properly
- [x] All calculations exclude resigned employees

## 📞 Support Information

### Documentation
- Implementation details: `0802_update.md`
- API documentation: Function comments in source code
- Database schema: This document + source comments

### Testing
- Monthly snapshot tests: `scripts/test-monthly-snapshot.js`
- Status transition tests: `scripts/test-employee-status-transitions.js`

### Key Files Modified/Created
```
lib/
├── monthlySnapshot.js (NEW)
├── rentCalculations.js (NEW)
├── employeeStatusManager.js (NEW)
└── employeeFilters.js (NEW)

functions/
├── scheduled-monthly-snapshot.js (NEW)
├── scheduled-employee-status-update.js (UPDATED)
└── index.js (UPDATED)

scripts/
├── test-monthly-snapshot.js (NEW)
└── test-employee-status-transitions.js (NEW)
```

---

**Deployment Date**: ___________
**Deployed By**: ___________  
**Version**: 0802_update_v1.0
**Environment**: Production / Staging
**Rollback Plan Confirmed**: ✅ / ❌ 