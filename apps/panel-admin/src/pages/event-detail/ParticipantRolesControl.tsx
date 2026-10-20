import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ParticipantRole } from "@/store/event.store"

interface Props {
  participant: { id: string; fullName: string; editionId?: string; roleId?: string; roleIds?: string[] }
  roles: ParticipantRole[]
  onChange: (roleIds: string[]) => Promise<void>
}

export function ParticipantRolesControl({ participant, roles, onChange }: Props) {
  const [saving, setSaving] = useState(false)
  const ids = participant.roleIds || (participant.roleId ? [participant.roleId] : [])
  const available = roles.filter((role) => role.isActive && (!role.editionId || role.editionId === participant.editionId) && !ids.includes(role.id))
  const save = async (next: string[]) => {
    setSaving(true)
    try { await onChange(next) } finally { setSaving(false) }
  }
  return <div className="flex max-w-64 flex-col gap-2">
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const role = roles.find((item) => item.id === id)
        const label = role?.name.es || role?.slug || "Rol asignado"
        return <Badge key={id} variant="secondary">
          {label}
          {ids.length > 1 ? <Button type="button" variant="ghost" size="icon" className="size-5" disabled={saving} aria-label={`Quitar ${label} de ${participant.fullName}`} onClick={() => void save(ids.filter((value) => value !== id))}>×</Button> : null}
        </Badge>
      })}
    </div>
    {available.length ? <select value="" disabled={saving} aria-label={`Añadir rol a ${participant.fullName}`} className="h-8 rounded-md border border-border bg-background px-2 text-xs" onChange={(event) => void save([...ids, event.target.value])}>
      <option value="" disabled>{saving ? "Guardando…" : "Añadir rol"}</option>
      {available.map((role) => <option key={role.id} value={role.id}>{role.name.es || role.slug}</option>)}
    </select> : null}
  </div>
}
