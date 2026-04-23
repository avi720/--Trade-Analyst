export default function ChatMessage({ sender, text, isError }) {
  const labelColor = sender === 'משתמש'
    ? 'text-zinc-500'
    : isError ? 'text-[#FF4D4D]' : 'text-[#FFB800]'

  return (
    <div className="space-y-1.5 border-b border-zinc-800/50 pb-4 mb-4 last:border-0">
      <p className={`${labelColor} text-[10px] uppercase tracking-widest font-bold`}>{sender}</p>
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#E0E0E0]">{text}</div>
    </div>
  )
}
