const sizes = {
  sm: 'w-8 h-8 text-base',
  md: 'w-10 h-10 text-lg',
  lg: 'w-16 h-16 text-3xl',
  xl: 'w-24 h-24 text-5xl',
}

export default function Avatar({ emoji = '🐨', size = 'md', rotate = -3 }) {
  return (
    <div
      className={`${sizes[size]} rounded-md bg-white border-[1.5px] border-ink flex items-center justify-center shrink-0`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <span>{emoji}</span>
    </div>
  )
}
