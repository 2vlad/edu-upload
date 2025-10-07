"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-context"
import { LogIn, LogOut, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export function AuthButton() {
  const { user, isLoading, isAnonymous, openAuthDialog, signOut } = useAuth()

  if (isLoading) {
    return (
      <div className="h-9 w-24 bg-muted animate-pulse rounded-[25px]" />
    )
  }

  // Not logged in or anonymous
  if (!user || isAnonymous) {
    return (
      <div className="flex items-center gap-2">
        {isAnonymous && (
          <Badge variant="secondary" className="rounded-full">
            Гость
          </Badge>
        )}
        <Button
          onClick={openAuthDialog}
          variant="outline"
          className="rounded-[25px]"
          size="sm"
        >
          <LogIn className="w-4 h-4 mr-2" />
          Войти
        </Button>
      </div>
    )
  }

  // Logged in
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="rounded-[25px]" size="sm">
          <User className="w-4 h-4 mr-2" />
          {user.email}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            {user.is_anonymous ? "Анонимный пользователь" : "Зарегистрирован"}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="cursor-pointer">
          <LogOut className="w-4 h-4 mr-2" />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
