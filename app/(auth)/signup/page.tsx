'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { CityCombobox } from '@/components/city-combobox'
import { GoogleSignInButton } from '@/components/google-signin-button'

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const step1Schema = z
  .object({
    email:           z.string().email('כתובת מייל לא תקינה'),
    password:        z
      .string()
      .min(8, 'הסיסמה חייבת להכיל לפחות 8 תווים')
      .regex(/[a-zA-Z]/, 'הסיסמה חייבת להכיל לפחות אות אחת')
      .regex(/[0-9]/,    'הסיסמה חייבת להכיל לפחות ספרה אחת'),
    confirmPassword: z.string(),
  })
  .refine(d => d.password === d.confirmPassword, {
    message: 'הסיסמאות אינן תואמות',
    path:    ['confirmPassword'],
  })

const step2Schema = z.object({
  firstName:      z.string().min(1, 'שם פרטי הוא שדה חובה'),
  lastName:       z.string().min(1, 'שם משפחה הוא שדה חובה'),
  phone:          z.string().min(1, 'מספר טלפון הוא שדה חובה'),
  addressCountry: z.string().min(1, 'מדינה היא שדה חובה'),
  addressCity:    z.string().optional(),
  addressStreet:  z.string().optional(),
})

const step3Schema = z.object({
  currency:     z.enum(['USD', 'ILS']),
  dateFormat:   z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
  numberFormat: z.enum(['en', 'eu']),
})

type Step1Fields = z.infer<typeof step1Schema>
type Step2Fields = z.infer<typeof step2Schema>
type Step3Fields = z.infer<typeof step3Schema>

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls = (err?: string) =>
  'w-full bg-bg-dark border rounded px-3 py-2 text-sm text-text-main placeholder-text-mute outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 transition-colors ' +
  (err ? 'border-red' : 'border-border focus:border-shade-2')

