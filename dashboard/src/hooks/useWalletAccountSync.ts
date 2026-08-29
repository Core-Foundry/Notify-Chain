import { useEffect, useRef } from 'react';
import { useWalletStore } from '../store/walletStore';

/**
 * Calls `onAccountChange` whenever the connected wallet address changes during
 * an active session.
 *
 * The callback is skipped on the initial mount (address going from undefined to
 * its initial value) — it fires only for subsequent transitions, i.e. a real
 * wallet switch or disconnect while the page is open.
 */
export function useWalletAccountSync(onAccountChange: () => void): void {
  const address = useWalletStore((state) => state.address);

  // Track whether this is the very first render so we can skip it.
  const isFirstRender = useRef(true);
  // Hold a stable ref to the callback so the effect doesn't re-subscribe on
  // every render if the caller passes an inline function.
  const callbackRef = useRef(onAccountChange);
  callbackRef.current = onAccountChange;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    callbackRef.current();
  }, [address]);
}
