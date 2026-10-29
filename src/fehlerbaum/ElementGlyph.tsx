import type { ElementKind } from './model'

/** Zeichnet das Symbol eines Elements in seinem lokalen Koordinatensystem (links oben = 0/0). */
export function ElementGlyph({ kind }: { kind: ElementKind }) {
  switch (kind) {
    case 'standardeingang':
      return <circle className="glyph" cx={28} cy={28} r={28} />
    case 'und':
      return (
        <>
          <path className="glyph" d="M 0 64 L 0 32 C 0 -4, 72 -4, 72 32 L 72 64 Z" />
          <text className="glyph-symbol" x={36} y={44} textAnchor="middle">
            {'&'}
          </text>
        </>
      )
    case 'oder':
      return (
        <>
          <path
            className="glyph"
            d="M 0 64 Q 36 44 72 64 C 72 30, 50 8, 36 0 C 22 8, 0 30, 0 64 Z"
          />
          <text className="glyph-symbol" x={36} y={44} textAnchor="middle">
            {'≥1'}
          </text>
        </>
      )
  }
}
