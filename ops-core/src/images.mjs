/**
 * 图片工具（从 OZON 项目提炼，平台无关）：
 * - renderTextPng：用本机 Pillow 渲染西里尔/中文/俄语文字层（jimp 位图字体只有拉丁字母）
 * - fetchImageToFile：远端图片下载，支持 HTTP 代理（部分海外域名直连不通）
 * - inspectImageSize：读 PNG/JPEG 尺寸（纯 Node，不依赖图形库）
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PYTHON_CANDIDATES = [
  process.env.PYTHON_PATH,
  process.env.OPS_PYTHON,
  ...(process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']),
].filter(Boolean);

const FONT_CANDIDATES = [
  process.env.OPS_FONT_PATH,
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/arial.ttf',
].filter(Boolean);

export function resolvePython() {
  for (const candidate of PYTHON_CANDIDATES) {
    const isCommand = !candidate.includes('/') && !candidate.includes('\\');
    if (isCommand || existsSync(candidate)) return candidate;
  }
  return 'python';
}

export function resolveFont() {
  for (const candidate of FONT_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('找不到支持目标语言字形的字体，请设置 OPS_FONT_PATH');
}

export function renderTextPng({ text, outputPath, width = 900, height = 220, fontSize = 88, color = '#ffffff', stroke = '#000000', strokeWidth = 0, maxWidth = null }) {
  const font = resolveFont();
  const script = [
    'import sys, json',
    'from PIL import Image, ImageDraw, ImageFont',
    'a = json.loads(sys.argv[1])',
    'img = Image.new("RGBA", (a["width"], a["height"]), (0, 0, 0, 0))',
    'draw = ImageDraw.Draw(img)',
    'size = a["fontSize"]',
    'limit = a.get("maxWidth") or (a["width"] - 80)',
    'while size > 24:',
    '    f = ImageFont.truetype(a["font"], size)',
    '    box = draw.textbbox((0, 0), a["text"], font=f)',
    '    if box[2] - box[0] <= limit: break',
    '    size -= 4',
    'f = ImageFont.truetype(a["font"], size)',
    'box = draw.textbbox((0, 0), a["text"], font=f)',
    'x = (a["width"] - (box[2] - box[0])) // 2 - box[0]',
    'y = (a["height"] - (box[3] - box[1])) // 2 - box[1]',
    'draw.text((x, y), a["text"], font=f, fill=a["color"], stroke_width=a["strokeWidth"], stroke_fill=a["stroke"])',
    'img.save(a["outputPath"])',
  ].join('\n');
  execFileSync(resolvePython(), ['-c', script, JSON.stringify({ text, outputPath, width, height, fontSize, color, stroke, strokeWidth, maxWidth, font })], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return outputPath;
}

export function buildCurlFetchArgs({ url, output, proxy, timeoutSec = 120 }) {
  const args = ['-s', '-L', '--max-time', String(timeoutSec), '-o', output];
  if (proxy) args.push('-x', proxy);
  args.push(url);
  return args;
}

export function fetchImageToFile({ url, output, proxy = process.env.OPS_HTTP_PROXY ?? null, curl = process.env.OPS_CURL ?? 'curl.exe' }) {
  mkdirSync(dirname(output), { recursive: true });
  execFileSync(curl, buildCurlFetchArgs({ url, output, proxy }), { stdio: ['ignore', 'pipe', 'pipe'] });
  return { output };
}

export function inspectImageSize(path) {
  const buffer = readFileSync(path);
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpeg', height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  throw new Error(`无法识别图片格式：${path}`);
}
