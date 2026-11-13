import { captureActionRequest, parseCaptureRead, parseCaptureTargets } from '../src/capture/captureProtocol';
import type { CaptureFrame } from '../src/capture/captureProtocol';

const metrics = {
  firstFrameMs: 18.5,
  capturedFrames: 12,
  deliveredFrames: 4,
  droppedFrames: 8,
  fps: 11.2,
};

test('parses a timestamped JPEG frame and preserves capture metrics', () => {
  expect(parseCaptureRead(JSON.stringify({
    frame: { sequence: 7, timestampMs: 438.25, capturedAtMs: 1_799_999_999_000, width: 1280, height: 720, jpegBase64: '/9j/2Q==' },
    stopped: false,
    ...metrics,
  }))).toEqual({
    frame: { sequence: 7, timestampMs: 438.25, capturedAtMs: 1_799_999_999_000, width: 1280, height: 720, jpegBase64: '/9j/2Q==' },
    stopped: false,
    ...metrics,
  });
});

test('accepts a timeout with no new frame as distinct from a stopped session', () => {
  expect(parseCaptureRead(JSON.stringify({ frame: null, stopped: false, ...metrics }))).toEqual({
    frame: null,
    stopped: false,
    ...metrics,
  });
  expect(parseCaptureRead(JSON.stringify({ frame: null, stopped: true, ...metrics })).stopped).toBe(true);
});

test('preserves a native capture failure on a stopped read', () => {
  expect(parseCaptureRead(JSON.stringify({
    frame: null,
    stopped: true,
    ...metrics,
    message: 'The selected window was closed during capture.',
  }))).toMatchObject({
    stopped: true,
    message: 'The selected window was closed during capture.',
  });
  expect(() => parseCaptureRead(JSON.stringify({ frame: null, stopped: true, ...metrics, message: 42 }))).toThrow();
});

test('rejects malformed JSON, invalid sequence numbers, and invalid JPEG payloads', () => {
  expect(() => parseCaptureRead('{')).toThrow();
  for (const frame of [
    { sequence: 0, timestampMs: 1, capturedAtMs: 1_799_999_999_000, width: 10, height: 10, jpegBase64: '/9j/2Q==' },
    { sequence: 2, timestampMs: 1, capturedAtMs: 1_799_999_999_000, width: 10, height: 10, jpegBase64: 'not base64!' },
  ]) {
    expect(() => parseCaptureRead(JSON.stringify({ frame, stopped: false, ...metrics }))).toThrow();
  }
});

test('rejects impossible dimensions and non-finite or negative capture metrics', () => {
  const frame = { sequence: 2, timestampMs: 1, capturedAtMs: 1_799_999_999_000, width: 10, height: 10, jpegBase64: '/9j/2Q==' };
  for (const candidate of [
    { frame: { ...frame, width: 0 }, stopped: false, ...metrics },
    { frame, stopped: false, ...metrics, droppedFrames: -1 },
    { frame, stopped: false, ...metrics, fps: Number.NaN },
  ]) {
    expect(() => parseCaptureRead(JSON.stringify(candidate))).toThrow();
  }
});

test('rejects frame metrics whose delivered and dropped totals exceed captured frames', () => {
  for (const candidate of [
    { ...metrics, deliveredFrames: 5 },
    { ...metrics, capturedFrames: 11 },
    { ...metrics, capturedFrames: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    expect(() => parseCaptureRead(JSON.stringify({ frame: null, stopped: false, ...candidate }))).toThrow();
  }
});

test('parses visible target labels without normalizing the window title', () => {
  const targets = [{ hwndHex: '0x12AB', title: '  Notes — Dispatch  ', processId: 42, processName: 'notepad.exe' }];
  expect(parseCaptureTargets(JSON.stringify({ targets }))).toEqual(targets);
  expect(parseCaptureTargets('{"targets":[]}')).toEqual([]);
});

test('binds a requested action to its selected window and analyzed frame sequence', () => {
  const frame: CaptureFrame = { sequence: 17, timestampMs: 12, capturedAtMs: 1_799_999_999_000, width: 640, height: 480, jpegBase64: '/9j/2Q==' };
  const action = { type: 'click', x: 10, y: 20 } as const;
  expect(JSON.parse(captureActionRequest('0xABC', frame, action))).toEqual({ hwndHex: '0xABC', frameSequence: 17, action });
  expect(() => captureActionRequest('bad-hwnd', frame, action)).toThrow();
  expect(() => captureActionRequest('0xABC', { ...frame, sequence: Number.MAX_SAFE_INTEGER + 1 }, action)).toThrow();
});

test('rejects malformed, ambiguous, or invalid capture targets', () => {
  expect(() => parseCaptureTargets('{')).toThrow();
  for (const targets of [
    [{ hwndHex: 'window-1', title: 'Notes', processId: 42, processName: 'notepad.exe' }],
    [{ hwndHex: '0x12', title: 'Notes', processId: -1, processName: 'notepad.exe' }],
    [{ hwndHex: '0x12', title: 'Notes', processId: 42, processName: 'notepad.exe', extra: true }],
    [
      { hwndHex: '0x12', title: 'First', processId: 42, processName: 'notepad.exe' },
      { hwndHex: '0x12', title: 'Second', processId: 42, processName: 'notepad.exe' },
    ],
  ]) {
    expect(() => parseCaptureTargets(JSON.stringify({ targets }))).toThrow();
  }
});
