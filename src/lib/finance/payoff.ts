import { getDaysInMonth } from "date-fns";
import { fromDateStr } from "./dates";
import { amountOn } from "./amount-schedule";
import { monthlyInterest, rapMonthEnd } from "./interest";

const MAX_MONTHS = 600; // 50 years

export interface PayoffEstimate {
  payoffDate: string | null; // null = not paid off within 50 years
  totalInterest: number; // cents charged
  months: number; // payments made
}

/** Month-by-month payoff simulation using the same rules as projections. */
export function estimatePayoff(args: {
  balance: number;
  apr: number;
  schedule: { effectiveDate: string; amount: number }[];
  paymentDay: number;
  startDate: string;
  rap?: boolean;
}): PayoffEstimate {
  let owed = args.balance;
  let totalInterest = 0;
  let months = 0;
  if (owed <= 0) return { payoffDate: args.startDate, totalInterest: 0, months: 0 };

  let year = Number(args.startDate.slice(0, 4));
  let month = Number(args.startDate.slice(5, 7)); // 1-12

  for (let i = 0; i < MAX_MONTHS; i++) {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const lastDay = getDaysInMonth(fromDateStr(`${ym}-01`));
    const payDate = `${ym}-${String(Math.min(args.paymentDay, lastDay)).padStart(2, "0")}`;
    const monthEnd = `${ym}-${String(lastDay).padStart(2, "0")}`;

    let paid = 0;
    if (payDate >= args.startDate) {
      paid = Math.min(owed, amountOn(0, args.schedule, payDate));
      owed -= paid;
      if (paid > 0) months++;
      if (owed <= 0) return { payoffDate: payDate, totalInterest, months };
    }

    if (monthEnd > args.startDate) {
      const interest = monthlyInterest(owed, args.apr);
      if (args.rap) {
        const { charged, match } = rapMonthEnd(interest, paid);
        owed += charged - match;
        totalInterest += charged;
      } else {
        owed += interest;
        totalInterest += interest;
      }
      if (owed <= 0) return { payoffDate: monthEnd, totalInterest, months };
    }

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return { payoffDate: null, totalInterest, months };
}
