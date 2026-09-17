// Car body types + DoneDeal listing angle suggestions. Shared by the DoneDeal
// Description Studio and the Ad Scripts manager. Pure data — safe on client + server.

export interface CarType {
  value: string;
  label: string;
}

export const CAR_TYPES: CarType[] = [
  { value: "hatchback", label: "Hatchback" },
  { value: "saloon", label: "Saloon" },
  { value: "estate", label: "Estate" },
  { value: "suv", label: "SUV / Crossover" },
  { value: "seven_seater", label: "7-Seater / MPV" },
  { value: "coupe", label: "Coupé" },
  { value: "convertible", label: "Convertible" },
  { value: "van", label: "Van / Commercial" },
  { value: "electric", label: "Electric (EV)" },
  { value: "other", label: "Other" },
];

export function carTypeLabel(value: string | null | undefined): string {
  return CAR_TYPES.find((t) => t.value === value)?.label ?? "Any type";
}

const ANGLES: Record<string, string[]> = {
  hatchback: [
    "Economical city runabout with low running costs",
    "Easy to park, cheap to tax and insure",
    "Ideal first car or reliable second car",
  ],
  saloon: [
    "Refined, comfortable executive cruiser",
    "Great motorway car with strong economy",
    "Well-equipped and spacious for the family",
  ],
  estate: [
    "Huge boot and everyday versatility",
    "Perfect family and load-hauling wagon",
    "Comfortable long-distance workhorse",
  ],
  suv: [
    "Family space with a commanding driving position",
    "Comfort, safety and everyday practicality",
    "Great value with strong road presence",
  ],
  seven_seater: [
    "Room for the whole family — full 7 seats",
    "Flexible seating for people and cargo",
    "Excellent value people-carrier",
  ],
  coupe: [
    "Head-turning looks with a spirited drive",
    "Sporty styling, well specced",
    "A weekend car you'll love to own",
  ],
  convertible: [
    "Drop-top fun for the Irish summer",
    "Stylish, head-turning and well kept",
    "A special car at a sensible price",
  ],
  van: [
    "Ready to work — clean, reliable and practical",
    "Great payload and running costs for the trade",
    "Well maintained with a full load area",
  ],
  electric: [
    "Zero-emissions with very low running costs",
    "Smooth, instant torque and quiet drive",
    "Home-charge convenience and cheap motoring",
  ],
  other: [
    "Presented in excellent condition, full spec",
    "Honest value, ready to drive away",
    "Well maintained with service history",
  ],
};

/** Three editable listing angles tuned to the chosen car type. */
export function angleSuggestions(carType: string): string[] {
  return ANGLES[carType] ?? ANGLES.other;
}
