export default function GenderTotalColumn({
  monthId,
  total,
  gender, // 'male' or 'female'
  onHover,
  onLeave
}) {
  // Handle missing total data
  if (typeof total !== 'number') {
    return (
      <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-1">
        -
      </div>
    );
  }

  // Get gender-specific background color
  const getGenderBackground = () => {
    if (gender === 'male') {
      return 'bg-blue-100 hover:bg-blue-200';
    } else if (gender === 'female') {
      return 'bg-pink-100 hover:bg-pink-200';
    }
    return 'bg-gray-100 hover:bg-gray-200';
  };

  // Get text color - black by default
  const getTextColor = () => {
    return 'text-black';
  };

  return (
    <div
      className={`text-center p-1 cursor-pointer transition-all ${getGenderBackground()} ${getTextColor()} h-6 flex items-center justify-center`}
      onMouseEnter={() => onHover && onHover({ gender, total })}
      onMouseLeave={() => onLeave && onLeave()}
    >
      {/* Total Available Beds - Single Number */}
      <div className="text-xs font-medium">
        {total}
      </div>
    </div>
  );
}