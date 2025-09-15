export default function GenderArrivalColumn({
  monthId,
  arrivals, // Number of people arriving this month for this gender
  availableSpaces, // Total available spaces for this gender (for context in hover)
  gender, // 'male' or 'female'
  onHover,
  onLeave
}) {
  // Handle missing arrival data
  if (typeof arrivals !== 'number') {
    return (
      <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-1">
        -
      </div>
    );
  }

  // Display the actual arrival count
  const displayValue = arrivals;

  // Get gender-specific background color
  const getGenderBackground = () => {
    if (gender === 'male') {
      return 'bg-blue-100 hover:bg-blue-200';
    } else if (gender === 'female') {
      return 'bg-pink-100 hover:bg-pink-200';
    }
    return 'bg-gray-100 hover:bg-gray-200';
  };

  // Get text color - black by default, red when arrivals exceed available spaces
  const getTextColor = () => {
    if (typeof availableSpaces === 'number' && arrivals > availableSpaces) {
      return 'text-red-600 font-bold'; // Red when not enough beds for arrivals
    }
    return 'text-black';
  };

  return (
    <div
      className={`text-center p-1 cursor-pointer transition-all ${getGenderBackground()} ${getTextColor()} h-6 flex items-center justify-center`}
      onMouseEnter={() => onHover && onHover({ 
        gender, 
        arrivals, 
        availableSpaces,
        shortage: Math.max(0, arrivals - (availableSpaces || 0))
      })}
      onMouseLeave={() => onLeave && onLeave()}
    >
      {/* Arrivals - Single Number */}
      <div className="text-xs font-bold">
        {displayValue}
      </div>
    </div>
  );
}