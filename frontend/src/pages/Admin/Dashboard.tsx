import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Play, Eye, EyeOff, Trash2, BarChart3, Circle, CheckCircle2 } from 'lucide-react'
import { listSops, publishSop, deleteSop } from '../../services/api'
import type { SopSummary } from '../../types'

const DEMO_PRODUCT_ID = 'demo-product'

export default function AdminDashboard() {
  const [sops, setSops]       = useState<SopSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const data = await listSops(DEMO_PRODUCT_ID).catch(() => [])
    setSops(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handlePublish = async (sopId: string, current: boolean) => {
    await publishSop(sopId)
    setSops((s) => s.map((x) => x.sop_id === sopId ? { ...x, published: !current } : x))
  }

  const handleDelete = async (sopId: string) => {
    if (!confirm('Delete this SOP? This cannot be undone.')) return
    await deleteSop(sopId)
    setSops((s) => s.filter((x) => x.sop_id !== sopId))
  }

  return (
    <div className="min-h-screen bg-surface-900 text-white p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your SOPs and onboarding flows</p>
        </div>
        <div className="flex gap-3">
          <Link to="/admin/record"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-700 border border-surface-500 text-sm text-slate-300 hover:bg-surface-600 transition-colors"
          >
            <Circle className="w-4 h-4 text-red-400" /> Record Mode
          </Link>
          <Link to="/admin/sop/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-sm text-white transition-colors"
          >
            <Plus className="w-4 h-4" /> New SOP
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total SOPs', value: sops.length },
          { label: 'Published', value: sops.filter((s) => s.published).length },
          { label: 'Total Plays', value: sops.reduce((a, s) => a + s.total_plays, 0) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-surface-800 border border-surface-600 p-4">
            <p className="text-xs text-slate-400 mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* SOP table */}
      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading SOPs...</div>
      ) : sops.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-surface-600 rounded-2xl">
          <p className="text-slate-400 mb-4">No SOPs yet. Record your first workflow.</p>
          <Link to="/admin/record"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm hover:bg-brand-500 transition-colors"
          >
            <Circle className="w-4 h-4 text-red-300" /> Start Recording
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sops.map((sop, i) => (
            <motion.div
              key={sop.sop_id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-surface-800 border border-surface-600 hover:border-surface-500 transition-colors"
            >
              <div className="flex-shrink-0">
                {sop.published
                  ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                  : <Circle className="w-5 h-5 text-slate-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{sop.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {sop.total_steps} steps · {sop.total_plays} plays ·{' '}
                  {sop.completion_count} completions
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link to={`/demo?sop=${sop.sop_id}`}
                  className="p-2 rounded-lg hover:bg-surface-600 text-slate-400 hover:text-green-400 transition-colors"
                  title="Preview"
                >
                  <Play className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => handlePublish(sop.sop_id, sop.published)}
                  className="p-2 rounded-lg hover:bg-surface-600 text-slate-400 hover:text-brand-400 transition-colors"
                  title={sop.published ? 'Unpublish' : 'Publish'}
                >
                  {sop.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleDelete(sop.sop_id)}
                  className="p-2 rounded-lg hover:bg-surface-600 text-slate-400 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
