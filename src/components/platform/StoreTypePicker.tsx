// --- Store Type & Category Picker ---
// Shared by the public merchant application form and the Super Admin
// provisioning modal. Picking a niche pre-fills its default categories,
// which the merchant can then edit before the blank store is created.

import { useState } from 'react'
import { STORE_NICHES, getNichePreset } from '@/data/store-niches'

interface Props {
  storeType: string
  categories: string[]
  onChange: (storeType: string, categories: string[]) => void
}

export default function StoreTypePicker({ storeType, categories, onChange }: Props) {
  const [draft, setDraft] = useState('')

  const handleTypeChange = (id: string) => {
    onChange(id, [...getNichePreset(id).categories])
  }

  const addCategory = () => {
    const name = draft.trim()
    if (!name) return
    if (!categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      onChange(storeType, [...categories, name])
    }
    setDraft('')
  }

  const removeCategory = (name: string) => {
    onChange(
      storeType,
      categories.filter((c) => c !== name)
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700">
          What will you sell? *
        </label>
        <select
          value={storeType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900 outline-none cursor-pointer focus:border-blue-600 focus:bg-white"
        >
          {STORE_NICHES.map((n) => (
            <option key={n.id} value={n.id}>
              {n.icon} {n.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Store Categories
        </label>
        <div className="flex flex-wrap gap-1.5 min-h-[34px] p-2 bg-slate-50 border border-slate-300 rounded-xl">
          {categories.length === 0 && (
            <span className="text-[11px] text-slate-400 px-1 py-0.5">Add at least one category below</span>
          )}
          {categories.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-semibold text-slate-700"
            >
              {c}
              <button
                type="button"
                onClick={() => removeCategory(c)}
                className="w-4 h-4 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                aria-label={`Remove ${c}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCategory()
              }
            }}
            placeholder="Add a category, e.g. Action Figures"
            className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:bg-white"
          />
          <button
            type="button"
            onClick={addCategory}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 cursor-pointer"
          >
            + Add
          </button>
        </div>
        <p className="text-[10px] text-slate-400">
          The new store starts empty — no products or photos — using these categories.
        </p>
      </div>
    </div>
  )
}
