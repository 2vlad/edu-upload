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
}

export function CircularProgress({ 
  className, 
  size = "md", 
  progress = 0,
  label 
}: CircularProgressProps) {
  const sizeConfig = {
    sm: { size: 80, strokeWidth: 6, radius: 35 },
    md: { size: 120, strokeWidth: 8, radius: 52 },
    lg: { size: 160, strokeWidth: 10, radius: 70 }
  }

  const config = sizeConfig[size]
  const circumference = 2 * Math.PI * config.radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative">
        <svg
          className="transform -rotate-90"
          width={config.size}
          height={config.size}
        >
          {/* Background circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={config.radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="none"
            className="text-muted/20"
          />
          
          {/* Progress circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={config.radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-primary transition-all duration-500 ease-out"
            strokeLinecap="round"
          />
          
          {/* Animated dots */}
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={config.size / 2}
              cy={config.size / 2 - config.radius}
              r={config.strokeWidth / 2}
              fill="currentColor"
              className="text-primary"
              style={{
                transformOrigin: `${config.size / 2}px ${config.size / 2}px`,
                animation: `orbit 3s cubic-bezier(0.4, 0, 0.2, 1) ${i * 1}s infinite`
              }}
            />
          ))}
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold">
            {Math.round(progress)}%
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