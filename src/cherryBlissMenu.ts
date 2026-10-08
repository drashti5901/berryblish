import type { MenuProduct } from './shopTypes';

const menuItems: Omit<MenuProduct, 'stallId'>[] = [];

function addCategory(category: string, rows: [string, number][], icon: string) {
  rows.forEach(([name, price]) => {
    menuItems.push({
      id: `cherry-bliss-${name
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}`,
      name,
      price,
      category,
      icon,
      isActive: true,
    });
  });
}

addCategory(
  'London Chocolate Strawberry',
  [
    ['Milk chocolate strawberry', 120],
    ['Dark chocolate strawberry', 120],
    ['White chocolate strawberry', 120],
    ['Milk and dark chocolate strawberry', 130],
    ['Dark and white chocolate strawberry', 130],
    ['White and milk chocolate strawberry', 130],
    ['Triple chocolate strawberry', 140],
    ['Nutella chocolate strawberry', 180],
  ],
  '🍓',
);

addCategory(
  'Chocolate Brownie',
  [
    ['Milk chocolate brownie', 90],
    ['Dark chocolate brownie', 90],
    ['White chocolate brownie', 90],
    ['Milk and dark chocolate brownie', 100],
    ['Dark and white chocolate brownie', 100],
    ['White and milk chocolate brownie', 100],
    ['Triple chocolate brownie', 140],
    ['Nutella chocolate brownie', 140],
  ],
  '🍫',
);

addCategory(
  'Chocolate Strawberry + Brownie',
  [
    ['Milk chocolate brownie + strawberry', 160],
    ['Dark chocolate brownie + strawberry', 160],
    ['White chocolate brownie + strawberry', 160],
    ['Milk and dark chocolate brownie + strawberry', 170],
    ['Dark and white chocolate brownie + strawberry', 170],
    ['White and milk chocolate brownie + strawberry', 170],
    ['Triple chocolate brownie + strawberry', 140],
    ['Nutella chocolate brownie + strawberry', 190],
  ],
  '🍓',
);

addCategory(
  'Cake Bowl',
  [
    ['Single chocolate bowl', 120],
    ['Single chocolate bowl with strawberry', 170],
    ['Double chocolate bowl', 130],
    ['Double chocolate bowl with strawberry', 180],
    ['Triple chocolate bowl', 140],
    ['Triple chocolate bowl with strawberry', 190],
    ['Kitkat bowl', 160],
    ['Kitkat bowl with strawberry', 210],
    ['Oreo bowl', 160],
    ['Oreo bowl with strawberry', 210],
    ['Nutella bowl', 190],
    ['Nutella bowl with strawberry', 240],
    ['Biscoff bowl', 190],
  ],
  '🥣',
);

addCategory(
  'Doracake',
  [
    ['Single chocolate doracake', 80],
    ['Single chocolate doracake with strawberry', 110],
    ['Double chocolate doracake', 90],
    ['Double chocolate doracake with strawberry', 120],
    ['Triple chocolate doracake', 100],
    ['Triple chocolate doracake with strawberry', 130],
    ['Kitkat doracake', 110],
    ['Kitkat doracake with strawberry', 140],
    ['Oreo doracake', 110],
    ['Oreo doracake with strawberry', 140],
    ['Nutella doracake', 120],
    ['Nutella doracake with strawberry', 150],
    ['Biscoff doracake', 120],
  ],
  '🍰',
);

addCategory(
  'Cheesecake',
  [
    ['Nutella cheesecake', 150],
    ['Biscoff cheesecake', 150],
  ],
  '🍰',
);

export const cherryBlissMenu: MenuProduct[] = menuItems.map(item => ({
  ...item,
  stallId: 'cherry-bliss',
}));

export const cherryBlissCategories = [
  'All',
  ...Array.from(new Set(cherryBlissMenu.map(item => item.category ?? 'Menu'))),
];
