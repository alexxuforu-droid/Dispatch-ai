export type CaptureFrame = {
  sequence: number;
  timestampMs: number;
  capturedAtMs: number;
  width: number;
  height: number;
  jpegBase64: string;
};

export type CaptureTarget = {
  hwndHex: string;
  title: string;
  processId: number;
  processName: string;
};

export type CaptureMetrics = {
  firstFrameMs: number | null;
  capturedFrames: number;
  deliveredFrames: number;
  droppedFrames: number;
  fps: number;
};

export type CaptureRead = CaptureMetrics & {
  frame: CaptureFrame | null;
  stopped: boolean;
  message?: string | null;
};

const MAX_CAPTURE_FRAME_CHARS = 4 * 1024 * 1024;
const MAX_TARGET_RESPONSE_CHARS = 1024 * 1024;
const READ_KEYS = ['frame', 'stopped', 'firstFrameMs', 'capturedFrames', 'deliveredFrames', 'droppedFrames', 'fps'];
const READ_KEYS_WITH_MESSAGE = [...READ_KEYS, 'message'];
const FRAME_KEYS = ['sequence', 'timestampMs', 'capturedAtMs', 'width', 'height', 'jpegBase64'];
const TARGET_KEYS = ['hwndHex', 'title', 'processId', 'processName'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function parseMetrics(data: Record<string, unknown>): CaptureMetrics {
  if (data.firstFrameMs !== null && !isFiniteNonnegative(data.firstFrameMs)) throw new Error('Invalid capture first-frame time.');
  if (!isNonnegativeInteger(data.capturedFrames) || !isNonnegativeInteger(data.deliveredFrames) || !isNonnegativeInteger(data.droppedFrames)) {
    throw new Error('Invalid capture frame counts.');
  }
  if (data.deliveredFrames > data.capturedFrames || data.droppedFrames > data.capturedFrames - data.deliveredFrames) {
    throw new Error('Invalid capture frame counts.');
  }
  if (!isFiniteNonnegative(data.fps) || data.fps > 120) throw new Error('Invalid capture frame rate.');
  return {
    firstFrameMs: data.firstFrameMs,
    capturedFrames: data.capturedFrames,
    deliveredFrames: data.deliveredFrames,
    droppedFrames: data.droppedFrames,
    fps: data.fps,
  };
}

function parseFrame(value: unknown): CaptureFrame {
  if (!isRecord(value) || !hasExactKeys(value, FRAME_KEYS)) throw new Error('Invalid capture frame.');
  const { sequence, timestampMs, capturedAtMs, width, height, jpegBase64 } = value;
  if (!isNonnegativeInteger(sequence) || sequence < 1 || !isFiniteNonnegative(timestampMs) || !isFiniteNonnegative(capturedAtMs)) {
    throw new Error('Invalid capture frame timestamp.');
  }
  if (!isNonnegativeInteger(width) || !isNonnegativeInteger(height) || width < 1 || height < 1 || Math.max(width, height) > 1920) {
    throw new Error('Invalid capture frame dimensions.');
  }
  if (typeof jpegBase64 !== 'string' || jpegBase64.length > MAX_CAPTURE_FRAME_CHARS || !/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(jpegBase64)) {
    throw new Error('Invalid capture JPEG data.');
  }
  return { sequence, timestampMs, capturedAtMs, width, height, jpegBase64 };
}

export function parseCaptureRead(raw: string): CaptureRead {
  if (typeof raw !== 'string' || raw.length > MAX_CAPTURE_FRAME_CHARS + 1024) throw new Error('Native capture response is too large.');
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Native capture returned invalid JSON.');
  }
  if (!isRecord(value) || (!hasExactKeys(value, READ_KEYS) && !hasExactKeys(value, READ_KEYS_WITH_MESSAGE)) || typeof value.stopped !== 'boolean') {
    throw new Error('Native capture returned an invalid response.');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'message') && value.message !== null && typeof value.message !== 'string') {
    throw new Error('Native capture returned an invalid stop reason.');
  }
  if (!value.stopped && typeof value.message === 'string') throw new Error('An active capture cannot report a stop reason.');
  const metrics = parseMetrics(value);
  if (value.stopped && value.frame !== null) throw new Error('A stopped capture cannot return a frame.');
  return { frame: value.frame === null ? null : parseFrame(value.frame), stopped: value.stopped, ...metrics, ...(value.message === undefined ? {} : { message: value.message as string | null }) };
}

export function parseCaptureTargets(raw: string): CaptureTarget[] {
  if (typeof raw !== 'string' || raw.length > MAX_TARGET_RESPONSE_CHARS) throw new Error('Native capture target response is too large.');
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Native capture returned invalid target JSON.');
  }
  if (!isRecord(value) || !hasExactKeys(value, ['targets']) || !Array.isArray(value.targets) || value.targets.length > 512) {
    throw new Error('Native capture returned an invalid target list.');
  }
  const seen = new Set<string>();
  return value.targets.map(target => {
    if (!isRecord(target) || !hasExactKeys(target, TARGET_KEYS)) throw new Error('Native capture returned an invalid target.');
    const { hwndHex, title, processId, processName } = target;
    if (typeof hwndHex !== 'string' || !/^0x[\da-f]{1,16}$/i.test(hwndHex)) throw new Error('Native capture returned an invalid window handle.');
    if (typeof title !== 'string' || title.length > 1024) throw new Error('Native capture returned an invalid window title.');
    if (!isNonnegativeInteger(processId) || processId < 1) throw new Error('Native capture returned an invalid process id.');
    if (typeof processName !== 'string' || processName.length > 260) throw new Error('Native capture returned an invalid process name.');
    const handleKey = hwndHex.toLowerCase();
    if (seen.has(handleKey)) throw new Error('Native capture returned a duplicate window handle.');
    seen.add(handleKey);
    return { hwndHex, title, processId, processName };
  });
}

export function captureImageUrl(frame: CaptureFrame): string {
  return `data:image/jpeg;base64,${frame.jpegBase64}`;
}

export function captureActionRequest(hwndHex: string, frame: CaptureFrame, action: ComputerUseAction): string {
  if (!/^0x[\da-f]{1,16}$/i.test(hwndHex)) throw new Error('Invalid selected window handle.');
  if (!isNonnegativeInteger(frame.sequence) || frame.sequence < 1) throw new Error('Invalid action frame sequence.');
  return JSON.stringify({ hwndHex, frameSequence: frame.sequence, action });
}
import type { ComputerUseAction } from '../orchestration/computerUseReply';
