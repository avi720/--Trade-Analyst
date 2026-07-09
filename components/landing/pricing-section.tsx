import { PricingPlans } from './pricing-plans'

export function PricingSection() {
  return (
    <section className="border-t border-border bg-panel-bg/30 px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold text-text-main">תמחור פשוט</h2>
          <p className="mt-3 text-text-dim">
            התחל חינם. שדרג ל-Pro כשתרצה סנכרון אוטומטי וחנן ללא הגבלה.
          </p>
        </div>

        <PricingPlans />
      </div>
    </section>
  )
}
