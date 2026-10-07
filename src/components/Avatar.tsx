const GRADIENTS = [
  ['#FF8A65', '#F4511E'],
  ['#FFB74D', '#F57C00'],
  ['#81C784', '#2E7D32'],
  ['#4DD0E1', '#00838F'],
  ['#64B5F6', '#1565C0'],
  ['#9575CD', '#4527A0'],
  ['#F06292', '#AD1457'],
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(title: string): string {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '#';
  if (/^\d/.test(words[0]!)) return '#';
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Initials on a stable gradient picked from the chat id, like in Telegram. */
export function Avatar({ id, title, size = 48 }: { id: string; title: string; size?: number }) {
  const [from, to] = GRADIENTS[hash(id) % GRADIENTS.length]!;
  return (
    <div
      className="avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {initials(title)}
    </div>
  );
}
