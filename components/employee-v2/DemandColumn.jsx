export default function DemandColumn({
  monthId,
  demand,
  onHover,
  onLeave
}) {
  // Handle missing demand data
  if (!demand) {
    return (
      <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-2">
        無數據
      </div>
    );
  }

  const { total, male, female, employees } = demand;

  // Determine demand status and coloring
  const getDemandColor = () => {
    if (total === 0) return 'border-gray-200 bg-gray-50 text-gray-700';
    if (total > 20) return 'border-red-200 bg-red-50 text-red-800'; // High demand
    if (total > 10) return 'border-orange-200 bg-orange-50 text-orange-800'; // Medium demand
    if (total > 5) return 'border-yellow-200 bg-yellow-50 text-yellow-800'; // Moderate demand
    return 'border-green-200 bg-green-50 text-green-800'; // Low demand
  };

  const getDemandStatus = () => {
    if (total === 0) return '無需求';
    if (total > 20) return '需求很高';
    if (total > 10) return '需求高';
    if (total > 5) return '需求中等';
    return '需求低';
  };

  const getDemandIcon = () => {
    if (total === 0) return '⚪';
    if (total > 20) return '🔴';
    if (total > 10) return '🟠';
    if (total > 5) return '🟡';
    return '🟢';
  };

  return (
    <div
      className={`text-center p-1 cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700 ${
        total === 0 ? 'text-gray-500 dark:text-gray-400' :
        total > 20 ? 'text-red-600 font-bold' :
        total > 10 ? 'text-orange-600' :
        'text-gray-900 dark:text-gray-100'
      }`}
      onMouseEnter={() => onHover && onHover(demand)}
      onMouseLeave={() => onLeave && onLeave()}
    >
      {/* Demand - Single Number */}
      <div className="text-sm font-medium">
        {total}
      </div>
    </div>
  );
}