import Image from 'next/image'

interface TradeLogoIconProps {
  size?: number
  className?: string
}

export function TradeLogoIcon({ size = 40, className }: TradeLogoIconProps) {
  const radius = Math.round(9 * (size / 40))

  return (
    <Image
      src="/logo.png"
      alt="Trade Analyst logo"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: radius, display: 'block', flexShrink: 0 }}
      priority
    />
  )
}
