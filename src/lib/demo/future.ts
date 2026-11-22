// Sample Future data: invented cities, streets and contacts, nothing real.

import { addDays, format } from "date-fns";
import type { ListingFormData } from "@/types/future/apartments";

export interface FutureSampleTour {
  daysFromToday: number;
  /** HH:mm, 24-hour */
  time?: string;
  notes?: string;
}

export interface FutureSample {
  settings: { annualSalary: number; commuteDestination: string };
  listings: (ListingFormData & { tours: FutureSampleTour[] })[];
}

export function futureSample(today: Date): FutureSample {
  const available = (weeks: number) => format(addDays(today, weeks * 7), "yyyy-MM-dd");
  return {
    // $96,000/year, so the 30% rent guide is $2,400/month
    settings: { annualSalary: 9_600_000, commuteDestination: "100 Market Plaza, Brightwater" },
    listings: [
      {
        name: "Maple Court 3A",
        city: "Brightwater",
        rent: 185000,
        status: "toured",
        amenities: ["laundry", "ac"],
        url: "https://example.com/listings/maple-court-3a",
        address: "12 Maple St",
        neighborhood: "Old Mill",
        beds: 1,
        baths: 1,
        sqft: 640,
        availableDate: available(3),
        leaseMonths: 12,
        rating: 4,
        commuteMinutes: 18,
        notes: "Quiet block, good light. Ask about the parking waitlist.",
        contactName: "Sam",
        contactPhone: "555-0101",
        contactEmail: "leasing@example.com",
        tours: [{ daysFromToday: -4, time: "17:30", notes: "Unit was freshly painted." }],
      },
      {
        name: "The Alder Lofts #512",
        city: "Brightwater",
        rent: 249500,
        status: "contacted",
        amenities: ["dishwasher", "ac", "parking"],
        address: "48 Alder Ave",
        neighborhood: "Riverside",
        beds: 2,
        baths: 1,
        sqft: 910,
        availableDate: available(5),
        rating: 5,
        commuteMinutes: 12,
        contactName: "Pat",
        contactPhone: "555-0102",
        contactEmail: "alder@example.com",
        tours: [{ daysFromToday: 3, time: "10:00", notes: "Bring ID for the visitor desk." }],
      },
      {
        name: "Harbor Row Studio 2",
        city: "Lakemont",
        rent: 142500,
        status: "saved",
        amenities: ["laundry"],
        address: "7 Harbor Rd",
        neighborhood: "Harbor District",
        beds: 0,
        baths: 1,
        sqft: 410,
        availableDate: available(2),
        leaseMonths: 6,
        commuteMinutes: 35,
        tours: [],
      },
      {
        name: "Willow Bend Townhome",
        city: "Lakemont",
        rent: 320000,
        status: "applied",
        amenities: ["pets", "parking", "outdoor", "dishwasher"],
        url: "https://example.com/listings/willow-bend",
        address: "301 Willow Ln",
        neighborhood: "Willow Bend",
        beds: 3,
        baths: 2.5,
        sqft: 1480,
        availableDate: available(8),
        leaseMonths: 12,
        rating: 4,
        commuteMinutes: 40,
        notes: "Application fee paid. Decision expected within a week.",
        contactName: "Alex",
        contactPhone: "555-0103",
        tours: [{ daysFromToday: 9, notes: "Second look with a measuring tape." }],
      },
      {
        name: "Cedar Park Flats 1C",
        city: "Pinecrest",
        rent: 210000,
        status: "rejected",
        amenities: ["ac", "outdoor"],
        address: "9 Cedar Blvd",
        neighborhood: "Cedar Park",
        beds: 1,
        baths: 1,
        sqft: 720,
        availableDate: available(4),
        rating: 2,
        commuteMinutes: 55,
        notes: "Too far from the office and no laundry on site.",
        tours: [],
      },
      {
        name: "Summit View 4B",
        city: "Pinecrest",
        rent: 232000,
        status: "saved",
        amenities: ["laundry", "dishwasher", "pets"],
        address: "55 Summit Way",
        neighborhood: "Summit Hill",
        beds: 2,
        baths: 2,
        sqft: 980,
        availableDate: available(6),
        leaseMonths: 15,
        rating: 3,
        commuteMinutes: 28,
        tours: [],
      },
    ],
  };
}
