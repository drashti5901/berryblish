/**
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
}));
jest.mock('@react-native-documents/picker', () => ({
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  isErrorWithCode: jest.fn(() => false),
  keepLocalCopy: jest.fn(),
  pick: jest.fn(),
  types: { xlsx: 'xlsx', xls: 'xls' },
}));
jest.mock('react-native-fs', () => ({ readFile: jest.fn() }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      ReactForMock.createElement(View, null, children),
    SafeAreaView: View,
  };
});

function buttonContaining(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  return renderer.root.findAll(
    node =>
      typeof node.props.onPress === 'function' &&
      node.findAllByType(Text).some(child => child.props.children === label),
  )[0];
}

test('adds a menu item to the cart and creates a paid bill', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  await ReactTestRenderer.act(() =>
    buttonContaining(renderer, 'Menu')?.props.onPress(),
  );

  const addButton = renderer.root.findByProps({
    accessibilityLabel: 'Add Milk chocolate strawberry to bill',
  });
  await ReactTestRenderer.act(() => addButton.props.onPress());
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'View your order'),
  ).toBe(true);

  await ReactTestRenderer.act(() =>
    buttonContaining(renderer, 'View your order')?.props.onPress(),
  );
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => JSON.stringify(node.props.children).includes('BILL TOTAL')),
  ).toBe(true);

  await ReactTestRenderer.act(() =>
    buttonContaining(renderer, 'Create bill · ₹120')?.props.onPress(),
  );
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => JSON.stringify(node.props.children).includes('ORDER BILL')),
  ).toBe(true);
  expect(
    renderer.root
      .findAllByType(Text)
      .some(
        node =>
          JSON.stringify(node.props.children).includes('PAID') &&
          JSON.stringify(node.props.children).includes('Cash'),
      ),
  ).toBe(true);
});

test('filters the sales chart by period and a selected calendar date', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  expect(
    renderer.root.findByProps({ accessibilityLabel: 'Period: Day' }),
  ).toBeTruthy();
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Sales by 4-hour period'),
  ).toBe(true);

  await ReactTestRenderer.act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Period: Day' })
      .props.onPress(),
  );
  await ReactTestRenderer.act(() =>
    buttonContaining(renderer, 'Week')?.props.onPress(),
  );
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Sales by day'),
  ).toBe(true);

  await ReactTestRenderer.act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Choose report date' })
      .props.onPress(),
  );
  await ReactTestRenderer.act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Previous month' })
      .props.onPress(),
  );
  const firstDay = renderer.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string')
    .find(node =>
      (node.props.accessibilityLabel as string).startsWith('Select 1 '),
    );
  expect(firstDay).toBeTruthy();
  await ReactTestRenderer.act(() => firstDay?.props.onPress());
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'CHOOSE A DATE'),
  ).toBe(false);
});

test('loads sample orders on an empty development install', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'DEMO MODE · SAMPLE DATA'),
  ).toBe(true);
  expect(
    renderer.root
      .findAllByType(Text)
      .some(
        node =>
          typeof node.props.children === 'string' &&
          node.props.children.startsWith('Sample Customer'),
      ),
  ).toBe(true);

  await ReactTestRenderer.act(() =>
    buttonContaining(renderer, 'Manage')?.props.onPress(),
  );
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Remove sample data'),
  ).toBe(true);

  await ReactTestRenderer.act(() =>
    buttonContaining(renderer, 'Overview')?.props.onPress(),
  );
  await ReactTestRenderer.act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Choose report date' })
      .props.onPress(),
  );
  await ReactTestRenderer.act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Next month' })
      .props.onPress(),
  );
  const nextMonthFirstDay = renderer.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string')
    .find(node =>
      (node.props.accessibilityLabel as string).startsWith('Select 1 '),
    );
  expect(nextMonthFirstDay).toBeTruthy();
  await ReactTestRenderer.act(() => nextMonthFirstDay?.props.onPress());
  expect(
    renderer.root
      .findAll(node => typeof node.props.accessibilityLabel === 'string')
      .some(node =>
        /^.+: ₹[1-9][\d,]*(?:\.\d+)? sales$/.test(
          node.props.accessibilityLabel as string,
        ),
      ),
  ).toBe(true);
});

test('adds next-month sample orders to an existing saved demo dataset', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
    JSON.stringify({
      products: [],
      orders: [
        {
          id: 'demo-order-existing',
          stallId: 'cherry-bliss',
          customerName: 'Existing Sample',
          phone: '',
          items: [],
          createdAt: new Date().toISOString(),
          status: 'Done',
          totalAmount: 100,
          paymentStatus: 'Paid',
          notes: 'DEMO DATA — sample order',
        },
      ],
      expenses: [],
    }),
  );
  jest.mocked(AsyncStorage.setItem).mockClear();

  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  const savedState = jest
    .mocked(AsyncStorage.setItem)
    .mock.calls.map(
      ([, value]) => JSON.parse(value) as { orders: { notes?: string }[] },
    )
    .find(state =>
      state.orders.some(
        order => order.notes === 'DEMO DATA — future sample order',
      ),
    );
  expect(savedState).toBeTruthy();
});
