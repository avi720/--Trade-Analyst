import { redirect } from 'next/navigation'

// /admin is the header tab target but has no content of its own —
// redirect to the default sub-tab. Sub-tabs are defined in
// components/admin/admin-layout.tsx.
export default function AdminIndexPage() {
  redirect('/admin/users')
}
