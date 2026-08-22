'use client'

import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, Tag } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

export interface TaxonomyItem {
  id: string
  name: string
  order: number
  classification?: 'formal' | 'other'
}

interface TaxonomyPanelProps {
  title: string
  description: string
  endpoint: string
  withClassification?: boolean
  namePlaceholder?: string
}

export function TaxonomyPanel({ title, description, endpoint, withClassification, namePlaceholder }: TaxonomyPanelProps) {
  const [items, setItems] = useState<TaxonomyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editMap, setEditMap] = useState<Record<string, { name: string; order: string; classification: 'formal' | 'other' }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', order: '0', classification: 'formal' as 'formal' | 'other' })

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(endpoint)
      const data: TaxonomyItem[] = await res.json().catch(() => [])
      setItems(Array.isArray(data) ? data : [])
      const init: typeof editMap = {}
      ;(Array.isArray(data) ? data : []).forEach((it) => {
        init[it.id] = { name: it.name, order: it.order.toString(), classification: it.classification ?? 'formal' }
      })
      setEditMap(init)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateEdit = (id: string, field: 'name' | 'order' | 'classification', value: string) => {
    setEditMap((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const save = async (item: TaxonomyItem) => {
    setSaving(item.id)
    try {
      const vals = editMap[item.id]
      await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          name: vals.name.trim(),
          order: parseInt(vals.order) || 0,
          ...(withClassification ? { classification: vals.classification } : {}),
        }),
      })
      setSaved(item.id)
      setTimeout(() => setSaved(null), 2000)
      await load()
    } finally {
      setSaving(null)
    }
  }

  const addItem = async () => {
    if (!newItem.name.trim()) return
    setAddSaving(true)
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItem.name.trim(),
          order: parseInt(newItem.order) || 0,
          ...(withClassification ? { classification: newItem.classification } : {}),
        }),
      })
      setNewItem({ name: '', order: '0', classification: 'formal' })
      setAddingNew(false)
      await load()
    } finally {
      setAddSaving(false)
    }
  }

  const deleteItem = async (item: TaxonomyItem) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    setDeleting(item.id)
    try {
      await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      await load()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <SectionCard icon={Tag} title={title} description={description}>
      <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const vals = editMap[item.id] ?? { name: item.name, order: item.order.toString(), classification: item.classification ?? 'formal' }
            const isSaving = saving === item.id
            const isSaved = saved === item.id
            const changed = vals.name !== item.name || parseInt(vals.order) !== item.order || vals.classification !== (item.classification ?? 'formal')

            return (
              <div key={item.id} className="overflow-x-auto border border-slate-100 rounded-lg">
              <div className="flex items-center gap-3 p-3 min-w-max">
                <div className="w-7 h-7 rounded-full bg-navy-50 flex items-center justify-center shrink-0">
                  <Tag className="w-3.5 h-3.5 text-navy-600" />
                </div>
                <input
                  type="text"
                  value={vals.name}
                  onChange={(e) => updateEdit(item.id, 'name', e.target.value)}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {withClassification && (
                  <select
                    value={vals.classification}
                    onChange={(e) => updateEdit(item.id, 'classification', e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="formal">Formal Training</option>
                    <option value="other">Strategic Initiative</option>
                  </select>
                )}
                <input
                  type="number"
                  value={vals.order}
                  onChange={(e) => updateEdit(item.id, 'order', e.target.value)}
                  title="Display order"
                  className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                />
                {isSaved && <span className="text-xs text-green-600 font-medium shrink-0">Saved</span>}
                <button
                  onClick={() => save(item)}
                  disabled={isSaving || !changed}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                    changed && !isSaving ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => deleteItem(item)}
                  disabled={deleting === item.id}
                  className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0"
                >
                  {deleting === item.id ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
              </div>
            )
          })}

          {!addingNew ? (
            <button
              onClick={() => {
                const nextOrder = items.length > 0 ? Math.max(...items.map((it) => it.order)) + 1 : 0
                setNewItem((p) => ({ ...p, order: String(nextOrder) }))
                setAddingNew(true)
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors w-full justify-center"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          ) : (
            <div className="border border-blue-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                  placeholder={namePlaceholder ?? 'Name'}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {withClassification && (
                  <select
                    value={newItem.classification}
                    onChange={(e) => setNewItem((p) => ({ ...p, classification: e.target.value as 'formal' | 'other' }))}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="formal">Formal Training</option>
                    <option value="other">Strategic Initiative</option>
                  </select>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={addItem}
                  disabled={!newItem.name.trim() || addSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {addSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add
                </button>
                <button onClick={() => setAddingNew(false)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </SectionCard>
  )
}
