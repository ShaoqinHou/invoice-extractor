import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SplitPane } from '../SplitPane';

// Mock localStorage
const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => { storage[key] = val; },
  removeItem: (key: string) => { delete storage[key]; },
});

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
});

describe('SplitPane', () => {
  it('renders left and right children', () => {
    const { getByText } = render(
      <SplitPane left={<div>Left Content</div>} right={<div>Right Content</div>} />
    );
    expect(getByText('Left Content')).toBeTruthy();
    expect(getByText('Right Content')).toBeTruthy();
  });

  it('applies pointer-events:none to panes during drag to prevent iframe cursor steal', () => {
    const { container } = render(
      <SplitPane left={<div>Left</div>} right={<div>Right</div>} />
    );

    const divider = container.querySelector('.cursor-col-resize');
    expect(divider).toBeTruthy();

    const outer = container.firstElementChild as HTMLElement;
    const leftPane = outer.children[0] as HTMLElement;
    const rightPane = outer.children[2] as HTMLElement;

    // Before drag — no pointer-events restriction
    expect(leftPane.style.pointerEvents).not.toBe('none');
    expect(rightPane.style.pointerEvents).not.toBe('none');

    // Start dragging
    fireEvent.mouseDown(divider!);

    // During drag — both panes should block pointer events so iframes can't steal cursor
    expect(leftPane.style.pointerEvents).toBe('none');
    expect(rightPane.style.pointerEvents).toBe('none');

    // Stop dragging
    fireEvent.mouseUp(window);

    // After drag — pointer events restored
    expect(leftPane.style.pointerEvents).not.toBe('none');
  });

  it('updates ratio on mousemove during drag', () => {
    const { container } = render(
      <SplitPane left={<div>Left</div>} right={<div>Right</div>} defaultRatio={0.5} />
    );

    const divider = container.querySelector('[data-testid="split-divider"]')
      ?? container.querySelector('.cursor-col-resize');
    const outer = container.firstElementChild as HTMLElement;

    // Mock getBoundingClientRect on the container
    vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 500,
      width: 1000, height: 500, x: 0, y: 0, toJSON: () => {},
    });

    // Start drag
    fireEvent.mouseDown(divider!);

    // Move to 30% position
    fireEvent.mouseMove(window, { clientX: 300 });

    // Left pane width should update to ~30%
    const leftPane = outer.firstElementChild as HTMLElement;
    expect(leftPane.style.width).toBe('30%');

    fireEvent.mouseUp(window);
  });

  it('persists ratio to localStorage on mouseup', () => {
    const { container } = render(
      <SplitPane left={<div>Left</div>} right={<div>Right</div>} storageKey="testSplit" defaultRatio={0.5} />
    );

    const divider = container.querySelector('[data-testid="split-divider"]')
      ?? container.querySelector('.cursor-col-resize');
    const outer = container.firstElementChild as HTMLElement;

    vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 500,
      width: 1000, height: 500, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.mouseDown(divider!);
    fireEvent.mouseMove(window, { clientX: 400 });
    fireEvent.mouseUp(window);

    expect(storage['testSplit']).toBe('0.4');
  });

  it('clamps ratio between 0.2 and 0.8', () => {
    const { container } = render(
      <SplitPane left={<div>Left</div>} right={<div>Right</div>} defaultRatio={0.5} />
    );

    const divider = container.querySelector('[data-testid="split-divider"]')
      ?? container.querySelector('.cursor-col-resize');
    const outer = container.firstElementChild as HTMLElement;

    vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 500,
      width: 1000, height: 500, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.mouseDown(divider!);

    // Move to extreme left (5%) — should clamp to 20%
    fireEvent.mouseMove(window, { clientX: 50 });
    const leftPane = outer.firstElementChild as HTMLElement;
    expect(leftPane.style.width).toBe('20%');

    // Move to extreme right (95%) — should clamp to 80%
    fireEvent.mouseMove(window, { clientX: 950 });
    expect(leftPane.style.width).toBe('80%');

    fireEvent.mouseUp(window);
  });
});
