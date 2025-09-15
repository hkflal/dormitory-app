# Employee v2 - Available Space Timeline View
## Product Requirements Document (PRD)

### 1. Executive Summary

This document outlines the requirements for Employee v2, a new feature that provides a comprehensive table view showing available bed space across all properties with a timeline perspective. The feature aims to improve capacity planning and employee placement decisions by visualizing availability patterns over time.

### 2. Problem Statement

Currently, the employee management system provides:
- Individual employee records with property assignments
- Property-specific occupancy information
- Static capacity views

However, it lacks:
- **Timeline visibility** of bed availability across properties
- **Demand vs. supply analysis** at specific time periods
- **Consolidated view** of total available capacity
- **Historical and projected** space planning capabilities

### 3. Solution Overview

Employee v2 introduces a **tabular timeline view** that displays:
- **X-axis**: All properties (with a "總床位" total column)
- **Y-axis**: Monthly timeline from current month to latest employee arrival date
- **Data visualization**: Available beds, occupied beds, and demand indicators
- **Demand analysis**: Shows positive/negative demand values per time period

### 4. Current System Analysis

#### 4.1 Employee Data Model
Based on `/pages/employees.js` analysis:

```javascript
employee = {
  id: string,
  name: string,
  arrival_at: Date,
  gender: 'male' | 'female',
  company: string,
  assigned_property_id: string,
  assigned_room_name: string,
  status: 'pending_assignment' | 'pending' | 'housed' | 'terminated' | 'pending_resign' | 'resigned',
  contact_info: string,
  notes: string,
  departure_date?: Date,
  departure_reason?: string
}
```

#### 4.2 Property Data Model
Based on `/pages/properties.js` analysis:

```javascript
property = {
  id: string,
  name: string,
  address: string,
  location: string,
  target_gender_type: 'male' | 'female' | 'any',
  capacity: number, // Total bed capacity
  occupancy: number, // Current occupancy
  rooms: [
    {
      room_name: string,
      capacity: number,
      amenities: string[]
    }
  ],
  genderTypes: string[],
  status: 'active' | 'pending'
}
```

### 5. Feature Requirements

#### 5.1 Core Features

##### 5.1.1 Table Structure
- **Header Row**: Property names + "總床位" column + "需求" column
- **Timeline Rows**: Each row represents the 1st day of each month
- **Timeline Range**: Current month → month of latest employee `arrival_at` date

##### 5.1.2 總床位 (Total Beds) Column
- **Male Total**: Sum of available beds across all male properties
- **Female Total**: Sum of available beds across all female properties  
- **Mixed Properties**: Count towards both totals if `target_gender_type === 'any'`
- **Visual Indicator**: Color-coded by gender (blue for male, pink for female)

##### 5.1.3 需求 (Demand) Column  
- **Calculation**: Number of employees expected to arrive in that month
- **Positive Values**: More employees arriving than capacity
- **Negative Values**: More capacity than employees arriving
- **Zero**: Perfect balance
- **Color Coding**: Green (negative/surplus), Yellow (balanced), Red (positive/deficit)

##### 5.1.4 Property Columns
For each property, show available beds per month:
- **Available Beds**: `property.capacity - occupied_beds_for_month`
- **Occupied Beds**: Count of employees with `status: 'housed'` and `assigned_property_id: property.id`
- **Projected Occupancy**: Include employees with `status: 'pending'` if their `arrival_at` <= month date

##### 5.1.5 Data Calculation Logic

```javascript
// For each month and property
function getAvailableBedsForMonth(property, month, employees) {
  const monthStart = new Date(month.year, month.month - 1, 1);
  const monthEnd = new Date(month.year, month.month, 0);
  
  const occupiedCount = employees.filter(emp => {
    const isAssignedToProperty = emp.assigned_property_id === property.id;
    const hasArrived = emp.arrival_at <= monthStart;
    const hasNotLeft = !emp.departure_date || emp.departure_date > monthEnd;
    const isActiveStatus = ['housed', 'pending'].includes(emp.status);
    
    return isAssignedToProperty && hasArrived && hasNotLeft && isActiveStatus;
  }).length;
  
  return Math.max(0, property.capacity - occupiedCount);
}

function getDemandForMonth(month, employees) {
  const monthStart = new Date(month.year, month.month - 1, 1);
  const monthEnd = new Date(month.year, month.month, 0);
  
  const arrivingEmployees = employees.filter(emp => {
    const arrivalMonth = emp.arrival_at;
    return arrivalMonth >= monthStart && arrivalMonth <= monthEnd;
  }).length;
  
  return arrivingEmployees;
}
```

### 6. User Interface Requirements

#### 6.1 Layout
- **Full-width table** with horizontal scrolling
- **Sticky header** row (property names)
- **Sticky first column** (month labels)
- **Responsive design** for mobile/tablet viewing