const labelCls = 'block text-sm text-text-dim mb-1'
const errorCls = 'text-red text-xs mt-1'

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepPills({ current }: { current: 1 | 2 | 3 }) {
  const labels = ['מייל', 'פרטים', 'העדפות']
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {labels.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3
        const done = step < current
        const active = step === current
        return (
          <div key={step} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`h-px w-6 ${done ? 'bg-amber' : 'bg-border'}`} />
            )}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              active ? 'bg-amber text-black' :
              done   ? 'bg-amber-tint text-amber border border-amber/30' :
                       'bg-panel text-text-dim border border-border'
            }`}>
              <span>{step}</span>
              <span>{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; sub?: string }[]
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map(opt => (
        <label
          key={opt.value}
          className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
            value === opt.value
              ? 'border-amber/50 bg-amber-tint'
              : 'border-border hover:border-shade hover:bg-panel-3'
          }`}
        >
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            value === opt.value ? 'border-amber' : 'border-shade-2'
          }`}>
            {value === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-amber" />}
          </div>
          <input type="radio" checked={value === opt.value} onChange={() => onChange(opt.value)} className="sr-only" />
          <div>
            <span className="text-sm text-text-main">{opt.label}</span>
            {opt.sub && <span className="block text-sm text-text-dim mt-0.5">{opt.sub}</span>}
          </div>
        </label>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 state
  const [verificationSent, setVerificationSent] = useState(false)
  const [checkingVerification, setCheckingVerification] = useState(false)
  const [step1Error, setStep1Error] = useState<string | null>(null)

  // Step 2 saved data (carried forward to step 3 submit)
  const [step2Data, setStep2Data] = useState<Step2Fields | null>(null)

  // Cities
  const [cities, setCities] = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)

  // Global submit error (step 3)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // On mount: check if user is already authenticated (e.g. returned after email verification)
  useEffect(() => {
    async function checkAuth() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email_confirmed_at) {
        setStep(2)
      }
    }
    checkAuth()
  }, [])

  // Fetch cities when step 2 mounts
  useEffect(() => {
    if (step !== 2 || cities.length > 0) return
    setCitiesLoading(true)
    fetch('/api/cities')
      .then(r => r.json())
      .then(d => setCities(d.cities ?? []))
      .finally(() => setCitiesLoading(false))
  }, [step, cities.length])

  // ── Step 1 form ───────────────────────────────────────────────────────────

  const form1 = useForm<Step1Fields>({ resolver: zodResolver(step1Schema) })

  async function onStep1Submit(values: Step1Fields) {
    setStep1Error(null)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const origin = window.location.origin
    const { data, error } = await supabase.auth.signUp({
      email:    values.email,
      password: values.password,
      options:  { emailRedirectTo: `${origin}/auth/callback?next=/signup/verified` },
    })

    if (error) {
      if (error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already exists')) {
        setStep1Error('כתובת מייל כבר קיימת במערכת')
      } else {
        setStep1Error(error.message)
      }
      return
    }

    // Email confirmation not required — session returned immediately
    if (data.session) {
      setStep(2)
      return
    }

    setVerificationSent(true)
  }

  async function checkVerification() {
    setCheckingVerification(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email_confirmed_at) {
        setStep(2)
      } else {
        setStep1Error('המייל טרם אומת. אנא לחץ על הקישור במייל ונסה שוב.')
      }
    } finally {
      setCheckingVerification(false)
    }
  }

  // ── Step 2 form ───────────────────────────────────────────────────────────

  const form2 = useForm<Step2Fields>({ resolver: zodResolver(step2Schema) })
  const cityValue = form2.watch('addressCity') ?? ''

  // When arriving at step 2 (e.g. via Google sign-in), prefill name from auth metadata
  useEffect(() => {
    if (step !== 2) return
    if (form2.getValues('firstName')) return
    ;(async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
      const fullName =
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof meta.name === 'string' && meta.name) ||
        ''
      const given = typeof meta.given_name === 'string' ? meta.given_name : ''
      const family = typeof meta.family_name === 'string' ? meta.family_name : ''
      if (given || family) {
        if (given) form2.setValue('firstName', given)
        if (family) form2.setValue('lastName', family)
      } else if (fullName) {
        const parts = fullName.trim().split(/\s+/)
        form2.setValue('firstName', parts[0] ?? '')
        if (parts.length > 1) form2.setValue('lastName', parts.slice(1).join(' '))
      }
    })()
  }, [step, form2])

  function onStep2Submit(values: Step2Fields) {
    setStep2Data(values)
    setStep(3)
  }

  // ── Step 3 form ───────────────────────────────────────────────────────────

  const form3 = useForm<Step3Fields>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      currency:     'USD',
      dateFormat:   'DD/MM/YYYY',
      numberFormat: 'en',
    },
  })

  const currency     = form3.watch('currency')
  const dateFormat   = form3.watch('dateFormat')
  const numberFormat = form3.watch('numberFormat')

  async function onStep3Submit(display: Step3Fields) {
    if (!step2Data) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/signup-complete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...step2Data, display }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSubmitError(json.error ?? 'שגיאה בשמירת הפרטים')
        return
      }
      router.push('/research')
      router.refresh()
    } catch {
      setSubmitError('שגיאת רשת, אנא נסה שוב')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const today = new Date()
  const dd   = String(today.getDate()).padStart(2, '0')
  const mm   = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  const dateExamples = {
    'DD/MM/YYYY': `${dd}/${mm}/${yyyy}`,
    'MM/DD/YYYY': `${mm}/${dd}/${yyyy}`,
    'YYYY-MM-DD': `${yyyy}-${mm}-${dd}`,
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-dark px-4 py-12">
      <div className="panel p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-main font-mono">Trade Analysis</h1>
          <p className="text-text-dim text-sm mt-1">יצירת חשבון</p>
        </div>

        <StepPills current={step} />

        {/* ── Step 1 ── */}
        {step === 1 && (
          <>
            {!verificationSent ? (
              <>
                <GoogleSignInButton next="/signup" label="הירשם עם Google" />

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-text-dim text-sm">או</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-4">
                <div>
                  <label htmlFor="signup-email" className={labelCls}>דואר אלקטרוני</label>
                  <input
                    id="signup-email"
                    {...form1.register('email')}
                    type="email"
                    dir="ltr"
                    placeholder="your@email.com"
                    autoComplete="email"
                    required
                    aria-invalid={!!form1.formState.errors.email}
                    className={inputCls(form1.formState.errors.email?.message)}
                  />
                  {form1.formState.errors.email && (
                    <p className={errorCls}>{form1.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="signup-password" className={labelCls}>סיסמה</label>
                  <input
                    id="signup-password"
                    {...form1.register('password')}
                    type="password"
                    dir="ltr"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    aria-describedby="signup-password-hint"
                    aria-invalid={!!form1.formState.errors.password}
                    className={inputCls(form1.formState.errors.password?.message)}
                  />
                  {form1.formState.errors.password && (
                    <p className={errorCls}>{form1.formState.errors.password.message}</p>
                  )}
                  <p id="signup-password-hint" className="text-text-dim text-sm mt-1">לפחות 8 תווים, אות ומספר</p>
                </div>

                <div>
                  <label htmlFor="signup-confirm-password" className={labelCls}>אימות סיסמה</label>
                  <input
                    id="signup-confirm-password"
                    {...form1.register('confirmPassword')}
                    type="password"
                    dir="ltr"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    aria-invalid={!!form1.formState.errors.confirmPassword}
                    className={inputCls(form1.formState.errors.confirmPassword?.message)}
                  />
                  {form1.formState.errors.confirmPassword && (
                    <p className={errorCls}>{form1.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                {step1Error && <p className="text-red text-sm text-center">{step1Error}</p>}

                <button
                  type="submit"
                  disabled={form1.formState.isSubmitting}
                  className="w-full py-2 px-4 bg-amber text-black font-semibold rounded-md hover:bg-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {form1.formState.isSubmitting ? 'שולח...' : 'שלח מייל אימות'}
                </button>
                </form>
              </>
            ) : (
              /* Verification instructions card */
              <div className="space-y-4">
                <div className="border border-amber/30 bg-amber-tint rounded-md p-5 space-y-3">
                  <p className="text-amber font-semibold text-sm">אימות מייל נשלח</p>
                  <ol className="text-text-main text-sm space-y-2 list-decimal list-inside leading-relaxed">
                    <li>פתח את תיבת הדואר שלך</li>
                    <li>מצא מייל מ-Trade Analysis עם קישור אימות</li>
                    <li>לחץ על קישור האימות (ייפתח בכרטיסייה חדשה)</li>
                    <li>חזור לכאן ולחץ על "בדוק אימות"</li>
                  </ol>
                </div>

                {step1Error && <p className="text-red text-sm text-center">{step1Error}</p>}

                <button
                  onClick={checkVerification}
                  disabled={checkingVerification}
                  className="w-full py-2 px-4 bg-amber text-black font-semibold rounded-md hover:bg-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checkingVerification ? 'בודק...' : 'בדוק אימות'}
                </button>

                <button
                  onClick={() => { setVerificationSent(false); setStep1Error(null) }}
                  className="w-full py-1.5 text-sm text-text-dim hover:text-text-main transition-colors"
                >
                  חזור לטופס
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <form onSubmit={form2.handleSubmit(onStep2Submit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-first-name" className={labelCls}>שם פרטי</label>
                <input
                  id="signup-first-name"
                  {...form2.register('firstName')}
                  placeholder="ישראל"
                  autoComplete="given-name"
                  required
                  aria-invalid={!!form2.formState.errors.firstName}
                  className={inputCls(form2.formState.errors.firstName?.message)}
                />
                {form2.formState.errors.firstName && (
                  <p className={errorCls}>{form2.formState.errors.firstName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="signup-last-name" className={labelCls}>שם משפחה</label>
                <input
                  id="signup-last-name"
                  {...form2.register('lastName')}
                  placeholder="ישראלי"
                  autoComplete="family-name"
                  required
                  aria-invalid={!!form2.formState.errors.lastName}
                  className={inputCls(form2.formState.errors.lastName?.message)}
                />
                {form2.formState.errors.lastName && (
                  <p className={errorCls}>{form2.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="signup-phone" className={labelCls}>טלפון</label>
              <input
                id="signup-phone"
                {...form2.register('phone')}
                type="tel"
                dir="ltr"
                placeholder="050-1234567"
                autoComplete="tel"
                required
                aria-invalid={!!form2.formState.errors.phone}
                className={inputCls(form2.formState.errors.phone?.message)}
              />
              {form2.formState.errors.phone && (
                <p className={errorCls}>{form2.formState.errors.phone.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="signup-country" className={labelCls}>מדינה</label>
              <input
                id="signup-country"
                {...form2.register('addressCountry')}
                placeholder="ישראל"
                autoComplete="country-name"
                required
                aria-invalid={!!form2.formState.errors.addressCountry}
                className={inputCls(form2.formState.errors.addressCountry?.message)}
              />
              {form2.formState.errors.addressCountry && (
                <p className={errorCls}>{form2.formState.errors.addressCountry.message}</p>
              )}
            </div>

            <div>
              <label className={labelCls}>
                עיר <span className="text-text-dim text-sm">(אופציונלי)</span>
              </label>
              <CityCombobox
                value={cityValue}
                onChange={city => form2.setValue('addressCity', city, { shouldValidate: true })}
                cities={cities}
                loading={citiesLoading}
                error={form2.formState.errors.addressCity?.message}
              />
              {form2.formState.errors.addressCity && (
                <p className={errorCls}>{form2.formState.errors.addressCity.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="signup-street" className={labelCls}>
                כתובת <span className="text-text-dim text-sm">(אופציונלי)</span>
              </label>
              <input
                id="signup-street"
                {...form2.register('addressStreet')}
                placeholder="רחוב הרצל 1"
                autoComplete="street-address"
                className={inputCls(form2.formState.errors.addressStreet?.message)}
              />
            </div>

            <button
              type="submit"
              disabled={form2.formState.isSubmitting}
              className="w-full py-2 px-4 bg-amber text-black font-semibold rounded-md hover:bg-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              המשך
            </button>
          </form>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <form onSubmit={form3.handleSubmit(onStep3Submit)} className="space-y-5">
            {/* Currency */}
            <div>
              <p className="text-xs font-medium text-text-dim uppercase tracking-wider mb-2">מטבע ראשי</p>
              <RadioGroup
                value={currency}
                onChange={v => form3.setValue('currency', v)}
                options={[
                  { value: 'USD', label: 'דולר אמריקאי (USD)', sub: '$1,234.56' },
                  { value: 'ILS', label: 'שקל ישראלי (ILS)',   sub: '₪1,234.56' },
                ]}
              />
            </div>

            {/* Date format */}
            <div>
              <p className="text-xs font-medium text-text-dim uppercase tracking-wider mb-2">פורמט תאריך</p>
              <RadioGroup
                value={dateFormat}
                onChange={v => form3.setValue('dateFormat', v)}
                options={[
                  { value: 'DD/MM/YYYY', label: 'יום/חודש/שנה',           sub: dateExamples['DD/MM/YYYY'] },
                  { value: 'MM/DD/YYYY', label: 'חודש/יום/שנה (אמריקאי)', sub: dateExamples['MM/DD/YYYY'] },
                  { value: 'YYYY-MM-DD', label: 'ISO 8601',                sub: dateExamples['YYYY-MM-DD'] },
                ]}
              />
            </div>

            {/* Number format */}
            <div>
              <p className="text-xs font-medium text-text-dim uppercase tracking-wider mb-2">פורמט מספרים</p>
              <RadioGroup
                value={numberFormat}
                onChange={v => form3.setValue('numberFormat', v)}
                options={[
                  { value: 'en', label: 'אנגלי',   sub: '1,234,567.89' },
                  { value: 'eu', label: 'אירופאי', sub: '1.234.567,89' },
                ]}
              />
            </div>

            {submitError && <p className="text-red text-sm text-center">{submitError}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 py-2 px-4 border border-border text-text-dim text-sm rounded-md hover:border-shade hover:text-text-main transition-colors"
              >
                חזור
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-2 flex-grow py-2 px-4 bg-amber text-black font-semibold rounded-md hover:bg-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'שומר...' : 'סיים הרשמה'}
              </button>
            </div>
          </form>
        )}

        {/* Bottom link */}
        <p className="text-center text-sm text-text-dim mt-6">
          כבר יש לך חשבון?{' '}
          <Link href="/login" className="text-amber hover:underline">
            התחבר
          </Link>
        </p>
      </div>
    </div>
  )
}
