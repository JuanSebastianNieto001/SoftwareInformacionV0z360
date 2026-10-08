import type { Modulo } from "@/lib/modulos";

/**
 * Fondos ilustrados de los cuadros de «Mis áreas».
 *
 * Todo es SVG en línea y CSS: nada de imágenes que descargar ni de
 * bibliotecas. La ilustración ocupa la esquina superior derecha y la parte
 * baja del cuadro, lejos del título, y es decorativa (aria-hidden): quien
 * usa lector de pantalla no se pierde nada.
 *
 * Las animaciones van con `motion-safe:`, así que se apagan solas para
 * quien tiene activado «reducir movimiento» en su sistema.
 */

export type TemaCuadro = Modulo | "documentos";

/** Fondo del cuadro según su tema. El texto sigue siendo oscuro sobre claro. */
export const FONDO_CUADRO: Record<TemaCuadro, string> = {
  cumpleanos: "linear-gradient(135deg, #fff5f9 0%, #fff8ec 55%, #f1f8ff 100%)",
  evaluacion: "linear-gradient(135deg, #f4f3ff 0%, #eef6ff 60%, #ffffff 100%)",
  calidad: "linear-gradient(135deg, #ecfdf5 0%, #f0f9ff 60%, #ffffff 100%)",
  pda: "linear-gradient(135deg, #ecfeff 0%, #eff6ff 60%, #ffffff 100%)",
  feedback: "linear-gradient(135deg, #fef2f6 0%, #f3f0ff 55%, #eef7ff 100%)",
  documentos: "linear-gradient(160deg, #ffffff 55%, #eef5fd 100%)",
};

export function DecoracionCuadro({ tema, semilla = "" }: { tema: TemaCuadro; semilla?: string }) {
  if (tema === "cumpleanos") return <Cumpleanos />;
  if (tema === "evaluacion") return <Evaluacion />;
  if (tema === "calidad") return <Calidad />;
  if (tema === "pda") return <Pda />;
  if (tema === "feedback") return <Feedback />;
  return <Documentos semilla={semilla} />;
}

// ---------------------------------------------------------------------------
// Feedback: dos globos de diálogo con un corazón y una marca de visto
// ---------------------------------------------------------------------------

function Feedback() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 size-full" preserveAspectRatio="xMaxYMin slice" aria-hidden>
      <g className="motion-safe:animate-[flotar_6s_ease-in-out_infinite]">
        <rect x="118" y="16" width="64" height="42" rx="12" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="1.5" />
        <path d="M132 58 l0 12 12 -12 z" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="1.5" />
        <path d="M150 28 c-4 -5 -12 -2 -12 4 c0 5 7 9 12 13 c5 -4 12 -8 12 -13 c0 -6 -8 -9 -12 -4 z" fill="#f472b6" />
      </g>
      <g className="motion-safe:animate-[flotar_7s_ease-in-out_infinite]">
        <rect x="150" y="66" width="46" height="34" rx="10" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.5" />
        <path d="M170 100 l0 10 10 -10 z" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.5" />
        <path d="M160 83 l6 6 12 -13" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PDA: una diana con la flecha clavada y barras de avance que crecen
// ---------------------------------------------------------------------------

