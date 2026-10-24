// Remove this file when the real course data model exists.
export interface Course {
  id: string;
  title: string;
  category: string;
  instructorName: string;
  coverImageUrl: string;
  rating: number;
  enrolledCount: number;
  isEnrolled: boolean;
  progressPercent?: number;
}

export const courseFixtures: Course[] = [
  {
    id: 'course-full-stack-web-development',
    title: 'Full-Stack Web Development Bootcamp',
    category: 'Computer Science',
    instructorName: 'Dr. Sarah Ahmed',
    coverImageUrl: 'linear-gradient(135deg, var(--primary-soft), var(--primary-soft-strong))',
    rating: 4.9,
    enrolledCount: 1420,
    isEnrolled: true,
    progressPercent: 65,
  },
  {
    id: 'course-high-school-physics-mechanics',
    title: 'High School Physics: Mechanics & Kinematics',
    category: 'Physics',
    instructorName: 'Eng. Karim Omar',
    coverImageUrl: 'linear-gradient(135deg, var(--surface-soft), var(--neutral-chip-bg))',
    rating: 4.8,
    enrolledCount: 890,
    isEnrolled: false,
  },
  {
    id: 'course-linear-algebra-matrix-fundamentals',
    title: 'Linear Algebra & Matrix Fundamentals',
    category: 'Mathematics',
    instructorName: 'Prof. Yasser Al-Mansoor',
    coverImageUrl: 'linear-gradient(135deg, var(--primary-soft-strong), var(--surface-soft))',
    rating: 4.7,
    enrolledCount: 650,
    isEnrolled: false,
  },
];

export function getCourses(): Course[] {
  return process.env.NEXT_PUBLIC_USE_MOCK_COURSES === 'true' ? courseFixtures : [];
}
