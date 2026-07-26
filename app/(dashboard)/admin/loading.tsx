import { AdminContentSkeleton } from '@/components/admin/admin-content-skeleton'

// Shown on the first entry into the admin section (e.g. /research → /admin/*),
// where this Suspense boundary newly mounts. Sibling sub-tab switches don't
// re-trigger it (React keeps a resolved boundary's children) — AdminLayout
// drives a client-side pending skeleton for those. Both reuse the same markup.
export default function AdminLoading() {
  return <AdminContentSkeleton />
}
