"use client";

import { retryNowAction } from "@/app/superadmin/deliveries/actions";
import { ResultMessage, useActionForm } from "@/features/ui/form";

export function RetryButton({ deliveryId }: { deliveryId: number }) {
  const { result, pending, onSubmit } = useActionForm(retryNowAction);
  return (
    <form onSubmit={onSubmit} className="space-y-1">
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <button type="submit" disabled={pending} className="btn-secondary btn-compact h-8">
        {pending ? "Retrying…" : "Retry now"}
      </button>
      <ResultMessage result={result} />
    </form>
  );
}
