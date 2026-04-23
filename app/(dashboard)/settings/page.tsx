export default function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-[#E0E0E0] mb-6">הגדרות</h1>

      <div className="space-y-4">
        <div className="panel p-6">
          <h2 className="text-base font-medium text-[#E0E0E0] mb-2">חיבור IBKR</h2>
          <p className="text-[#888888] text-sm">הגדרת Flex Web Service — Phase 3</p>
        </div>

        <div className="panel p-6">
          <h2 className="text-base font-medium text-[#E0E0E0] mb-2">עדכון מחירים (Polygon)</h2>
          <p className="text-[#888888] text-sm">הגדרות polling — Phase 4</p>
        </div>

        <div className="panel p-6">
          <h2 className="text-base font-medium text-[#E0E0E0] mb-2">AI — חנן</h2>
          <p className="text-[#888888] text-sm">הגדרות מודל — Phase 7</p>
        </div>

        <div className="panel p-6">
          <h2 className="text-base font-medium text-[#E0E0E0] mb-2">תצוגה</h2>
          <p className="text-[#888888] text-sm">מטבע, אזור זמן, מצב תצוגה — Phase 8</p>
        </div>
      </div>
    </div>
  )
}
