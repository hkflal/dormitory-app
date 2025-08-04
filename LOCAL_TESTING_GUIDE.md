# 🧪 Local Testing Guide - 0802 Update Features

## 📋 Pre-Testing Setup

### 1. Development Server Status
- ✅ Dev server should be running on `http://localhost:3000`
- ✅ Ensure Firebase emulators are connected (if using local Firestore)
- ✅ Verify all new library files are properly imported

### 2. Test Environment Preparation
```bash
# Start development server (already running)
npm run dev

# Optional: Start Firebase emulators for isolated testing
firebase emulators:start --only firestore
```

## 🎯 Feature Testing Checklist

### **Feature 1: Updated Dashboard KPI Cards** ⭐ HIGH PRIORITY

#### Test 1.1: New KPI Card Display
**Expected Changes:**
- [ ] **Card 1**: "應收租金總額" (instead of "總帳面營業額")
- [ ] **Card 2**: "已收租金" with collection rate percentage (instead of "總成本")
- [ ] **Card 3**: "未收租金" (instead of "帳面收入")

**Testing Steps:**
1. Navigate to `http://localhost:3000` (dashboard)
2. Verify main KPI cards show new labels and calculations
3. Check that collection rate percentage is displayed
4. Confirm no operating costs are mentioned anywhere

#### Test 1.2: Financial Overview Section
**Expected Changes:**
- [ ] "財務概覽" section (instead of "成本分析")
- [ ] Three cards: "物業成本", "收款率", "淨收益"
- [ ] No "營運成本" card anywhere
- [ ] Net income calculation: received rent - property costs

### **Feature 2: Enhanced Employee Status Management** ⭐ HIGH PRIORITY

#### Test 2.1: Employee Page Filtering
**Testing Steps:**
1. Navigate to `/employees` page
2. Check status dropdown includes:
   - [ ] "即將離職" (pending_resign)
   - [ ] "已離職" (resigned)
3. Verify "顯示已離職員工" checkbox exists
4. Test filtering with resigned toggle on/off

#### Test 2.2: Employee Status Display
**Expected Behavior:**
- [ ] Resigned employees hidden by default
- [ ] Toggle shows/hides resigned employees
- [ ] New status badges display correctly
- [ ] Assignment rate calculation excludes resigned employees

#### Test 2.3: Employee Edit Modal ⭐ CRITICAL
**Testing Steps:**
1. Click "編輯" button on any employee
2. Check status dropdown includes:
   - [ ] "即將離職" (pending_resign)
   - [ ] "已離職" (resigned)
3. **Test Conditional Fields:**
   - [ ] Select "即將離職" - departure date field appears with "預計離職日期" label
   - [ ] Select "已離職" - departure date field appears with "實際離職日期" label
   - [ ] Departure reason field appears for both resignation statuses
   - [ ] Fields hidden for other statuses (pending, housed, etc.)
4. **Test Validation:**
   - [ ] Try saving "即將離職" with past date - should show error
   - [ ] Try saving resignation status without departure date - should show error
   - [ ] Save with valid future date for "即將離職" - should work
5. **Test Status Badges:**
   - [ ] "即將離職" shows orange badge
   - [ ] "已離職" shows red badge

### **Feature 3: Monthly Financial Snapshots** ⭐ MEDIUM PRIORITY

#### Test 3.1: Snapshot Calculation Functions
**Manual Testing (Browser Console):**
```javascript
// Test the calculation functions in browser console
// (These functions should be accessible via the global window object)
```

#### Test 3.2: Monthly Snapshot Modal (if integrated)
**Testing Steps:**
1. Look for "Create Snapshot" button in financials page
2. Test modal functionality:
   - [ ] Year/month selection
   - [ ] Preview calculation
   - [ ] Form validation
   - [ ] Error handling

### **Feature 4: Data Integrity Verification** ⭐ HIGH PRIORITY

#### Test 4.1: Resigned Employee Exclusion
**Testing Steps:**
1. Check dashboard calculations exclude resigned employees
2. Verify property occupancy rates are accurate
3. Confirm rent calculations only include active employees

#### Test 4.2: Collection Rate Accuracy ⭐ CRITICAL BUG FIXED
**Manual Verification:**
1. Compare "已收租金" + "未收租金" = "應收租金總額"
2. Verify collection rate percentage calculation
3. **FIXED:** Check that invoices covering current month are counted (not just issued in current month)

**🚨 Critical Fix Applied:**
- Invoice filtering now uses coverage period (start_date to end_date) instead of just issueDate
- August calculations now include quarterly invoices covering June-August
- Multi-month invoices properly counted based on period overlap
- Should NO LONGER show $0 for August rent calculations

## 🚨 Critical Issues to Watch For

### High Priority Issues:
1. **Operating Costs Still Visible** - Should be completely removed
2. **Resigned Employees Counted** - Should be excluded from all calculations
3. **Collection Rate Errors** - Math should add up correctly
4. **Status Filter Broken** - New statuses should work properly

### Medium Priority Issues:
1. **UI Layout Broken** - New cards should fit properly
2. **Performance Issues** - Page load should remain fast
3. **Mobile Responsiveness** - All new components should work on mobile

## 📊 Manual Verification Checklist

### Dashboard Verification:
- [ ] All KPI cards display new metrics correctly
- [ ] No operating costs mentioned anywhere
- [ ] Collection rate makes mathematical sense
- [ ] Resigned employees card shows accurate count
- [ ] Financial overview section displays properly

### Employee Page Verification:
- [ ] Resigned filter toggle works correctly
- [ ] New status options available in dropdowns
- [ ] Status badges display with correct colors
- [ ] Search and filtering work with new statuses

### Data Consistency Verification:
- [ ] Dashboard totals match employee page totals
- [ ] Property occupancy rates make sense
- [ ] No JavaScript errors in browser console
- [ ] All new library functions are working

## 🔧 Troubleshooting Common Issues

### Issue: "Function not found" errors
**Solution:** Check imports in modified pages:
```javascript
// Verify these imports exist
import { getCurrentMonthRentMetrics } from '../lib/rentCalculations';
import { getActiveEmployees } from '../lib/employeeFilters';
```

### Issue: Resigned employees still counted
**Solution:** Check filtering logic uses new functions:
```javascript
// Should use these new functions
const activeEmployees = getActiveEmployees(employees);
const rentMetrics = getCurrentMonthRentMetrics(employees, invoices, year, month);
```

### Issue: Collection rate showing NaN or incorrect values
**Solution:** Verify data types and null handling in calculations

## ✅ Testing Sign-Off

### Developer Testing Complete:
- [ ] All dashboard KPIs working correctly
- [ ] Employee filtering functioning properly  
- [ ] No operating costs visible anywhere
- [ ] Resigned employees properly excluded
- [ ] Collection rates calculating correctly
- [ ] No JavaScript console errors
- [ ] Mobile responsiveness maintained

### Ready for User Acceptance Testing:
- [ ] All critical features verified
- [ ] No blocking issues found
- [ ] Performance acceptable
- [ ] UI/UX improvements confirmed

---

## 📝 Notes for Manual Testing:

**Test Data Requirements:**
- At least 1 employee with 'resigned' status
- Mix of paid and unpaid invoices for current month
- Various employee statuses for filtering tests

**Browser Testing:**
- Test in Chrome, Firefox, Safari
- Verify mobile responsiveness
- Check dark mode compatibility

**Performance Monitoring:**
- Watch for slow page loads
- Monitor memory usage
- Check for excessive API calls

---

**Next Step After Testing:** Once all features are verified locally, document any issues found and create a final pre-deployment verification checklist. 