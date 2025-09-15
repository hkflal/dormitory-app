export default function TotalBedsColumn({
  monthId,
  totals,
  onHover,
  onLeave
}) {
  // Handle missing totals data
  if (!totals) {
    return (
      <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-2">
        無數據
      </div>
    );
  }

  const { male, female, mixed, total } = totals;

  // Determine predominant gender for coloring
  const getPredominantColor = () => {
    if (male > female && male > mixed) return 'border-blue-200 bg-blue-50';
    if (female > male && female > mixed) return 'border-pink-200 bg-pink-50';
    if (mixed > 0) return 'border-purple-200 bg-purple-50';
    return 'border-gray-200 bg-gray-50';
  };

  return (
    <div
      className={`text-center p-1 cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700 ${
        total === 0 ? 'text-red-600 font-bold' :
        total < 10 ? 'text-orange-600' :
        'text-gray-900 dark:text-gray-100'
      }`}
      onMouseEnter={() => onHover && onHover(totals)}
      onMouseLeave={() => onLeave && onLeave()}
    >
      {/* Total Available Beds - Single Number */}
      <div className="text-sm font-medium">
        {total}
      </div>
    </div>
  );
}