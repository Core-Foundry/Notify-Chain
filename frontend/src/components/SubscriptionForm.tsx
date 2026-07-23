"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Wallet UX states
// disconnected        – no wallet connected / access not yet granted
// connected           – access granted, public key available, no pending action
// waiting_for_signature – tx sent to Freighter, awaiting user approval
// error               – connection failed, user rejected, or tx error
// ---------------------------------------------------------------------------
type WalletState = "disconnected" | "connected" | "waiting_for_signature" | "error";

interface FormValues {
  groupName: string;
  usageCount: number;
}

export default function SubscriptionForm() {
  const [walletState, setWalletState] = useState<WalletState>("disconnected");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>({ groupName: "", usageCount: 10 });
  const [txHash, setTxHash] = useState<string | null>(null);

  // -- wallet helpers --------------------------------------------------------

  async function connectWallet() {
    setErrorMessage(null);
    try {
      // @ts-expect-error – freighter is injected by the browser extension
      const freighter = window.freighter;
      if (!freighter) throw new Error("Freighter extension not found. Please install it from freighter.app.");

      const isConnected: boolean = await freighter.isConnected();
      if (!isConnected) await freighter.requestAccess();

      const key: string = await freighter.getPublicKey();
      setPublicKey(key);
      setWalletState("connected");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setWalletState("error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (walletState !== "connected" || !publicKey) return;

    setErrorMessage(null);
    setWalletState("waiting_for_signature");

    try {
      // Build a minimal transaction envelope. In a real integration you would
      // call the Soroban SDK here; this stub demonstrates the UX flow.
      const xdrEnvelope = buildSubscriptionTx(form, publicKey);

      // @ts-expect-error – freighter is injected by the browser extension
      const signed: { signedTxXdr: string } = await window.freighter.signTransaction(
        xdrEnvelope,
        { network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" }
      );

      // Submit to Stellar RPC (stubbed).
      const hash = await submitTransaction(signed.signedTxXdr);
      setTxHash(hash);
      setWalletState("connected");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setWalletState("error");
    }
  }

  function retry() {
    setErrorMessage(null);
    setWalletState(publicKey ? "connected" : "disconnected");
  }

  // -- render ----------------------------------------------------------------

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Create Subscription Group</h2>

      <WalletStatusBanner
        state={walletState}
        publicKey={publicKey}
        error={errorMessage}
        onConnect={connectWallet}
        onRetry={retry}
      />

      {walletState === "connected" && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="groupName" className="block text-sm font-medium">
              Group name
            </label>
            <input
              id="groupName"
              type="text"
              required
              value={form.groupName}
              onChange={(e) => setForm({ ...form, groupName: e.target.value })}
              className="mt-1 block w-full border rounded px-3 py-2 text-sm"
              placeholder="Team Alpha Plan"
            />
          </div>

          <div>
            <label htmlFor="usageCount" className="block text-sm font-medium">
              Initial usages
            </label>
            <input
              id="usageCount"
              type="number"
              min={1}
              required
              value={form.usageCount}
              onChange={(e) => setForm({ ...form, usageCount: Number(e.target.value) })}
              className="mt-1 block w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={walletState !== "connected"}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Create group
          </button>
        </form>
      )}

      {txHash && (
        <p className="mt-4 text-sm text-green-700">
          ✓ Transaction submitted:{" "}
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {txHash.slice(0, 12)}…
          </a>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WalletStatusBanner — renders the correct message for each wallet state
// ---------------------------------------------------------------------------
interface BannerProps {
  state: WalletState;
  publicKey: string | null;
  error: string | null;
  onConnect: () => void;
  onRetry: () => void;
}

function WalletStatusBanner({ state, publicKey, error, onConnect, onRetry }: BannerProps) {
  switch (state) {
    case "disconnected":
      return (
        <div className="flex items-center justify-between rounded bg-gray-100 p-3 text-sm">
          <span>Connect your Freighter wallet to continue.</span>
          <button
            onClick={onConnect}
            className="ml-4 rounded bg-blue-600 px-3 py-1 text-white text-xs"
          >
            Connect
          </button>
        </div>
      );

    case "connected":
      return (
        <div className="rounded bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          Wallet connected: <code className="font-mono">{publicKey}</code>
        </div>
      );

    case "waiting_for_signature":
      return (
        <div className="rounded bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 flex items-center gap-2">
          <span className="animate-spin">⏳</span>
          Check Freighter — please approve the transaction.
        </div>
      );

    case "error":
      return (
        <div className="flex items-center justify-between rounded bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          <span>Wallet error: {error ?? "Unknown error"}. Please try again.</span>
          <button
            onClick={onRetry}
            className="ml-4 rounded bg-red-600 px-3 py-1 text-white text-xs"
          >
            Retry
          </button>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Stubs — replace with real Soroban SDK calls
// ---------------------------------------------------------------------------
function buildSubscriptionTx(_form: FormValues, _creator: string): string {
  // TODO: build XDR using @stellar/stellar-sdk and the AutoShare contract
  return "AAAAAA==";
}

async function submitTransaction(_xdr: string): Promise<string> {
  // TODO: submit via SorobanRpc.Server.sendTransaction()
  return "stub-tx-hash";
}
