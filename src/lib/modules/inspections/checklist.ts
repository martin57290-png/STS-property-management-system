/**
 * Default room-by-room checklist for move-in / move-out inspections.
 * Rooms are derived from the unit's bedroom and bathroom counts.
 */

export type ChecklistEntry = { room: string; item: string; sortOrder: number };

/** Items inspected in every room. */
const STANDARD_ITEMS: readonly string[] = [
  'Walls',
  'Ceiling',
  'Flooring',
  'Windows & Screens',
  'Doors & Locks',
  'Lights & Outlets',
];

const KITCHEN_ITEMS: readonly string[] = [
  'Cabinets & Counters',
  'Sink & Faucet',
  'Stove/Oven',
  'Refrigerator',
  'Dishwasher',
];

const BATHROOM_ITEMS: readonly string[] = ['Toilet', 'Tub/Shower', 'Sink & Vanity', 'Exhaust Fan'];

const EXTERIOR_ITEMS: readonly string[] = ['Smoke & CO Detectors', 'Water Heater', 'Heating'];

/**
 * Build the default checklist for a unit. Bathrooms round up (a 1.5-bath
 * unit gets two bathroom sections).
 */
export function buildDefaultChecklist(bedrooms: number, bathrooms: number): ChecklistEntry[] {
  const rooms: { room: string; items: readonly string[] }[] = [
    { room: 'Entry / Living Room', items: STANDARD_ITEMS },
    { room: 'Kitchen', items: [...STANDARD_ITEMS, ...KITCHEN_ITEMS] },
  ];

  const bedroomCount = Math.max(0, Math.floor(bedrooms));
  for (let i = 1; i <= bedroomCount; i += 1) {
    rooms.push({ room: `Bedroom ${i}`, items: STANDARD_ITEMS });
  }

  const bathroomCount = Math.max(0, Math.ceil(bathrooms));
  for (let i = 1; i <= bathroomCount; i += 1) {
    rooms.push({ room: `Bathroom ${i}`, items: [...STANDARD_ITEMS, ...BATHROOM_ITEMS] });
  }

  rooms.push({ room: 'Exterior / Other', items: [...STANDARD_ITEMS, ...EXTERIOR_ITEMS] });

  let sortOrder = 0;
  const entries: ChecklistEntry[] = [];
  for (const { room, items } of rooms) {
    for (const item of items) {
      entries.push({ room, item, sortOrder });
      sortOrder += 1;
    }
  }
  return entries;
}
