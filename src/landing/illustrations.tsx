// Ilustraciones vectoriales de herramientas (no dependen de fotos externas).
// Para usar fotos reales, reemplazá estos componentes por <img src="/productos/xxx.jpg" />.

const O = '#FE4806';
const W = '#f5f5f5';
const G = '#3a3a3a';
const G2 = '#5a5a5a';

type P = { className?: string };

export function Hammer({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <rect x="92" y="70" width="18" height="120" rx="8" fill={G2} transform="rotate(25 100 130)" />
      <rect x="92" y="120" width="18" height="70" rx="8" fill={O} transform="rotate(25 100 130)" />
      <g transform="rotate(25 100 130)">
        <rect x="52" y="34" width="96" height="40" rx="8" fill={W} />
        <rect x="52" y="34" width="26" height="40" rx="6" fill={G} />
        <path d="M148 40 L178 48 L178 62 L148 68Z" fill={W} />
      </g>
    </svg>
  );
}

export function Wrench({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <g transform="rotate(-40 100 100)">
        <rect x="90" y="50" width="20" height="130" rx="10" fill={W} />
        <path d="M70 60 a30 30 0 1 1 60 0 v-14 h-18 v14 h-24 v-14 h-18z" fill={O} />
        <circle cx="100" cy="168" r="11" fill={G} />
      </g>
    </svg>
  );
}

export function Drill({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <path d="M40 60 h92 a16 16 0 0 1 16 16 v22 a10 10 0 0 1 -10 10 h-98z" fill={O} />
      <path d="M56 108 h38 l-10 62 a8 8 0 0 1 -8 7 h-12 a8 8 0 0 1 -8 -9z" fill={G} />
      <rect x="148" y="78" width="22" height="22" rx="3" fill={W} />
      <rect x="170" y="84" width="22" height="10" rx="3" fill={G2} />
      <rect x="50" y="48" width="70" height="12" rx="5" fill={W} />
    </svg>
  );
}

export function Saw({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <path d="M20 120 L150 48 L170 76 L50 150Z" fill={W} />
      <path d="M20 120 l8 12 l8 -8 l8 12 l8 -8 l8 12 l8 -8 l8 12 l8 -8 l8 12 l8 -8 l8 12 l8 -8" stroke={G2} strokeWidth="3" strokeLinejoin="round" />
      <path d="M150 48 L186 34 a8 8 0 0 1 10 10 L170 76Z" fill={O} />
      <circle cx="170" cy="52" r="5" fill={G} />
    </svg>
  );
}

export function Pliers({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <g transform="rotate(20 100 100)">
        <path d="M84 20 q16 -8 32 0 l-4 56 h-24z" fill={W} />
        <path d="M72 78 h56 l-8 22 h-40z" fill={G2} />
        <path d="M80 100 L66 186 a10 10 0 0 0 20 4 L100 112 L114 190 a10 10 0 0 0 20 -4 L120 100z" fill={O} />
        <circle cx="100" cy="88" r="7" fill={G} />
      </g>
    </svg>
  );
}

export function Screwdriver({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <g transform="rotate(45 100 100)">
        <rect x="86" y="108" width="28" height="78" rx="12" fill={O} />
        <rect x="86" y="132" width="28" height="8" fill={G} />
        <rect x="96" y="30" width="8" height="82" rx="3" fill={W} />
        <path d="M94 30 h12 l-3 -14 h-6z" fill={G2} />
      </g>
    </svg>
  );
}

export function Tape({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <rect x="32" y="48" width="112" height="112" rx="26" fill={O} />
      <circle cx="88" cy="104" r="34" fill={G} />
      <circle cx="88" cy="104" r="14" fill={W} />
      <rect x="130" y="130" width="62" height="18" rx="3" fill={W} />
      <path d="M142 130 v8 M154 130 v12 M166 130 v8 M178 130 v12" stroke={G} strokeWidth="2" />
    </svg>
  );
}

export function Grinder({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <rect x="20" y="90" width="110" height="38" rx="14" fill={O} />
      <rect x="110" y="84" width="34" height="50" rx="8" fill={G} />
      <circle cx="168" cy="109" r="30" fill={W} opacity=".95" />
      <circle cx="168" cy="109" r="30" stroke={G2} strokeWidth="3" strokeDasharray="6 6" />
      <circle cx="168" cy="109" r="7" fill={G} />
      <rect x="44" y="128" width="26" height="42" rx="8" fill={G2} transform="rotate(-8 57 149)" />
    </svg>
  );
}

export function Toolbox({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <path d="M72 70 v-16 a10 10 0 0 1 10 -10 h36 a10 10 0 0 1 10 10 v16" stroke={W} strokeWidth="10" strokeLinecap="round" />
      <rect x="22" y="68" width="156" height="102" rx="14" fill={O} />
      <rect x="22" y="104" width="156" height="10" fill={G} />
      <rect x="88" y="94" width="24" height="30" rx="5" fill={W} />
    </svg>
  );
}
