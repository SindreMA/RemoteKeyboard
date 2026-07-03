// The RemoteKeyboard glyph (a keyboard with a swap/return motif) and the app
// badge. Taken from the design's header mark.

export function KeyboardGlyph({ size = 22, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.4" y="6.2" width="19.2" height="12.4" rx="2.6" stroke={color} strokeWidth="1.7" />
      <rect x="5.6" y="9.1" width="1.8" height="1.8" rx="0.5" fill={color} />
      <rect x="9" y="9.1" width="1.8" height="1.8" rx="0.5" fill={color} />
      <rect x="12.4" y="9.1" width="1.8" height="1.8" rx="0.5" fill={color} />
      <rect x="7.4" y="13.2" width="9.2" height="1.9" rx="1" fill={color} />
      <path
        d="M19.4 12.2v1.5a1.2 1.2 0 0 1-1.2 1.2h-2.3M17 13.6l-1.2 1.3 1.2 1.3"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppBadge({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        background: "#2F6BFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px rgba(47,107,255,.35)",
        flex: "none",
      }}
    >
      <KeyboardGlyph size={size * 0.59} />
    </div>
  );
}