#### 6.2 Visual Design
- **Color Scheme**: 
  - Male properties: Blue tones (#2563eb)
  - Female properties: Pink tones (#ec4899) 
  - Mixed properties: Purple tones (#7c3aed)
  - Positive demand: Red (#dc2626)
  - Negative demand: Green (#16a34a)
  - Neutral demand: Yellow (#eab308)

#### 6.3 Cell Content Format
```
Available Beds: XX
Occupied: XX/XX
(XX% occupancy)
```

#### 6.4 Interactive Features
- **Hover Effects**: Show detailed breakdown on cell hover
- **Click Actions**: Navigate to property detail or employee list
- **Filtering**: By gender, property status, time range
- **Export**: CSV/Excel export functionality

### 7. Technical Implementation

#### 7.1 New Component Structure
```
pages/employee-v2.js
├── components/
│   ├── TimelineTable.jsx
│   ├── PropertyColumn.jsx  
│   ├── DemandColumn.jsx
│   ├── TotalBedsColumn.jsx
│   └── MonthRow.jsx
```

#### 7.2 Data Fetching
- Reuse existing Firebase collections: `employees`, `properties`
- Implement caching for performance optimization
- Real-time updates using Firestore listeners

#### 7.3 State Management
```javascript
const [timelineData, setTimelineData] = useState({
  months: [], // Array of month objects
  properties: [], // Array of property objects  
  employees: [], // Array of employee objects
  availabilityMatrix: {}, // month_id -> property_id -> available_count
  demandByMonth: {}, // month_id -> demand_count
  totalsByMonth: {} // month_id -> { male: number, female: number }
});
```

### 8. Performance Considerations

#### 8.1 Optimization Strategies
- **Data Virtualization**: Only render visible rows/columns
- **Memoization**: Cache calculated values using React.memo
- **Lazy Loading**: Load data progressively based on viewport
- **Debounced Updates**: Batch real-time updates to prevent excessive re-renders

#### 8.2 Scalability
- Support for **1000+ employees** and **100+ properties**
- **24-month timeline** maximum to prevent performance degradation
- **Pagination** or **infinite scroll** for extended date ranges

### 9. Testing Requirements

#### 9.1 Unit Tests
- Timeline calculation logic
- Data filtering and sorting
- Component rendering with various data states

#### 9.2 Integration Tests  
- Firebase data fetching and real-time updates
- Cross-property calculations
- Month-to-month transitions

#### 9.3 User Acceptance Testing
- Verify accuracy of availability calculations
- Confirm demand analysis correctness
- Test responsive design across devices

### 10. Success Metrics

#### 10.1 Usage Metrics
- **Daily Active Users** accessing Employee v2
- **Session Duration** on the timeline view
- **Export Frequency** of timeline data

#### 10.2 Business Metrics
- **Reduction in Overbooking** incidents
- **Improved Capacity Utilization** rates
- **Faster Employee Placement** decisions

### 11. Future Enhancements

#### 11.1 Phase 2 Features
- **Drag-and-Drop** employee assignment from timeline
- **Predictive Analytics** for future demand
- **Automated Alerts** for capacity issues
- **Integration with Booking System**

#### 11.2 Advanced Visualizations
- **Heat Map View** showing occupancy intensity
- **Gantt Chart** for employee lifecycle tracking
- **Capacity Planning Dashboard** with trend analysis

### 12. Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1: Data Layer** | 1 week | Timeline calculation logic, data fetching |
| **Phase 2: UI Components** | 1.5 weeks | Table structure, basic visualization |
| **Phase 3: Interactions** | 1 week | Filtering, hover effects, navigation |
| **Phase 4: Polish** | 0.5 week | Performance optimization, responsive design |

**Total Estimated Duration: 4 weeks**

### 13. Risk Assessment

#### 13.1 Technical Risks
- **Performance Issues**: Large dataset rendering
  - *Mitigation*: Implement virtualization and pagination
- **Data Consistency**: Real-time updates conflicts
  - *Mitigation*: Use Firestore transactions and optimistic updates

#### 13.2 Business Risks
- **User Adoption**: Complex interface learning curve
  - *Mitigation*: Provide guided tours and training materials
- **Data Accuracy**: Incorrect capacity calculations
  - *Mitigation*: Extensive testing and validation rules

### 14. Dependencies

#### 14.1 Technical Dependencies
- Firebase Firestore (existing)
- React 18+ (existing)
- Next.js framework (existing)
- Tailwind CSS (existing)

#### 14.2 Data Dependencies
- Accurate `employee.arrival_at` dates
- Correct `property.capacity` values
- Proper `employee.status` management
- Clean `property.target_gender_type` data

### 15. Approval and Sign-off

This PRD requires approval from:
- [ ] Product Owner
- [ ] Technical Lead  
- [ ] UX/UI Designer
- [ ] Stakeholder Representative

---

**Document Version**: 1.0  
**Last Updated**: September 13, 2025  
**Next Review Date**: September 20, 2025