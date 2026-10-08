import * as XLSX from '@e965/xlsx';
import { parseShopWorkbook } from '../src/excelImport';

const headers = {
  Stalls: [
    'stall_id',
    'stall_name',
    'owner_name',
    'phone_number',
    'status',
    'created_at',
  ],
  Products: [
    'product_id',
    'stall_id',
    'product_name',
    'category',
    'price',
    'cost_price',
    'stock_status',
    'status',
    'created_at',
  ],
  Orders: [
    'order_id',
    'stall_id',
    'customer_name',
    'customer_phone',
    'order_date',
    'order_status',
    'subtotal',
    'discount',
    'total_amount',
    'payment_status',
    'notes',
    'created_at',
    'completed_at',
  ],
  'Order Items': [
    'order_item_id',
    'order_id',
    'product_id',
    'stall_id',
    'quantity',
    'unit_price',
    'cost_price',
    'line_total',
    'created_at',
  ],
  Expenses: [
    'expense_id',
    'stall_id',
    'expense_date',
    'expense_category',
    'description',
    'amount',
    'created_at',
  ],
  Sales: [
    'sale_id',
    'order_id',
    'stall_id',
    'sale_date',
    'total_amount',
    'payment_method',
    'created_at',
  ],
  'Profit & Loss': [
    'profit_loss_id',
    'stall_id',
    'period_type',
    'period_start',
    'period_end',
    'total_sales',
    'total_expenses',
    'total_cost',
    'profit',
    'loss',
    'created_at',
  ],
};

function workbookBase64(overrides: Record<string, unknown[][]> = {}) {
  const rows: Record<string, unknown[][]> = {
    Stalls: [['stall-1', 'Cherry Bliss', 'Owner', '', 'active', '2026-01-01']],
    Products: [
      [
        'product-1',
        'stall-1',
        'Brownie',
        'Dessert',
        120,
        55,
        'in-stock',
        'active',
        '2026-01-01',
      ],
    ],
    Orders: [
      [
        'order-1',
        'stall-1',
        'Sam',
        '9999999999',
        '2026-10-08T10:00:00.000Z',
        'Pending',
        240,
        20,
        220,
        'paid',
        '',
        '2026-10-08T10:00:00.000Z',
        '',
      ],
    ],
    'Order Items': [
      [
        'item-1',
        'order-1',
        'product-1',
        'stall-1',
        2,
        120,
        55,
        240,
        '2026-10-08T10:00:00.000Z',
      ],
    ],
    Expenses: [
      [
        'expense-1',
        'stall-1',
        '2026-10-08T11:00:00.000Z',
        'Supplies',
        'Packaging',
        35,
        '2026-10-08',
      ],
    ],
    Sales: [
      ['sale-1', 'order-1', 'stall-1', '2026-10-08', 220, 'cash', '2026-10-08'],
    ],
    'Profit & Loss': [
      [
        'pl-1',
        'stall-1',
        'daily',
        '2026-10-08',
        '2026-10-08',
        220,
        35,
        110,
        75,
        0,
        '2026-10-08',
      ],
    ],
    ...overrides,
  };
  const workbook = XLSX.utils.book_new();
  for (const [name, columns] of Object.entries(headers)) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([columns, ...(rows[name] ?? [])]),
      name,
    );
  }
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

test('maps linked workbook rows and leaves derived report rows for recalculation', () => {
  const result = parseShopWorkbook(workbookBase64(), [
    { id: 'cherry-bliss', name: 'Cherry Bliss' },
  ]);

  expect(result.products).toEqual([
    expect.objectContaining({
      id: 'product-1',
      stallId: 'cherry-bliss',
      name: 'Brownie',
      price: 120,
      costPrice: 55,
    }),
  ]);
  expect(result.orders[0]).toEqual(
    expect.objectContaining({
      id: 'order-1',
      totalAmount: 220,
      status: 'Pending',
      items: [
        expect.objectContaining({
          productId: 'product-1',
          quantity: 2,
          unitPrice: 120,
          costPrice: 55,
        }),
      ],
    }),
  );
  expect(result.expenses[0]).toEqual(
    expect.objectContaining({
      id: 'expense-1',
      category: 'Supplies',
      amount: 35,
    }),
  );
  expect(result.ignoredSalesRows).toBe(1);
  expect(result.ignoredProfitLossRows).toBe(1);
});

test('rejects workbooks missing a required worksheet', () => {
  const base64 = workbookBase64();
  const workbook = XLSX.read(base64, { type: 'base64' });
  workbook.SheetNames = workbook.SheetNames.filter(name => name !== 'Stalls');
  delete workbook.Sheets.Stalls;

  expect(() =>
    parseShopWorkbook(XLSX.write(workbook, { type: 'base64' }), []),
  ).toThrow('The workbook is missing the "Stalls" worksheet.');
});
