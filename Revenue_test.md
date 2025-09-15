# Revenue Analysis Plan: Card A vs Card B Discrepancy

## Issue Summary
- **Card A (8月應收租金總額)**: $644,312.9 (theoretical monthly rent for all housed employees including expected arrivals)  
- **Card B (至8月26日已開票租金)**: $473,817.58 (total issued invoice amounts for August)
- **Discrepancy**: $170,495.32 (26.4% difference)
- **Analysis Date**: August 26, 2025

## Data Source Analysis

### Card A Calculation (pages/index.js:418-420)
- **Function**: `getCurrentMonthRentMetrics()` in `lib/rentCalculations.js:47-95`  
- **Calculation**: `calculateProjectedIncome()` for housed + prorated upcoming employees
- **Data Sources**: 
  - `employees` collection: status='housed', rent/monthlyRent fields
  - `employees` collection: status='approved'/'pending'/'pending_assignment' with arrival_at in August
- **Formula**: 
  - Housed employees: full monthly rent
  - Upcoming employees: prorated based on arrival date

### Card B Calculation (pages/index.js:429-431)  
- **Function**: `getCurrentMonthRentMetrics()` → `invoicedRent` 
- **Calculation**: Sum of current month invoices (received + not yet received)
- **Data Sources**: 
  - `invoices` collection filtered by coverage period (start_date to end_date overlaps August)
  - Includes status: 'paid', 'pending', 'due', 'overdue'
- **Filter Logic**: Invoice period overlaps with target month

## Step-by-Step Analysis Plan

### Phase 1: Data Extraction and Validation
1. **Extract All Housed Employees (Card A source)**
   - Query: `employees` where `status = 'housed'`
   - Collect: employee_id, name, rent/monthlyRent, assigned_property_id, status
   - Validate: 199 employees expected

2. **Extract Upcoming Employees with August Arrival**
   - Query: `employees` where `status` in ['approved', 'pending', 'pending_assignment'] AND `arrival_at` in August 2025
   - Calculate prorated rent for each
   - Sum theoretical Card A total

3. **Extract August Invoice Data (Card B source)**
   - Query: `invoices` where coverage period overlaps August 2025
   - Collect: invoice_id, employee_id, employee_names, amount, status, start_date, end_date
   - Sum total invoiced amounts

### Phase 2: Employee-by-Employee Comparison  
4. **Match Employees to Invoices**
   - For each housed employee, find corresponding August invoices
   - Match by: employee_id OR employee name in employee_names array
   - Identify mismatches and missing invoices

5. **Categorize Discrepancies**
   - **Missing Invoices**: Housed employees with no August invoice
   - **Amount Mismatches**: Employee rent ≠ invoice amount  
   - **Status Issues**: Wrong employee status affecting calculations
   - **Prorated Calculation Errors**: Incorrect prorated amounts for new arrivals

### Phase 3: Root Cause Analysis
6. **Invoice Generation Issues**
   - Check auto-generation scripts: `scripts/auto-generate-invoices.js`
   - Verify invoice creation logic matches rent calculation logic
   - Look for timing issues (invoices not generated yet vs. rent already counted)

7. **Data Integrity Checks**
   - Employee rent field consistency (rent vs monthlyRent)
   - Invoice-employee linking integrity  
   - Property assignment validation

### Phase 4: Reporting and Recommendations
8. **Generate Detailed CSV Report** 
   - Columns: employee_id, name, status, theoretical_rent, invoice_amount, discrepancy_amount, discrepancy_reason
   - Summary statistics by discrepancy type

9. **Provide Actionable Insights**
   - List specific employees causing discrepancies
   - Recommend process improvements
   - Suggest data validation rules

## Expected Output Files
- `revenue_August_detail.csv`: Employee-by-employee comparison
- `Revenue_test.md`: This analysis plan (current file)  
- Console output with key insights and summary statistics

## Implementation Notes
- Use Firebase collections: `employees`, `invoices`
- Date handling: August 2025 = month index 7, year 2025
- Currency handling: All amounts in same format as dashboard
- Handle missing/null data gracefully
- Preserve all calculation logic from existing dashboard functions

## Success Criteria
- Identify all 199 housed employees
- Account for every dollar of the $170k discrepancy  
- Provide actionable list of data corrections needed
- Enable same-day resolution of revenue reporting issues