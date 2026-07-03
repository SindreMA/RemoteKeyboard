// A small status dot with a soft glow ring (armed = green, paused = amber).

export function StatusDot({
  color,
  glow,
  size = 9,
}: {
  color: string;
  glow: string;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 0 4px ${glow}`,
        flex: "none",
        display: "inline-block",
      }}
    />
  );
}
