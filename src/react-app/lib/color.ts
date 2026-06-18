function mixHex(hex: string, toward: number, ratio: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const fr = Math.round(r + (toward - r) * ratio);
  const fg = Math.round(g + (toward - g) * ratio);
  const fb = Math.round(b + (toward - b) * ratio);
  return `#${fr.toString(16).padStart(2, "0")}${fg.toString(16).padStart(2, "0")}${fb.toString(16).padStart(2, "0")}`;
}

export function generateCardPalette(bgHex: string): string[] {
  if (!/^#[0-9a-fA-F]{6}$/.test(bgHex)) bgHex = "#fdf8f2";
  return [
    mixHex(bgHex, 0, 0.30),
    mixHex(bgHex, 0, 0.58),
    "#111111",
  ];
}

function toLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function autoTextColor(hexBg: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hexBg)) return "#111111";
  return luminance(hexBg) > 0.179 ? "#111111" : "#ffffff";
}

export function adaptTextColor(textHex: string, bgHex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(textHex) || !/^#[0-9a-fA-F]{6}$/.test(bgHex)) return autoTextColor(bgHex);
  const bgNeedsLight = luminance(bgHex) <= 0.179;
  const textIsLight = luminance(textHex) > 0.179;
  return bgNeedsLight === textIsLight ? textHex : autoTextColor(bgHex);
}

export async function extractDominantColor(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const pixels: { r: number; g: number; b: number; sat: number }[] = [];
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2], pa = data[i + 3];
          if (pa < 128) continue;
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const sat = max === 0 ? 0 : (max - min) / max;
          pixels.push({ r: pr, g: pg, b: pb, sat });
        }
        if (pixels.length === 0) { resolve(null); return; }
        pixels.sort((a, b) => b.sat - a.sat);
        const top = pixels.slice(0, Math.max(1, Math.floor(pixels.length * 0.2)));
        const sum = top.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
        const fr = Math.round(sum.r / top.length);
        const fg = Math.round(sum.g / top.length);
        const fb = Math.round(sum.b / top.length);
        resolve(`#${fr.toString(16).padStart(2, "0")}${fg.toString(16).padStart(2, "0")}${fb.toString(16).padStart(2, "0")}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
