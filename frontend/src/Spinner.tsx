// A small circular loading spinner. Sized via props; color follows the button
// (white ring on the dark transport controls).
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 11)) }}
      aria-label="Wird geladen"
    />
  );
}
