"use client";

import { useMemo, useState } from "react";

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
  usageCount: number | "";
}

interface FieldErrors {
  groupName?: string;
  usageCount?: string;
}

const GROUP_NAME_MIN = 3;
const GROUP_NAME_MAX = 64;
const USAGE_MIN = 1;
const USAGE_MAX = 10_000;

export function validateGroupName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Group name is required.";
  if (trimmed.length < GROUP_NAME_MIN) {
    return `Group name must be at least ${GROUP_NAME_MIN} characters.`;
  }
  if (trimmed.length > GROUP_NAME_MAX) {
    return `Group name must be at most ${GROUP_NAME_MAX} characters.`;
  }
  return undefined;
}

export function validateUsageCount(value: number | ""): string | undefined {
  if (value === "" || Number.isNaN(Number(value))) {
    return "Initial usages is required.";
  }
  const n = Number(value);
  if (!Number.isInteger(n)) return "Initial usages must be a whole number.";
  if (n < USAGE_MIN) return `Initial usages must be at least ${USAGE_MIN}.`;
  if (n > USAGE_MAX) return `Initial usages must be at most ${USAGE_MAX.toLocaleString()}.`;
  return undefined;
}

export function validateSubscriptionForm(form: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  const groupNameError = validateGroupName(form.groupName);
  const usageCountError = validateUsageCount(form.usageCount);
  if (groupNameError) errors.groupName = groupNameError;
  if (usageCountError) errors.usageCount = usageCountError;
  return errors;
}

export default function SubscriptionForm() {
  const [walletState, setWalletState] = useState<WalletState>("disconnected");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>({ groupName: "", usageCount: 10 });
  const [touched, setTouched] = useState<{ groupName: boolean; usageCount: boolean }>({
    groupName: false,
    usageCount: false,
  });
  const [txHash, setTxHash] = useState<string | null>(null);

  const errors = useMemo(() => validateSubscriptionForm(form), [form]);
  const showGroupNameError = touched.groupName && Boolean(errors.groupName);
  const showUsageCountError = touched.usageCount && Boolean(errors.usageCount);
  const isFormValid = Object.keys(errors).length === 0;

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
    setTouched({ groupName: true, usageCount: true });
    if (!isFormValid || walletState !== "connected" || !publicKey) return;

    setErrorMessage(null);
    setWalletState("waiting_for_signature");

    try {
      const xdrEnvelope = buildSubscriptionTx(
        { groupName: form.groupName.trim(), usageCount: Number(form.usageCount) },
        publicKey
      );

      // @ts-expect-error – freighter is injected by the browser extension
      const signed: { signedTxXdr: string } = await window.freighter.signTransaction(
        xdrEnvelope,
        { network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" }
      );

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
        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
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
              onBlur={() => setTouched((t) => ({ ...t, groupName: true }))}
              aria-invalid={showGroupNameError}
              aria-describedby={showGroupNameError ? "groupName-error" : undefined}
              className={`mt-1 block w-full border rounded px-3 py-2 text-sm ${
                showGroupNameError ? "border-red-500 ring-1 ring-red-500" : "border-gray-300"
              }`}
              placeholder="Team Alpha Plan"
            />
            {showGroupNameError && (
              <p id="groupName-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.groupName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="usageCount" className="block text-sm font-medium">
              Initial usages
            </label>
            <input
              id="usageCount"
              type="number"
              min={USAGE_MIN}
              max={USAGE_MAX}
              required
              value={form.usageCount}
              onChange={(e) => {
                const raw = e.target.value;
                setForm({
                  ...form,
                  usageCount: raw === "" ? "" : Number(raw),
                });
              }}
              onBlur={() => setTouched((t) => ({ ...t, usageCount: true }))}
              aria-invalid={showUsageCountError}
              aria-describedby={showUsageCountError ? "usageCount-error" : undefined}
              className={`mt-1 block w-full border rounded px-3 py-2 text-sm ${
                showUsageCountError ? "border-red-500 ring-1 ring-red-500" : "border-gray-300"
              }`}
            />
            {showUsageCountError && (
              <p id="usageCount-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.usageCount}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={walletState !== "connected" || !isFormValid}
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

function buildSubscriptionTx(
  _form: { groupName: string; usageCount: number },
  _creator: string
): string {
  return "AAAAAA==";
}

async function submitTransaction(_xdr: string): Promise<string> {
  return "stub-tx-hash";
}
