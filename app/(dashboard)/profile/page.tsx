import { createClient } from '@/lib/supabase/server'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-[#E0E0E0] mb-6">פרופיל</h1>

      <div className="panel p-6 space-y-4">
        <div>
          <label className="block text-sm text-[#888888] mb-1">אימייל</label>
          <p className="text-[#E0E0E0] font-mono text-sm">{user?.email}</p>
        </div>
        <div>
          <label className="block text-sm text-[#888888] mb-1">ID</label>
          <p className="text-[#888888] font-mono text-xs">{user?.id}</p>
        </div>
        <div className="pt-4 border-t border-[#222222]">
          <p className="text-[#888888] text-sm">סטטיסטיקות וניהול חשבון — Phase 8</p>
        </div>
      </div>
    </div>
  )
}
