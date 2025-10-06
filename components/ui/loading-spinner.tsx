import * as React from "react"
import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  className?: string
  size?: "sm" | "md" | "lg"
  label?: string
}

export function LoadingSpinner({ className, size = "md", label }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16"
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative">
        {/* Outer ring with gradient */}
        <div className={cn(
          "rounded-full animate-spin",
          sizeClasses[size],
          "bg-gradient-to-r from-primary via-primary/50 to-transparent"
        )} 
        style={{
          animation: "spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite"
        }}
        />
        
        {/* Inner circle for visual depth */}
        <div className={cn(
          "absolute inset-1 rounded-full bg-background",
          "animate-pulse"
        )} 
        style={{
          animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
        }}
        />
        
        {/* Center dot */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center"
        )}>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{
            animation: "bounce 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite"
          }}
          />
        </div>
      </div>
      
      {label && (
        <p className="text-sm text-muted-foreground animate-pulse">
          {label}
        </p>
      )}
    </div>
  )
}

// Advanced circular progress animation
interface CircularProgressProps {
  className?: string
  size?: "sm" | "md" | "lg"
  progress?: number
  label?: string
  subtle?: boolean // lower-contrast style
}

export function CircularProgress({
  className,
  size = "md",
  progress = 0,
  label,
  subtle = false,
}: CircularProgressProps) {
  const sizeConfig = {
    sm: { size: 80, strokeWidth: 6, radius: 35 },
    md: { size: 120, strokeWidth: 8, radius: 52 },
    lg: { size: 160, strokeWidth: 10, radius: 70 },
  }

  const config = sizeConfig[size]
  const circumference = 2 * Math.PI * config.radius
  const clamped = Math.max(0, Math.min(100, progress))
  const strokeDashoffset = circumference - (clamped / 100) * circumference
  const angle = (clamped / 100) * 2 * Math.PI - Math.PI / 2
  const headX = config.size / 2 + Math.cos(angle) * config.radius
  const headY = config.size / 2 + Math.sin(angle) * config.radius

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative">
        <svg
          className="transform -rotate-90 text-primary"
          width={config.size}
          height={config.size}
        >
          <defs>
            <linearGradient id="tm-progress-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="currentColor" stopOpacity={subtle ? 0.9 : 1} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={subtle ? 0.6 : 0.85} />
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={config.radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="none"
            className={cn(subtle ? "text-muted/20" : "text-muted/25")}
          />
          
          {/* Progress circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={config.radius}
            stroke="url(#tm-progress-grad)"
            strokeWidth={config.strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-primary transition-[stroke-dashoffset] duration-600 ease-[cubic-bezier(.22,1,.36,1)]"
            strokeLinecap="round"
          />
          {/* Head dot (subtle, follows the arc) */}
          <circle
            cx={headX}
            cy={headY}
            r={Math.max(2, config.strokeWidth * 0.45)}
            fill="currentColor"
            className={cn("text-primary transition-all duration-600 ease-[cubic-bezier(.22,1,.36,1)]", subtle && "opacity-70")}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">
            {Math.round(clamped)}%
          </span>
        </div>
      </div>
      
      {label && (
        <p className="text-sm text-muted-foreground text-center max-w-[200px]">
          {label}
        </p>
      )}
    </div>
  )
}
