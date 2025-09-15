import { useMemo } from 'react';

export default function PropertyColumn({
  monthId,
  property,
  availability,
  employees,
  onHover,
  onLeave
}) {
  // Calculate color based on occupancy rate
  const getOccupancyColor = (occupancyRate) => {
    if (occupancyRate >= 100) return 'bg-red-100 text-red-800 border-red-200';
    if (occupancyRate >= 80) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (occupancyRate >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (occupancyRate >= 40) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (occupancyRate > 0) return 'bg-green-100 text-green-800 border-green-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Get property employees for this month
  const propertyEmployees = useMemo(() => {
    if (!availability || !employees) return [];
    
    return employees.filter(emp => {
      return emp.assigned_property_id === property.id && ['housed', 'pending'].includes(emp.status);
    });
  }, [availability, employees, property.id]);

  // Handle missing availability data
  if (!availability) {
    return (
      <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-2">
        無數據
      </div>
    );
  }

  const { occupied, available, capacity, occupancyRate } = availability;
  const colorClass = getOccupancyColor(occupancyRate);

  // Get gender-specific background color
  const getGenderBackground = () => {
    if (property.target_gender_type === 'male') {
      return 'bg-blue-100 hover:bg-blue-200';
    } else if (property.target_gender_type === 'female') {
      return 'bg-pink-100 hover:bg-pink-200';
    } else {
      // Mixed properties - use light gray
      return 'bg-gray-100 hover:bg-gray-200';
    }
  };

  // Get text color - black by default, red only for negative numbers
  const getTextColor = () => {
    return 'text-black';
  };

  return (
    <div
      className={`text-center p-1 cursor-pointer transition-all ${getGenderBackground()} ${getTextColor()} h-6 flex items-center justify-center`}
      onMouseEnter={() => onHover && onHover(availability)}
      onMouseLeave={() => onLeave && onLeave()}
    >
      {/* Available Beds - Single Number */}
      <div className="text-xs font-medium">
        {available}
      </div>
    </div>
  );
}