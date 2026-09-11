import { AccessibilityInfo } from 'react-native';

import { TOAST_MS, toast, useToastStore } from '../components/ui/Toast';

const message = () => useToastStore.getState().message;

describe('toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.getState().hide();
  });
  afterEach(() => jest.useRealTimers());

  it('shows a message and hides it after the design timing', () => {
    toast('Transaction saved.');
    expect(message()).toBe('Transaction saved.');

    jest.advanceTimersByTime(TOAST_MS - 1);
    expect(message()).toBe('Transaction saved.');

    jest.advanceTimersByTime(1);
    expect(message()).toBeNull();
  });

  it('gives a newer message its full time', () => {
    toast('First');
    jest.advanceTimersByTime(TOAST_MS - 100);
    toast('Second');

    jest.advanceTimersByTime(TOAST_MS - 1);
    expect(message()).toBe('Second');

    jest.advanceTimersByTime(1);
    expect(message()).toBeNull();
  });

  it('announces the message for screen readers', () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    toast('Saved to the review queue.');
    expect(spy).toHaveBeenCalledWith('Saved to the review queue.');
    spy.mockRestore();
  });
});
