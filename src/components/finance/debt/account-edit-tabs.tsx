"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentPlanPanel } from "@/components/finance/debt/payment-plan-panel";
import { LoansSection } from "@/components/finance/debt/loans-section";
import { RapSection } from "@/components/finance/debt/rap-section";
import type { Account } from "@/types/finance/account";

/**
 * Edit-account popup body. Credit cards and debt get Payments (and, for debt,
 * Loans & RAP) tabs next to the account form; other accounts get the form alone.
 * Payment changes save immediately; the account form keeps its own Save button.
 */
export function AccountEditTabs({ account, banks, children }: { account: Account; banks: Account[]; children: ReactNode }) {
  if (account.isArchived || (account.type !== "credit_card" && account.type !== "debt")) return <>{children}</>;
  return (
    <Tabs defaultValue="account">
      <TabsList className="w-full">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        {account.type === "debt" && <TabsTrigger value="loans">Loans &amp; RAP</TabsTrigger>}
      </TabsList>
      <TabsContent value="account" className="pt-2">
        {children}
      </TabsContent>
      <TabsContent value="payments" className="pt-2">
        <PaymentPlanPanel account={account} banks={banks} />
      </TabsContent>
      {account.type === "debt" && (
        <TabsContent value="loans" className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Sub-loans</p>
            <LoansSection account={account} />
          </div>
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium">Repayment Assistance Plan</p>
            <RapSection account={account} />
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}
