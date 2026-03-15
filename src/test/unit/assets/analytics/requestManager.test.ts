/* @jest-environment jsdom */
import { createSectionRequestManager } from '../../../../main/assets/js/analytics/requestManager';

describe('analytics request manager', () => {
  test('aborts earlier requests for the same key and keeps different keys independent', () => {
    const manager = createSectionRequestManager();

    const first = manager.start('overview-task-events');
    const second = manager.start('overview-task-events');
    const other = manager.start('completed-summary');

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(other.signal.aborted).toBe(false);
    expect(other.isCurrent()).toBe(true);
  });

  test('finish only clears the matching active request', () => {
    const manager = createSectionRequestManager();

    const first = manager.start('overview-task-events');
    const second = manager.start('overview-task-events');

    first.finish();
    expect(second.isCurrent()).toBe(true);

    second.finish();
    expect(second.isCurrent()).toBe(false);
  });

  test('abortAll aborts every active request', () => {
    const manager = createSectionRequestManager();

    const first = manager.start('overview-task-events');
    const second = manager.start('completed-summary');

    manager.abortAll();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(false);
  });

  test('bindPagehide aborts active requests and only binds once', () => {
    const manager = createSectionRequestManager();
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    manager.bindPagehide();
    manager.bindPagehide();

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    expect(addEventListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));

    const handle = manager.start('overview-task-events');
    window.dispatchEvent(new Event('pagehide'));

    expect(handle.signal.aborted).toBe(true);
    addEventListenerSpy.mockRestore();
  });
});
