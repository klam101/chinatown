// Placeholder menu so the app works on first run. Replace with the restaurant's real
// menu from the menu editor (or edit this list before the first start).
export const SAMPLE_MENU: {
  name: string;
  items: { name: string; altName?: string; priceCents: number }[];
}[] = [
  {
    name: "Appetizers",
    items: [
      { name: "Egg Roll", altName: "春卷", priceCents: 175 },
      { name: "Crab Rangoon (8)", altName: "蟹角", priceCents: 795 },
      { name: "Fried Dumplings (8)", altName: "锅贴", priceCents: 895 },
      { name: "Wonton Soup", altName: "云吞汤", priceCents: 450 },
    ],
  },
  {
    name: "Chicken",
    items: [
      { name: "General Tso's Chicken", altName: "左宗鸡", priceCents: 1395 },
      { name: "Sesame Chicken", altName: "芝麻鸡", priceCents: 1395 },
      { name: "Chicken with Broccoli", altName: "芥兰鸡", priceCents: 1295 },
      { name: "Orange Chicken", altName: "陈皮鸡", priceCents: 1395 },
    ],
  },
  {
    name: "Beef",
    items: [
      { name: "Beef with Broccoli", altName: "芥兰牛", priceCents: 1495 },
      { name: "Pepper Steak", altName: "青椒牛", priceCents: 1495 },
    ],
  },
  {
    name: "Rice & Noodles",
    items: [
      { name: "Chicken Fried Rice", altName: "鸡炒饭", priceCents: 1095 },
      { name: "Shrimp Lo Mein", altName: "虾捞面", priceCents: 1195 },
      { name: "White Rice", altName: "白饭", priceCents: 300 },
    ],
  },
];
