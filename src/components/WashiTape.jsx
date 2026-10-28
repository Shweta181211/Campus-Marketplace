const tapeColors = {
  sky: 'bg-tape-sky',
  coral: 'bg-tape-coral',
  yellow: 'bg-tape-yellow',
  moss: 'bg-tape-moss',
}

export default function WashiTape({ color = 'sky', className = '', rotate = -8, width = 56 }) {
  return (
    <div
      className={`tape absolute ${tapeColors[color]} h-5 rounded-[1px] pointer-events-none ${className}`}
      style={{ width, transform: `rotate(${rotate}deg)` }}
    />
  )
}
