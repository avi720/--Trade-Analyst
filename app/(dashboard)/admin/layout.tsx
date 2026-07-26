import { requireAdminPage } from '@/lib/auth/require-admin'
import { AdminLayout as AdminLayoutShell } from '@/components/admin/admin-layout'

// Admin section gate. Mirrors the auth+redirect pattern in
// app/(dashboard)/layout.tsx and layers on an isAdmin check. Inherits the
// dashboard chrome (Header, ChatSidebar, main scroller) from the parent
// (dashboard) group layout. Wraps {children} in the sub-tabs shell added
// in Phase 2, which owns the vertical sidebar with sub-tab navigation.
export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminPage()

  return <AdminLayoutShell>{children}</AdminLayoutShell>
}
