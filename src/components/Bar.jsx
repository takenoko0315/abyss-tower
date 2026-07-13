export default function Bar({ cur, max, color, height = 14 }) {
  return (
    <div style={{ background: "#1c1917", borderRadius: 4, height, overflow: "hidden", border: "1px solid #292524" }}>
      <div style={{ width: `${Math.max(0, (cur / max) * 100)}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
  );
}
