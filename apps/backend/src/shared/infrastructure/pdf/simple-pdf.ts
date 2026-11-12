/**
 * PDF de una página con texto y líneas, sin dependencias (comprobantes, COPAYNI-80). Usa las
 * fuentes estándar Helvetica con codificación WinAnsi: cubre el español (tildes, ñ, ¿, ¡) y "•".
 * Coordenadas en puntos, con el origen arriba a la izquierda.
 */
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;

/** Caracteres de WinAnsi fuera de Latin-1 que usamos. */
const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
};

/** Texto a bytes WinAnsi en hexadecimal (`<...>`): así no hay que escapar paréntesis. */
function encode(text: string): string {
  let hex = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const byte =
      WIN_ANSI_EXTRA[char] ??
      (code < 0x20 ? 0x20 : code <= 0x7e || (code >= 0xa0 && code <= 0xff) ? code : 0x3f);
    hex += byte.toString(16).padStart(2, '0');
  }
  return `<${hex}>`;
}

const round = (value: number): string => (Math.round(value * 100) / 100).toString();

export interface TextOptions {
  size?: number;
  bold?: boolean;
  /** Gris de 0 (negro) a 1 (blanco). */
  gray?: number;
}

export class SimplePdf {
  private readonly operations: string[] = [];

  constructor(private readonly title: string) {}

  text(x: number, y: number, value: string, options: TextOptions = {}): this {
    const size = options.size ?? 11;
    this.operations.push(
      `BT ${round(options.gray ?? 0)} g /${options.bold ? 'F2' : 'F1'} ${size} Tf ` +
        `${round(x)} ${round(PAGE_HEIGHT - y - size)} Td ${encode(value)} Tj ET`,
    );
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, gray = 0.8): this {
    this.operations.push(
      `${round(gray)} G 0.75 w ${round(x1)} ${round(PAGE_HEIGHT - y1)} m ` +
        `${round(x2)} ${round(PAGE_HEIGHT - y2)} l S`,
    );
    return this;
  }

  build(): Buffer {
    const content = this.operations.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      `<< /Title ${encode(this.title)} /Producer (Ayni) >>`,
    ];
    let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`).join('');
    pdf +=
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
      `startxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
  }
}
