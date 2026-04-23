import KPICards from './KPICards'
import EquityCurve from './EquityCurve'
import WinLossDonut from './WinLossDonut'
import RHistogram from './RHistogram'
import SetupChart from './SetupChart'
import { calcStats } from '../../utils/calculations'

export default function Dashboard({ trades }) {
  const stats = calcStats(trades)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <KPICards stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="lg:col-span-2">
          <EquityCurve trades={trades} />
        </div>
        <WinLossDonut trades={trades} />
        <RHistogram trades={trades} />
        <div className="lg:col-span-2">
          <SetupChart trades={trades} />
        </div>
      </div>
    </div>
  )
}
