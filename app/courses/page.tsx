import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Plus } from "lucide-react"
import { getMyCourses } from "@/app/actions/courses"
import { CoursesList } from "@/components/CoursesList"
import { LocalDraftsSection } from "@/components/LocalDraftsSection"

export default async function CoursesPage() {
  // Fetch courses from database (Server Component)
  const result = await getMyCourses()
  const dbCourses = result.success ? result.courses || [] : []

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-[30px]"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold">Мои курсы</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Управляйте своими курсами
                </p>
              </div>
            </div>
            <Link href="/">
              <Button className="rounded-[30px]">
                <Plus className="w-4 h-4 mr-2" />
                Создать курс
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Database Courses Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Курсы из профиля</h2>
          <CoursesList courses={dbCourses} />
        </div>

        {/* Local Drafts Section (Client Component) */}
        <LocalDraftsSection />
      </div>
    </div>
  )
}
export const dynamic = 'force-dynamic'
