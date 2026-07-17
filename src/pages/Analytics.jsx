import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import StatCard from '../components/StatCard.jsx'
import Section from '../components/Section.jsx'
import { BarChart, GroupedBarChart, ColumnChart, DonutChart } from '../components/Charts.jsx'
import { getAllUsers, getAllRecords } from '../lib/firestoreHelpers.js'
import {
  analyticsSummary,
  ratingDistribution,
  headcountByDepartment,
  grievanceStatusCounts,
  leaveByType,
  recognitionsByMonth,
} from '../lib/analytics.js'

export default function Analytics() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [users, performance, grievances, recognitions, leaves] = await Promise.all([
      getAllUsers(),
      getAllRecords('performance'),
      getAllRecords('grievances'),
      getAllRecords('recognitions'),
      getAllRecords('leaves'),
    ])
    const employees = users.filter((u) => u.role === 'employee')
    setData({ employees, performance, grievances, recognitions, leaves })
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const derived = useMemo(() => {
    if (!data) return null
    return {
      summary: analyticsSummary(data),
      ratings: ratingDistribution(data.performance),
      departments: headcountByDepartment(data.employees),
      grievanceStatus: grievanceStatusCounts(data.grievances),
      leave: leaveByType(data.employees, data.leaves),
      recognitions: recognitionsByMonth(data.recognitions, 6),
    }
  }, [data])

  if (loading || !derived) {
    return (
      <Layout>
        <LoadingSpinner label="Crunching the numbers…" />
      </Layout>
    )
  }

  const { summary } = derived

  return (
    <Layout>
      <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>
      <p className="text-sm text-slate-500">Team-wide trends across performance, grievances, leave and recognition.</p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Team Size" value={summary.teamSize} />
        <StatCard label="Avg. Review Rating" value={summary.avgRating} />
        <StatCard label="Open Grievances" value={summary.openGrievances} />
        <StatCard label="Overdue (SLA)" value={summary.overdueGrievances} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Grievances by status">
          <DonutChart data={derived.grievanceStatus} />
        </Section>

        <Section title="Review rating distribution">
          <BarChart data={derived.ratings} />
        </Section>

        <Section title="Headcount by department">
          <BarChart data={derived.departments} color="#6B3FA0" />
        </Section>

        <Section title="Recognitions (last 6 months)">
          <ColumnChart data={derived.recognitions} />
        </Section>

        <div className="lg:col-span-2">
          <Section title="Leave: days taken vs entitlement (team)">
            <GroupedBarChart
              data={derived.leave}
              seriesA={{ key: 'taken', label: 'Taken', color: '#00965E' }}
              seriesB={{ key: 'entitled', label: 'Entitled', color: '#CBD5E1' }}
            />
          </Section>
        </div>
      </div>
    </Layout>
  )
}
