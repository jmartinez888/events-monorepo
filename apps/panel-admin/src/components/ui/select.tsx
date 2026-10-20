import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

type SelectContextType = {
  value: string
  onValueChange: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  registerOption: (value: string, label: string) => void
  getLabel: (value: string) => string
}

const SelectContext = React.createContext<SelectContextType | undefined>(undefined)

export function Select({
  children,
  value,
  onValueChange,
}: {
  children: React.ReactNode
  value: string
  onValueChange: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [options, setOptions] = React.useState<Record<string, string>>({})

  const registerOption = React.useCallback((val: string, label: string) => {
    setOptions(prev => {
      if (prev[val] === label) return prev
      return { ...prev, [val]: label }
    })
  }, [])

  const getLabel = React.useCallback((val: string) => options[val] || val, [options])

  const selectRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, registerOption, getLabel }}>
      <div ref={selectRef} className="relative inline-block w-full">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectTrigger must be used within a Select")

  return (
    <button
      type="button"
      onClick={() => context.setOpen(!context.open)}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-left cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
    </button>
  )
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectValue must be used within a Select")

  const label = context.getLabel(context.value)
  return <span>{label || placeholder}</span>
}

export function SelectContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectContent must be used within a Select")

  return (
    <div
      className={cn(
        "absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-card text-foreground shadow-md animate-in fade-in-80 slide-in-from-top-1 w-full max-h-60 overflow-y-auto mt-1 left-0 border-border",
        !context.open && "hidden",
        className
      )}
      {...props}
    >
      <div className="p-1">{children}</div>
    </div>
  )
}

export function SelectGroup(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="group" {...props} />
}

export function SelectItem({
  className,
  value,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectItem must be used within a Select")

  const isSelected = context.value === value

  React.useEffect(() => {
    let label = ""
    if (typeof children === "string") {
      label = children
    } else if (typeof children === "number") {
      label = String(children)
    } else if (Array.isArray(children)) {
      label = children
        .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : ""))
        .join("")
        .trim()
    }
    if (label) {
      context.registerOption(value, label)
    }
  }, [value, children, context])

  return (
    <button
      type="button"
      onClick={() => {
        context.onValueChange(value)
        context.setOpen(false)
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 text-left",
        isSelected && "bg-accent/50 font-medium",
        className
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
    </button>
  )
}
