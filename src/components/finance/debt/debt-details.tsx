"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PaymentPlanPanel } from "@/components/finance/debt/payment-plan-panel";
import { LoansSection } from "@/components/finance/debt/loans-section";
import { RapSection } from "@/components/finance/debt/rap-section";
import { cn } from "@/lib/utils";
import type { Account } from "@/types/finance/account";

/** Payments for a credit card or debt account, plus sub-loans and RAP for debt. */
export function DebtDetails({ account, banks }: { account: Account; banks: Account[] }) {
  const [open, setOpen] = useState(!!account.subLoans?.length || !!account.rap?.enabled);
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Payments</p>
        <PaymentPlanPanel account={account} banks={banks} />
      </div>
      {account.type === "debt" && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-medium">
            Loans &amp; RAP
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <LoansSection account={account} />
            <RapSection account={account} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