function Pda() {
  const barras = [
    { x: 4, h: 16 },
    { x: 18, h: 24 },
    { x: 32, h: 34 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg className="absolute right-4 bottom-8 h-[70px] w-[104px] opacity-85" viewBox="0 0 104 70">
        <line x1="2" y1="66" x2="46" y2="66" stroke="#a5f3fc" strokeWidth="1.5" />
        {barras.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={66 - b.h}
            width="10"
            height={b.h}
            rx="3"
            fill={["#a5f3fc", "#67e8f9", "#06b6d4"][i]}
            className="origin-bottom motion-safe:animate-[crecer_1.1s_ease-out_both]"
            style={{ animationDelay: `${i * 0.15}s`, transformBox: "fill-box" }}
          />
        ))}
        <circle cx="76" cy="36" r="26" fill="#fff" stroke="#bae6fd" strokeWidth="2" />
        <circle cx="76" cy="36" r="17" fill="none" stroke="#7dd3fc" strokeWidth="2" />
        <circle cx="76" cy="36" r="8" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2" />
        <circle cx="76" cy="36" r="2.5" fill="#0369a1" />
        <g className="motion-safe:animate-[marcar_2.6s_ease-in-out_infinite]">
          <line x1="76" y1="36" x2="98" y2="14" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M98 14 l-1 6 M98 14 l-6 1" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </svg>
      <span className="absolute -right-8 -bottom-10 size-32 rounded-full bg-cyan-200/30" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calidad: una lista de verificación con marcas que se van encendiendo
// ---------------------------------------------------------------------------

function Calidad() {
  const filas = [0, 1, 2, 3];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg className="absolute right-4 bottom-8 h-[74px] w-[92px] opacity-85" viewBox="0 0 92 74">
        <rect x="2" y="2" width="88" height="70" rx="10" fill="#fff" stroke="#a7f3d0" />
        {filas.map((i) => (
          <g key={i} className="motion-safe:animate-[marcar_3.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.5}s` }}>
            <rect x="12" y={12 + i * 15} width="11" height="11" rx="3" fill="#d1fae5" stroke="#10b981" />
            <path d={`M14.5 ${18 + i * 15} l2.5 2.5 l5 -5.5`} fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="30" y={15 + i * 15} width={i === 3 ? 28 : 46} height="5" rx="2.5" fill="#99f6e4" opacity={0.8 - i * 0.12} />
          </g>
        ))}
      </svg>
      <svg
        className="absolute top-12 right-5 size-7 text-emerald-500 motion-safe:animate-[brillar_2.8s_ease-in-out_infinite]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2l7 3v6c0 5-3.5 9-7 11-3.5-2-7-6-7-11V5z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <span className="absolute -right-10 -bottom-12 size-36 rounded-full bg-emerald-200/25" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cumpleaños: globos y confeti
// ---------------------------------------------------------------------------

/** Confeti: posición (en % del cuadro), color, forma y giro. Fijo para que no cambie al recargar. */
const CONFETI: { x: number; y: number; c: string; f: "r" | "c" | "t"; g: number; d: number }[] = [
  { x: 8, y: 70, c: "#ff4f8b", f: "r", g: 20, d: 0 },
  { x: 18, y: 86, c: "#ffb800", f: "c", g: 0, d: 0.4 },
  { x: 30, y: 74, c: "#1a7fe0", f: "t", g: -15, d: 0.8 },
  { x: 41, y: 90, c: "#22c55e", f: "r", g: 45, d: 0.2 },
  { x: 52, y: 78, c: "#a855f7", f: "c", g: 0, d: 1.1 },
  { x: 60, y: 92, c: "#ff4f8b", f: "t", g: 30, d: 0.6 },
  { x: 47, y: 66, c: "#ffb800", f: "r", g: -30, d: 1.4 },
  { x: 50, y: 10, c: "#22c55e", f: "c", g: 0, d: 0.9 },
  { x: 40, y: 18, c: "#ff4f8b", f: "r", g: 60, d: 0.3 },
  { x: 62, y: 8, c: "#1a7fe0", f: "c", g: 0, d: 1.2 },
  { x: 92, y: 74, c: "#a855f7", f: "r", g: 15, d: 0.5 },
  { x: 84, y: 88, c: "#ffb800", f: "t", g: -40, d: 1 },
  { x: 72, y: 82, c: "#1a7fe0", f: "r", g: 70, d: 0.7 },
  { x: 96, y: 56, c: "#ff4f8b", f: "c", g: 0, d: 1.3 },
];

/** Globos: centro, color, tamaño, retraso de la animación. */
const GLOBOS = [
  { cx: 66, cy: 30, r: 13, c: "#ff4f8b", brillo: "#ffc2d8", d: 0 },
  { cx: 88, cy: 22, r: 15, c: "#1a7fe0", brillo: "#b8dbff", d: 0.8 },
  { cx: 108, cy: 36, r: 12, c: "#ffb800", brillo: "#ffe7a3", d: 1.6 },
];

function Cumpleanos() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Confeti por todo el cuadro, cayendo suave */}
      {CONFETI.map((p, i) => (
        <span
          key={i}
          className="absolute block opacity-80 motion-safe:animate-[confeti_3.6s_ease-in-out_infinite]"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${p.d}s`,
            ["--giro" as string]: `${p.g}deg`,
          }}
        >
          {p.f === "c" ? (
            <span className="block size-[6px] rounded-full" style={{ background: p.c }} />
          ) : p.f === "t" ? (
            <span
              className="block size-0 border-x-[4px] border-b-[7px] border-x-transparent"
              style={{ borderBottomColor: p.c, transform: `rotate(${p.g}deg)` }}
            />
          ) : (
            <span
              className="block h-[8px] w-[4px] rounded-[1px]"
              style={{ background: p.c, transform: `rotate(${p.g}deg)` }}
            />
          )}
        </span>
      ))}

      {/* Serpentina */}
      <svg className="absolute -bottom-1 left-0 h-10 w-full opacity-70" viewBox="0 0 300 40" preserveAspectRatio="none">
        <path d="M0 30 Q 25 10 50 28 T 100 26 T 150 30 T 200 22 T 250 30 T 300 18" fill="none" stroke="#ff4f8b" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" />
        <path d="M0 36 Q 30 20 60 34 T 120 32 T 180 36 T 240 28 T 300 34" fill="none" stroke="#ffb800" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 6" />
      </svg>

      {/* Globos bajo la insignia de nivel, flotando */}
      <svg className="absolute top-10 right-0 h-[88px] w-[96px]" viewBox="0 0 130 118">
        {GLOBOS.map((g, i) => (
          <g
            key={i}
            className="origin-bottom motion-safe:animate-[flotar_4.2s_ease-in-out_infinite]"
            style={{ animationDelay: `${g.d}s` }}
          >
            <path
              d={`M${g.cx} ${g.cy + g.r + 3} q -6 18 3 34 q 7 14 -2 30`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1"
            />
            <ellipse cx={g.cx} cy={g.cy} rx={g.r} ry={g.r * 1.18} fill={g.c} />
            <ellipse cx={g.cx - g.r * 0.38} cy={g.cy - g.r * 0.45} rx={g.r * 0.26} ry={g.r * 0.38} fill={g.brillo} opacity="0.85" />
            <path d={`M${g.cx - 3} ${g.cy + g.r * 1.18} l3 4 l3 -4 z`} fill={g.c} />
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evaluación: barras que suben y una estrella
// ---------------------------------------------------------------------------

function Evaluacion() {
  const barras = [
    { x: 14, h: 26, c: "#c7d2fe" },
    { x: 34, h: 40, c: "#a5b4fc" },
    { x: 54, h: 33, c: "#818cf8" },
    { x: 74, h: 54, c: "#6366f1" },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg className="absolute right-3 bottom-9 h-[56px] w-[76px] opacity-70" viewBox="0 0 104 78">
        <line x1="6" y1="72" x2="100" y2="72" stroke="#c7d2fe" strokeWidth="1.5" />
        {barras.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={72 - b.h}
            width="14"
            height={b.h}
            rx="4"
            fill={b.c}
            className="origin-bottom motion-safe:animate-[crecer_1.1s_ease-out_both]"
            style={{ animationDelay: `${i * 0.12}s`, transformBox: "fill-box" }}
          />
        ))}
        <polyline points="21,40 41,26 61,32 81,12" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {[
          [21, 40],
          [41, 26],
          [61, 32],
          [81, 12],
        ].map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r="3" fill="#fff" stroke="#f59e0b" strokeWidth="2" />
        ))}
      </svg>
      <svg
        className="absolute top-14 right-6 size-5 text-amber-400 motion-safe:animate-[brillar_2.6s_ease-in-out_infinite]"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" />
      </svg>
      <span className="absolute -right-8 -bottom-10 size-32 rounded-full bg-indigo-200/30" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carpetas de documentos: hojas apiladas, con un color por área
// ---------------------------------------------------------------------------

const PALETA = ["#1a7fe0", "#0ea5a4", "#7c3aed", "#e8590c", "#16a34a", "#db2777"];

/** El mismo cuadro siempre sale del mismo color: se elige por su slug. */
function colorDe(semilla: string): string {
  let h = 0;
  for (const ch of semilla) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

function Documentos({ semilla }: { semilla: string }) {
  const c = colorDe(semilla);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: c, opacity: 0.85 }} />
      <svg
        className="absolute right-3 bottom-8 h-[70px] w-[64px] transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-2"
        viewBox="0 0 64 70"
      >
        <rect x="14" y="4" width="40" height="52" rx="5" fill={c} opacity="0.12" transform="rotate(8 34 30)" />
        <rect x="10" y="8" width="40" height="52" rx="5" fill={c} opacity="0.2" transform="rotate(-4 30 34)" />
        <rect x="8" y="12" width="40" height="52" rx="5" fill="#fff" stroke={c} strokeOpacity="0.35" />
        {[24, 32, 40, 48].map((y, i) => (
          <rect key={y} x="15" y={y} width={i === 3 ? 16 : 26} height="3" rx="1.5" fill={c} opacity="0.35" />
        ))}
      </svg>
    </div>
  );
}
