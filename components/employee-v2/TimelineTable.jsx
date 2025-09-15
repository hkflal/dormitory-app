import { useState, useMemo } from 'react';
import GenderTotalColumn from './GenderTotalColumn';
import GenderArrivalColumn from './GenderDemandColumn';
import PropertyColumn from './PropertyColumn';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export default function TimelineTable({
  months,
  properties,
  employees,
  availabilityMatrix,
  demandByMonth,
  totalsByMonth
}) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const [hoveredCell, setHoveredCell] = useState(null);

  // Show all properties on one page (remove pagination)
  const paginatedProperties = properties;


  if (months.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <div className="text-lg font-medium">沒有可用的時間線數據</div>
        <div className="text-sm mt-2">請確保有員工數據和到達日期</div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Compact Scrollable Table Container */}
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)', fontSize: '11px' }}>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
          {/* Sticky Header */}
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
            <tr>
              {/* Month Column Header - Compact */}
              <th className="sticky left-0 z-20 w-14 px-1 py-1 bg-gray-50 dark:bg-gray-700 text-left text-xs font-medium text-gray-500 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600">
                月份
              </th>
              
              {/* Total Beds Male Column Header - Compact */}
              <th className="w-12 px-1 py-1 text-center text-xs font-medium text-blue-600 dark:text-blue-400 border-r border-gray-300 dark:border-gray-600">
                總床位(男)
              </th>
              
              {/* Total Beds Female Column Header - Compact */}
              <th className="w-12 px-1 py-1 text-center text-xs font-medium text-pink-600 dark:text-pink-400 border-r border-gray-300 dark:border-gray-600">
                總床位(女)
              </th>
              
              {/* Arrival Male Column Header - Compact */}
              <th className="w-12 px-1 py-1 text-center text-xs font-medium text-blue-600 dark:text-blue-400 border-r border-gray-300 dark:border-gray-600">
                到達(男)
              </th>
              
              {/* Arrival Female Column Header - Compact */}
              <th className="w-12 px-1 py-1 text-center text-xs font-medium text-pink-600 dark:text-pink-400 border-r border-gray-300 dark:border-gray-600">
                到達(女)
              </th>
              
              {/* Property Headers - Compact Horizontal */}
              {paginatedProperties.map((property) => (
                <th
                  key={property.id}
                  className="w-12 px-1 py-1 text-center text-xs font-medium text-gray-500 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600"
                >
                  <div className="space-y-1">
                    <div className="font-semibold truncate text-xs" title={property.name}>
                      {property.name.length > 6 ? property.name.substring(0, 6) + '.' : property.name}
                    </div>
                    <div className="flex items-center justify-center space-x-1">
                      <div className={`w-1 h-1 rounded-full ${
                        property.target_gender_type === 'male' ? 'bg-blue-500' :
                        property.target_gender_type === 'female' ? 'bg-pink-500' :
                        'bg-purple-500'
                      }`}></div>
                      <span className="text-xs">
                        {property.target_gender_type === 'male' ? '男' :
                         property.target_gender_type === 'female' ? '女' : '混'}
                      </span>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {months.map((month, monthIndex) => (
              <tr
                key={month.id}
                className={`${
                  monthIndex % 2 === 0 ? 'bg-gray-50 dark:bg-gray-750' : 'bg-white dark:bg-gray-800'
                } hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors h-6`}
              >
                {/* Month Label - Sticky & Compact */}
                <td className="sticky left-0 z-10 px-2 py-0 text-xs font-medium text-gray-900 dark:text-gray-100 bg-inherit border-r border-gray-300 dark:border-gray-600">
                  <div className="truncate text-xs">{month.label.replace('年', '/').replace('月', '')}</div>
                </td>

                {/* Total Beds Male Column - Compact */}
                <td className="px-1 py-0 border-r border-gray-300 dark:border-gray-600">
                  <GenderTotalColumn 
                    monthId={month.id}
                    total={totalsByMonth[month.id]?.male || 0}
                    gender="male"
                    onHover={(data) => setHoveredCell({ type: 'total-male', month: month.id, data })}
                    onLeave={() => setHoveredCell(null)}
                  />
                </td>

                {/* Total Beds Female Column - Compact */}
                <td className="px-1 py-0 border-r border-gray-300 dark:border-gray-600">
                  <GenderTotalColumn 
                    monthId={month.id}
                    total={totalsByMonth[month.id]?.female || 0}
                    gender="female"
                    onHover={(data) => setHoveredCell({ type: 'total-female', month: month.id, data })}
                    onLeave={() => setHoveredCell(null)}
                  />
                </td>

                {/* Arrival Male Column - Compact */}
                <td className="px-1 py-0 border-r border-gray-300 dark:border-gray-600">
                  <GenderArrivalColumn
                    monthId={month.id}
                    arrivals={demandByMonth[month.id]?.male || 0}
                    availableSpaces={totalsByMonth[month.id]?.male || 0}
                    gender="male"
                    onHover={(data) => setHoveredCell({ type: 'arrival-male', month: month.id, data })}
                    onLeave={() => setHoveredCell(null)}
                  />
                </td>

                {/* Arrival Female Column - Compact */}
                <td className="px-1 py-0 border-r border-gray-300 dark:border-gray-600">
                  <GenderArrivalColumn
                    monthId={month.id}
                    arrivals={demandByMonth[month.id]?.female || 0}
                    availableSpaces={totalsByMonth[month.id]?.female || 0}
                    gender="female"
                    onHover={(data) => setHoveredCell({ type: 'arrival-female', month: month.id, data })}
                    onLeave={() => setHoveredCell(null)}
                  />
                </td>

                {/* Property Columns - Compact */}
                {paginatedProperties.map((property) => (
                  <td
                    key={property.id}
                    className="px-1 py-0 border-r border-gray-300 dark:border-gray-600"
                  >
                    <PropertyColumn
                      monthId={month.id}
                      property={property}
                      availability={availabilityMatrix[month.id]?.[property.id]}
                      employees={employees}
                      onHover={(data) => setHoveredCell({ 
                        type: 'property', 
                        month: month.id, 
                        property: property.id, 
                        data 
                      })}
                      onLeave={() => setHoveredCell(null)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tooltip/Hover Details */}
      {hoveredCell && (
        <div className="absolute z-50 bg-black text-white text-xs rounded-lg p-3 pointer-events-none shadow-lg max-w-xs">
          <div className="space-y-1">
            {hoveredCell.type === 'total-male' && (
              <>
                <div className="font-semibold text-blue-300">男性總可用床位</div>
                <div>可用床位: {hoveredCell.data?.total || 0}床</div>
              </>
            )}
            {hoveredCell.type === 'total-female' && (
              <>
                <div className="font-semibold text-pink-300">女性總可用床位</div>
                <div>可用床位: {hoveredCell.data?.total || 0}床</div>
              </>
            )}
            {hoveredCell.type === 'arrival-male' && (
              <>
                <div className="font-semibold text-blue-300">男性到達分析</div>
                <div>到達人數: {hoveredCell.data?.arrivals || 0}人</div>
                <div>可用床位: {hoveredCell.data?.availableSpaces || 0}床</div>
                <div className="border-t pt-1">
                  {hoveredCell.data?.shortage > 0 ? (
                    <span className="text-red-300">短缺: {hoveredCell.data.shortage}床</span>
                  ) : (
                    <span className="text-green-300">充足: {(hoveredCell.data?.availableSpaces || 0) - (hoveredCell.data?.arrivals || 0)}床</span>
                  )}
                </div>
              </>
            )}
            {hoveredCell.type === 'arrival-female' && (
              <>
                <div className="font-semibold text-pink-300">女性到達分析</div>
                <div>到達人數: {hoveredCell.data?.arrivals || 0}人</div>
                <div>可用床位: {hoveredCell.data?.availableSpaces || 0}床</div>
                <div className="border-t pt-1">
                  {hoveredCell.data?.shortage > 0 ? (
                    <span className="text-red-300">短缺: {hoveredCell.data.shortage}床</span>
                  ) : (
                    <span className="text-green-300">充足: {(hoveredCell.data?.availableSpaces || 0) - (hoveredCell.data?.arrivals || 0)}床</span>
                  )}
                </div>
              </>
            )}
            {hoveredCell.type === 'property' && (
              <>
                <div className="font-semibold">物業詳情</div>
                <div>可用: {hoveredCell.data?.available || 0}床</div>
                <div>已佔用: {hoveredCell.data?.occupied || 0}床</div>
                <div>容量: {hoveredCell.data?.capacity || 0}床</div>
                <div>入住率: {Math.round(hoveredCell.data?.occupancyRate || 0)}%</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}