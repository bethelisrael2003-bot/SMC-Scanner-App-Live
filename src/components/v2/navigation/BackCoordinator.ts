/**
 * BackCoordinator.ts — Single Coordinated Android Hardware & Browser Back Navigation Manager
 *
 * Enforces strict single-handler priority:
 * 1. Active Modal: Dismisses top modal only. View stack and tab remain 100% unchanged.
 * 2. Active Detail Page: Pops top drill-down page from view stack.
 * 3. Secondary Root Tab: Returns to Terminal home tab.
 * 4. Terminal Root Tab: Follows native Android application exit/minimize protocol.
 */

type ModalDismissCallback = () => void;

class BackCoordinator {
  private modalStack: ModalDismissCallback[] = [];
  private viewStackPopCallback: (() => boolean) | null = null;
  private tabPopCallback: (() => boolean) | null = null;
  private lastBackHandledAt = 0;

  /**
   * Register an open modal's dismiss handler.
   * Returns an unregister cleanup function.
   */
  public registerModal(dismiss: ModalDismissCallback): () => void {
    this.modalStack.push(dismiss);
    return () => {
      this.unregisterModal(dismiss);
    };
  }

  public unregisterModal(dismiss: ModalDismissCallback): void {
    const idx = this.modalStack.lastIndexOf(dismiss);
    if (idx !== -1) {
      this.modalStack.splice(idx, 1);
    }
  }

  public hasOpenModal(): boolean {
    return this.modalStack.length > 0;
  }

  public setViewStackPopHandler(fn: (() => boolean) | null): void {
    this.viewStackPopCallback = fn;
  }

  public setTabPopHandler(fn: (() => boolean) | null): void {
    this.tabPopCallback = fn;
  }

  /**
   * The ONE central Back execution handler.
   * Called by both native Android Capacitor backButton and browser popstate.
   */
  public handleBack(): boolean {
    const now = Date.now();
    // 300ms debounce prevents double-execution across native bridge and browser popstate
    if (now - this.lastBackHandledAt < 300) {
      return true;
    }
    this.lastBackHandledAt = now;

    // PRIORITY 1: Active Modal
    if (this.modalStack.length > 0) {
      const dismiss = this.modalStack[this.modalStack.length - 1];
      dismiss();
      return true; // Modal dismissed; navigation strictly halted
    }

    // PRIORITY 2: Active Detail Page (View Stack)
    if (this.viewStackPopCallback && this.viewStackPopCallback()) {
      return true; // Detail view popped; consumed
    }

    // PRIORITY 3: Secondary Root Tab -> Return to Terminal Home
    if (this.tabPopCallback && this.tabPopCallback()) {
      return true; // Navigated to Terminal home; consumed
    }

    // PRIORITY 4: Terminal Root -> Native Android Exit/Minimize
    if (
      typeof window !== "undefined" &&
      (window as any).Capacitor?.Plugins?.App?.exitApp
    ) {
      (window as any).Capacitor.Plugins.App.exitApp();
      return true;
    }

    return false;
  }
}

export const backCoordinator = new BackCoordinator();
if (typeof window !== "undefined") {
  (window as any).__apexBackCoordinator = backCoordinator;
}
