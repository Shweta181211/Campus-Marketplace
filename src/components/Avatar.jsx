const sizes = {
  sm: 'w-8 h-8 text-base',
  md: 'w-10 h-10 text-lg',
  lg: 'w-16 h-16 text-3xl',
  xl: 'w-24 h-24 text-5xl',
}

/**
 * Component-based avatar (PDF 3.1): face, skin, hair, hair colour, outfit, outfit colour, accessory, background.
 * Stored as a tiny JSON object on the user, drawn here as SVG — no real photo is ever needed.
 */
export function AvatarFigure({ config }) {
  const c = { face: 'round', skin: '#e8b98a', hair: 'short', hairColor: '#2b1d14', outfit: 'tshirt', outfitColor: '#2a9d8f', accessory: 'none', bg: '#fde68a', ...config }
  const faceShape =
    c.face === 'square' ? <rect x="20" y="16" width="24" height="26" rx="6" fill={c.skin} /> :
    c.face === 'oval' ? <ellipse cx="32" cy="29" rx="11.5" ry="14" fill={c.skin} /> :
    <circle cx="32" cy="29" r="12.5" fill={c.skin} />
  const hair = {
    short: <path d="M19 27 Q19 13 32 13 Q45 13 45 27 Q41 19 32 19 Q23 19 19 27Z" fill={c.hairColor} />,
    long: <path d="M18 44 L18 26 Q18 12 32 12 Q46 12 46 26 L46 44 L41 44 L41 24 Q32 18 23 24 L23 44Z" fill={c.hairColor} />,
    curly: (
      <g fill={c.hairColor}>
        {[20, 25, 30, 35, 40, 44].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 15 : 18} r="5" />)}
      </g>
    ),
    bun: (
      <g fill={c.hairColor}>
        <circle cx="32" cy="9" r="5" />
        <path d="M19 26 Q19 13 32 13 Q45 13 45 26 Q40 18 32 18 Q24 18 19 26Z" />
      </g>
    ),
    buzz: <path d="M20 24 Q21 15 32 15 Q43 15 44 24 Q38 19 32 19 Q26 19 20 24Z" fill={c.hairColor} opacity="0.75" />,
    none: null,
  }[c.hair]
  const outfit = {
    tshirt: <path d="M14 64 Q14 48 32 46 Q50 48 50 64Z" fill={c.outfitColor} />,
    hoodie: (
      <g fill={c.outfitColor}>
        <path d="M12 64 Q12 46 32 44 Q52 46 52 64Z" />
        <path d="M24 46 Q32 54 40 46" stroke="#00000033" strokeWidth="2" fill="none" />
      </g>
    ),
    shirt: (
      <g>
        <path d="M14 64 Q14 48 32 46 Q50 48 50 64Z" fill={c.outfitColor} />
        <path d="M28 46 L32 54 L36 46" fill="#fff" />
      </g>
    ),
    kurta: (
      <g>
        <path d="M15 64 Q15 47 32 45 Q49 47 49 64Z" fill={c.outfitColor} />
        <line x1="32" y1="47" x2="32" y2="58" stroke="#00000040" strokeWidth="1.5" />
      </g>
    ),
  }[c.outfit]
  const accessory = {
    none: null,
    glasses: (
      <g stroke="#1f1b16" strokeWidth="1.4" fill="none">
        <circle cx="27" cy="29" r="3.6" />
        <circle cx="37" cy="29" r="3.6" />
        <line x1="30.6" y1="29" x2="33.4" y2="29" />
      </g>
    ),
    cap: <path d="M18 22 Q18 11 32 11 Q46 11 46 22 L52 23 L46 24 L18 24Z" fill="#1f1b16" />,
    earrings: (
      <g fill="#d4a017">
        <circle cx="19.5" cy="33" r="1.6" />
        <circle cx="44.5" cy="33" r="1.6" />
      </g>
    ),
    headphones: (
      <g fill="none" stroke="#1f1b16" strokeWidth="2.2">
        <path d="M18 30 Q18 12 32 12 Q46 12 46 30" />
        <rect x="15" y="27" width="5" height="8" rx="2" fill="#1f1b16" />
        <rect x="44" y="27" width="5" height="8" rx="2" fill="#1f1b16" />
      </g>
    ),
  }[c.accessory]
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" role="img" aria-label="avatar">
      <rect width="64" height="64" fill={c.bg} />
      {outfit}
      <rect x="28" y="38" width="8" height="9" fill={c.skin} />
      {c.hair === 'long' && hair}
      {faceShape}
      <circle cx="27" cy="29" r="1.4" fill="#1f1b16" />
      <circle cx="37" cy="29" r="1.4" fill="#1f1b16" />
      <path d="M28 35 Q32 38 36 35" stroke="#1f1b16" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {c.hair !== 'long' && hair}
      {accessory}
    </svg>
  )
}

export default function Avatar({ emoji = '🐨', config = null, size = 'md', rotate = -3 }) {
  return (
    <div
      className={`${sizes[size]} rounded-md bg-white border-[1.5px] border-ink flex items-center justify-center shrink-0 overflow-hidden`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {config ? <AvatarFigure config={config} /> : <span>{emoji}</span>}
    </div>
  )
}
