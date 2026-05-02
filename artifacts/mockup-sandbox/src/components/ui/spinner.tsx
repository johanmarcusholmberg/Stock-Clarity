import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

// `lucide-react` carries its own copy of @types/react, so its component
// props (including `ref`) are nominally different from our resolved copy
// even though they're structurally identical. Cast through `any` at the
// component boundary to avoid the duplicated-type-definitions error.
const LoaderIcon = Loader2Icon as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
