export type SectionRequestHandle = {
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => void;
};

export type SectionRequestManager = {
  start: (key: string) => SectionRequestHandle;
  abortAll: () => void;
  bindPagehide: () => void;
};

export function createSectionRequestManager(): SectionRequestManager {
  const controllers = new Map<string, AbortController>();
  let pagehideBound = false;

  const abortAll = (): void => {
    controllers.forEach(controller => controller.abort());
    controllers.clear();
  };

  return {
    start(key: string): SectionRequestHandle {
      const existingController = controllers.get(key);
      if (existingController) {
        existingController.abort();
      }

      const controller = new AbortController();
      controllers.set(key, controller);

      return {
        signal: controller.signal,
        isCurrent: () => controllers.get(key) === controller && !controller.signal.aborted,
        finish: () => {
          if (controllers.get(key) === controller) {
            controllers.delete(key);
          }
        },
      };
    },
    abortAll,
    bindPagehide(): void {
      if (pagehideBound) {
        return;
      }
      window.addEventListener('pagehide', abortAll);
      pagehideBound = true;
    },
  };
}
