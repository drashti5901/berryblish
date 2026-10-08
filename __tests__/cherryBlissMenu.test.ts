import { cherryBlissCategories, cherryBlissMenu } from '../src/cherryBlissMenu';

test('loads the menu sections and prices shown on the Cherry & Bliss flyers', () => {
  expect(cherryBlissMenu).toHaveLength(52);
  expect(cherryBlissCategories).toEqual([
    'All',
    'London Chocolate Strawberry',
    'Chocolate Brownie',
    'Chocolate Strawberry + Brownie',
    'Cake Bowl',
    'Doracake',
    'Cheesecake',
  ]);

  expect(
    cherryBlissMenu.find(item => item.name === 'Milk chocolate strawberry')
      ?.price,
  ).toBe(120);
  expect(
    cherryBlissMenu.find(item => item.name === 'Single chocolate bowl')?.price,
  ).toBe(120);
  expect(
    cherryBlissMenu.find(
      item => item.name === 'Single chocolate bowl with strawberry',
    )?.price,
  ).toBe(170);
  expect(
    cherryBlissMenu.find(item => item.name === 'Nutella cheesecake')?.price,
  ).toBe(150);
  expect(cherryBlissMenu.every(item => item.stallId === 'cherry-bliss')).toBe(
    true,
  );
});
