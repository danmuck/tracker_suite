"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AMENITIES, AMENITY_LABELS, LISTING_STATUSES, STATUS_LABELS } from "@/lib/future/validators";
import { centsToDollars, dollarsToCents, parseOptionalNumber } from "@/lib/future/format";
import type { Amenity, Listing, ListingFormData, ListingStatus } from "@/types/future/apartments";

interface ListingFormProps {
  /** Cities already in use, offered as suggestions */
  cities: string[];
  /** Label for the commute field, e.g. "Office" */
  commuteDestination?: string;
  defaultValues?: Listing;
  onSubmit: (data: ListingFormData) => Promise<void>;
  onCancel?: () => void;
}

const str = (n: number | undefined) => (n === undefined ? "" : String(n));
const NO_RATING = "none";

export function ListingForm({ cities, commuteDestination, defaultValues: d, onSubmit, onCancel }: ListingFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(d?.name ?? "");
  const [city, setCity] = useState(d?.city ?? "");
  const [rent, setRent] = useState(d ? String(centsToDollars(d.rent)) : "");
  const [url, setUrl] = useState(d?.url ?? "");
  const [status, setStatus] = useState<ListingStatus>(d?.status ?? "saved");
  const [address, setAddress] = useState(d?.address ?? "");
  const [neighborhood, setNeighborhood] = useState(d?.neighborhood ?? "");
  const [beds, setBeds] = useState(str(d?.beds));
  const [baths, setBaths] = useState(str(d?.baths));
  const [sqft, setSqft] = useState(str(d?.sqft));
  const [availableDate, setAvailableDate] = useState(d?.availableDate ?? "");
  const [leaseMonths, setLeaseMonths] = useState(str(d?.leaseMonths));
  const [rating, setRating] = useState(d?.rating ? String(d.rating) : NO_RATING);
  const [amenities, setAmenities] = useState<Amenity[]>(d?.amenities ?? []);
  const [commuteMinutes, setCommuteMinutes] = useState(str(d?.commuteMinutes));
  const [contactName, setContactName] = useState(d?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(d?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(d?.contactEmail ?? "");
  const [notes, setNotes] = useState(d?.notes ?? "");

  const toggleAmenity = (a: Amenity, on: boolean) =>
    setAmenities((prev) => (on ? [...prev, a] : prev.filter((x) => x !== a)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rentDollars = parseOptionalNumber(rent);
    if (!name.trim()) return setError("Give the listing a name");
    if (!city.trim()) return setError("Enter a city");
    if (!rentDollars || rentDollars <= 0) return setError("Enter the monthly rent");

    // A pasted link without a scheme still works
    const link = url.trim();
    const text = (s: string) => s.trim() || undefined;
    const whole = (s: string) => {
      const n = parseOptionalNumber(s);
      return n === undefined ? undefined : Math.round(n);
    };

    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        city: city.trim(),
        rent: dollarsToCents(rentDollars),
        status,
        amenities,
        url: link ? (/^https?:\/\//i.test(link) ? link : `https://${link}`) : undefined,
        address: text(address),
        neighborhood: text(neighborhood),
        beds: whole(beds),
        baths: parseOptionalNumber(baths),
        sqft: whole(sqft),
        availableDate: availableDate || undefined,
        leaseMonths: whole(leaseMonths),
        rating: rating === NO_RATING ? undefined : Number(rating),
        notes: text(notes),
        commuteMinutes: whole(commuteMinutes),
        contactName: text(contactName),
        contactPhone: text(contactPhone),
        contactEmail: text(contactEmail),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <datalist id="listing-cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-1">
        <Section title="Basics">
          <Field id="listing-name" label="Name" className="sm:col-span-2">
            <Input
              id="listing-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="12 Elm St, Unit 3"
              autoFocus
            />
          </Field>
          <Field id="listing-city" label="City">
            <Input
              id="listing-city"
              list="listing-cities"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Boston"
            />
          </Field>
          <Field id="listing-rent" label="Rent ($ / month)">
            <Input
              id="listing-rent"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              placeholder="2100"
            />
          </Field>
          <Field id="listing-url" label="Link to listing" className="sm:col-span-2">
            <Input
              id="listing-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </Field>
          <Field id="listing-status" label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as ListingStatus)}>
              <SelectTrigger id="listing-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="listing-rating" label="Rating">
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger id="listing-rating" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_RATING}>Not rated</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / 5
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Section>

        <Section title="Details">
          <Field id="listing-address" label="Address" className="sm:col-span-2">
            <Input id="listing-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field id="listing-neighborhood" label="Neighborhood">
            <Input id="listing-neighborhood" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          </Field>
          <Field id="listing-sqft" label="Size (sq ft)">
            <Input id="listing-sqft" type="number" min={0} value={sqft} onChange={(e) => setSqft(e.target.value)} />
          </Field>
          <Field id="listing-beds" label="Bedrooms (0 = studio)">
            <Input id="listing-beds" type="number" min={0} step={1} value={beds} onChange={(e) => setBeds(e.target.value)} />
          </Field>
          <Field id="listing-baths" label="Bathrooms">
            <Input id="listing-baths" type="number" min={0} step={0.5} value={baths} onChange={(e) => setBaths(e.target.value)} />
          </Field>
          <Field id="listing-available" label="Available from">
            <Input
              id="listing-available"
              type="date"
              value={availableDate}
              onChange={(e) => setAvailableDate(e.target.value)}
            />
          </Field>
          <Field id="listing-lease" label="Lease (months)">
            <Input
              id="listing-lease"
              type="number"
              min={1}
              step={1}
              value={leaseMonths}
              onChange={(e) => setLeaseMonths(e.target.value)}
              placeholder="12"
            />
          </Field>
        </Section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Amenities</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {AMENITIES.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <Checkbox checked={amenities.includes(a)} onCheckedChange={(v) => toggleAmenity(a, v === true)} />
                {AMENITY_LABELS[a]}
              </label>
            ))}
          </div>
        </section>

        <Section title="Commute and contact">
          <Field
            id="listing-commute"
            label={commuteDestination ? `Commute to ${commuteDestination} (min)` : "Commute (min)"}
          >
            <Input
              id="listing-commute"
              type="number"
              min={0}
              step={1}
              value={commuteMinutes}
              onChange={(e) => setCommuteMinutes(e.target.value)}
            />
          </Field>
          <Field id="listing-contact-name" label="Contact name">
            <Input id="listing-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field id="listing-contact-phone" label="Phone">
            <Input
              id="listing-contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </Field>
          <Field id="listing-contact-email" label="Email">
            <Input
              id="listing-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </Field>
        </Section>

        <div className="space-y-1">
          <Label htmlFor="listing-notes">Notes</Label>
          <Textarea
            id="listing-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Light, noise, anything the photos don't show…"
            rows={3}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {d ? "Save" : "Add listing"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
