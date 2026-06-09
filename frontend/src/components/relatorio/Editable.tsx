import { useEffect, useRef, useState } from "react"

interface EditableProps {
  value: string
  onSave: (v: string) => void
  editing: boolean
  multiline?: boolean
  placeholder?: string
  className?: string
}

/**
 * Texto editável inline. Quando `editing` está ativo, vira um campo de
 * edição com auto-resize; caso contrário, renderiza como texto normal.
 */
export function Editable({
  value, onSave, editing, multiline = false, placeholder = "—", className = "",
}: EditableProps) {
  const [local, setLocal] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setLocal(value) }, [value])

  useEffect(() => {
    if (editing && multiline && ref.current) {
      ref.current.style.height = "auto"
      ref.current.style.height = ref.current.scrollHeight + "px"
    }
  }, [editing, local, multiline])

  if (!editing) {
    return (
      <span className={className}>
        {value || <span className="text-slate-600 italic">{placeholder}</span>}
      </span>
    )
  }

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== value && onSave(local)}
        placeholder={placeholder}
        className={`w-full bg-brand-900/60 border border-brand-400/40 rounded-lg px-3 py-2 outline-none focus:border-brand-300 resize-none ${className}`}
      />
    )
  }

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local !== value && onSave(local)}
      placeholder={placeholder}
      className={`bg-brand-900/60 border border-brand-400/40 rounded-lg px-2 py-1 outline-none focus:border-brand-300 ${className}`}
    />
  )
}
