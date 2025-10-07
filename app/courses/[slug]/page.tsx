import { notFound } from "next/navigation"
import { getCourseBySlug } from "@/app/actions/courses"
import { CourseViewer } from "@/components/CourseViewer"

interface PageProps {
  params: {
    slug: string
  }
}

export default async function PublicCoursePage({ params }: PageProps) {
  const { slug } = params

  // Fetch course from database (Server Component)
  const result = await getCourseBySlug(slug)

  if (!result.success || !result.course) {
    notFound()
  }

  return <CourseViewer course={result.course} />
}
