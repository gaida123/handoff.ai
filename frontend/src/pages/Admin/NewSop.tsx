import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2 } from 'lucide-react'
import { createSop } from '../../services/api'

const DEMO_PRODUCT_ID = 'demo-product'

export default function NewSopPage() {
  const navigate = useNavigate()
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const handleCreate = async () => {
    if (!name.trim()) { setError('SOP name is required.'); return }
    setSaving(true)
    setError('')
    try {
      await createSop(DEMO_PRODUCT_ID, name.trim(), description.trim() || undefined)
      navigate('/admin')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create SOP')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <button onClick={() => navigate('/admin')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="rounded-2xl border border-surface-600 bg-surface-800 p-8">
          <h1 className="text-xl font-bold mb-1">New SOP</h1>
          <p className="text-sm text-slate-400 mb-6">
            Create a blank SOP, then use Record Mode to capture its steps.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                SOP Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. Create a New Shipment"
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Description <span className="text-slate-500">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What does this SOP guide the user through?"
                rows={3}
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <button
              onClick={handleCreate}
              disabled={saving || !name.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                : <><Plus className="w-4 h-4" /> Create SOP</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
