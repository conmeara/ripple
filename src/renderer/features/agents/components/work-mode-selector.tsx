"use client"

import { useState } from "react"
import { ChevronDown, CircleDot, GitBranch } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import { CheckIcon } from "../../../components/ui/icons"
import { cn } from "../../../lib/utils"
import type { WorkMode } from "../atoms"

interface WorkModeSelectorProps {
  value: WorkMode
  onChange: (mode: WorkMode) => void
  disabled?: boolean
  compact?: boolean
}

const workModeOptions = [
  {
    id: "local" as const,
    label: "Main",
    icon: CircleDot,
  },
  {
    id: "worktree" as const,
    label: "Worktree",
    icon: GitBranch,
  },
]

export function WorkModeSelector({
  value,
  onChange,
  disabled,
  compact = false,
}: WorkModeSelectorProps) {
  const [open, setOpen] = useState(false)
  const selectedOption = workModeOptions.find((opt) => opt.id === value) || workModeOptions[0]
  const Icon = selectedOption.icon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-muted/50 hover:text-foreground outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            compact ? "w-7 p-0" : "gap-1.5 px-2 text-sm font-medium",
            disabled && "opacity-50 pointer-events-none",
          )}
          disabled={disabled}
          aria-label={`Chat mode: ${selectedOption.label}`}
          title={selectedOption.label}
        >
          <Icon className="w-4 h-4" />
          {!compact && (
            <>
              <span>{selectedOption.label}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-55" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[150px] min-w-[150px]" align="start">
        {workModeOptions.map((option) => {
          const OptionIcon = option.icon
          const isSelected = value === option.id
          return (
            <button
              key={option.id}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
              className={cn(
                "flex min-h-9 w-[calc(100%-8px)] items-center gap-2 rounded-md px-1.5 py-1.5 mx-1 text-left text-sm outline-none transition-colors",
                isSelected
                  ? "dark:bg-neutral-800 text-foreground"
                  : "dark:hover:bg-neutral-800 hover:text-foreground",
              )}
            >
              <OptionIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
              </span>
              {isSelected && <CheckIcon className="h-4 w-4 shrink-0" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
