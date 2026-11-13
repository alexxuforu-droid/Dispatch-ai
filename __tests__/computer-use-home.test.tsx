import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

import { ComputerUseHome } from '../src/app/views/computerUse/ComputerUseHome';
import type { CaptureApi } from '../src/app/views/computerUse/ComputerUseHome';

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const value = node as { children?: unknown[] | string };
  return typeof value.children === 'string'
    ? value.children
    : Array.isArray(value.children) ? value.children.map(textOf).join(' ') : '';
}

test('keeps window actions off until opted in and explains the sampled-frame limitation', async () => {
  const captureApi: CaptureApi = {
    listTargets: jest.fn(async () => '{"targets":[]}'),
    startCapture: jest.fn(async () => '{"started":true}'),
    nextFrame: jest.fn(async () => '{"frame":null,"stopped":true,"firstFrameMs":null,"capturedFrames":0,"deliveredFrames":0,"droppedFrames":0,"fps":0}'),
    stopCapture: jest.fn(async () => '{"stopped":true}'),
    startRecording: jest.fn(async () => '{"recording":true,"path":""}'),
    stopRecording: jest.fn(async () => '{"recording":false,"path":""}'),
    performAction: jest.fn(async () => '{"status":"queued","latencyMs":1}'),
  };
  const tree = await mount(<ComputerUseHome width={1440} providerReady={false} captureApi={captureApi} />);

  const text = textOf(tree.toJSON());
  const actionSwitch = tree.root.find(node => node.props.accessibilityRole === 'switch');
  expect(text).toContain('Refresh windows');
  expect(text).toContain('Start capture');
  expect(actionSwitch.props.accessibilityState.checked).toBe(false);
  expect(captureApi.listTargets).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});
