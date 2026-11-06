export function byteRange(value: string | null, length: number): [number, number] | null | 'invalid' {
  if (value === null) return null;
  const match = /^bytes=(0|[1-9]\d*)?-(0|[1-9]\d*)?$/u.exec(value);
  if (!match || !match[1] && !match[2]) return 'invalid';
  const first = match[1] === undefined ? Math.max(0, length - Number(match[2])) : Number(match[1]);
  const last = match[1] === undefined || match[2] === undefined ? length - 1 : Math.min(Number(match[2]), length - 1);
  return !Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first >= length || first > last || match[1] === undefined && Number(match[2]) === 0 ? 'invalid' : [first, last];
}
