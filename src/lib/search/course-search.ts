import { getCourses, type Course } from '@/lib/fixtures/courses'

export type CourseSearchResult = Pick<
  Course,
  'id' | 'title' | 'category' | 'instructorName' | 'coverImageUrl' | 'rating' | 'isEnrolled'
>

type SearchOptions = { limit?: number; signal?: AbortSignal }

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLocaleLowerCase()
    .trim()
}

function waitForIndex(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The search was aborted.', 'AbortError'))
      return
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, 150)

    function onAbort() {
      clearTimeout(timeout)
      reject(new DOMException('The search was aborted.', 'AbortError'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function searchCourses(
  query: string,
  opts: SearchOptions = {},
): Promise<CourseSearchResult[]> {
  await waitForIndex(opts.signal)
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  const matches = getCourses()
    .map((course) => {
      const title = normalizeSearchText(course.title)
      const category = normalizeSearchText(course.category)
      const instructor = normalizeSearchText(course.instructorName)
      const rank = title.startsWith(normalizedQuery)
        ? 0
        : title.includes(normalizedQuery)
          ? 1
          : category.includes(normalizedQuery) || instructor.includes(normalizedQuery)
            ? 2
            : -1
      return { course, rank }
    })
    .filter((match) => match.rank >= 0)
    .sort((first, second) => first.rank - second.rank)
    .slice(0, Math.max(0, opts.limit ?? 6))

  return matches.map(({ course }) => ({
    id: course.id,
    title: course.title,
    category: course.category,
    instructorName: course.instructorName,
    coverImageUrl: course.coverImageUrl,
    rating: course.rating,
    isEnrolled: course.isEnrolled,
  }))
}
