import * as XLSX from '@e965/xlsx';

export type WorkbookStall = { id: string; name: string };
export type WorkbookProduct = {
  id: string;
  stallId: string;
  name: string;
  price: number;
  costPrice: number;
  category: string;
  isActive: boolean;
};
export type WorkbookOrder = {
  id: string;
  stallId: string;
  customerName: string;
  phone: string;
  createdAt: string;
  status: 'Pending' | 'Done';
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentStatus: string;
  notes: string;
  completedAt?: string;
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    lineTotal: number;
  }[];
};
export type WorkbookExpense = {
  id: string;
  stallId: string;
  description: string;
  category: string;
  amount: number;
  createdAt: string;
};
export type WorkbookData = {
  products: WorkbookProduct[];
  orders: WorkbookOrder[];
  expenses: WorkbookExpense[];
  ignoredSalesRows: number;
  ignoredProfitLossRows: number;
};

const columns = {
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
} as const;

export function parseShopWorkbook(
  base64: string,
  stalls: WorkbookStall[],
): WorkbookData {
  const workbook = XLSX.read(base64, { type: 'base64', cellDates: true });
  const stallByExternalId = new Map<string, WorkbookStall>();
  const stallByName = new Map(
    stalls.map(stall => [normalize(stall.name), stall]),
  );

  const readSheet = (name: keyof typeof columns) => {
    const sheet = workbook.Sheets[name];
    if (!sheet)
      throw new Error(`The workbook is missing the "${name}" worksheet.`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });
    const header = rows[0]?.map(cell => text(cell).trim()) ?? [];
    if (new Set(header).size !== header.length) {
      throw new Error(`"${name}" contains duplicate column headers.`);
    }
    const missing = columns[name].filter(column => !header.includes(column));
    if (missing.length) {
      throw new Error(
        `"${name}" is missing required column${
          missing.length === 1 ? '' : 's'
        }: ${missing.join(', ')}.`,
      );
    }
    return rows.slice(1).flatMap(row => {
      const values = row as unknown[];
      if (values.every(value => text(value).trim() === '')) return [];
      return [
        Object.fromEntries(
          header.map((column, index) => [column, values[index] ?? '']),
        ) as Record<string, unknown>,
      ];
    });
  };
  const requireText = (
    row: Record<string, unknown>,
    key: string,
    sheet: string,
  ) => {
    const value = text(row[key]).trim();
    if (!value) throw new Error(`A row in "${sheet}" is missing "${key}".`);
    return value;
  };
  const requireUniqueIds = (
    rows: Record<string, unknown>[],
    key: string,
    sheet: string,
  ) => {
    const ids = new Set<string>();
    for (const row of rows) {
      const id = requireText(row, key, sheet);
      if (ids.has(id))
        throw new Error(`"${sheet}" contains duplicate ${key} "${id}".`);
      ids.add(id);
    }
  };
  const number = (row: Record<string, unknown>, key: string, sheet: string) => {
    const value = row[key];
    if (value === null || value === undefined || text(value).trim() === '') {
      throw new Error(`A row in "${sheet}" is missing "${key}".`);
    }
    const parsed =
      typeof value === 'number' ? value : Number(text(value).trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`A row in "${sheet}" has an invalid "${key}" value.`);
    }
    return parsed;
  };
  const date = (row: Record<string, unknown>, key: string, sheet: string) => {
    const value = row[key];
    let result: Date | null = null;
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      result = value;
    } else if (typeof value === 'number') {
      const parts = XLSX.SSF.parse_date_code(value);
      if (parts) {
        result = new Date(
          Date.UTC(
            parts.y,
            parts.m - 1,
            parts.d,
            parts.H,
            parts.M,
            Math.floor(parts.S),
          ),
        );
      }
    } else if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      if (Number.isFinite(parsed.getTime())) result = parsed;
    }
    if (!result)
      throw new Error(`A row in "${sheet}" has an invalid "${key}" date.`);
    return result.toISOString();
  };
  const findStall = (row: Record<string, unknown>, sheet: string) => {
    const externalId = requireText(row, 'stall_id', sheet);
    let stall = stallByExternalId.get(externalId);
    if (!stall && sheet === 'Stalls') {
      stall = stallByName.get(normalize(requireText(row, 'stall_name', sheet)));
      if (stall) stallByExternalId.set(externalId, stall);
    }
    if (!stall) {
      throw new Error(
        `"${sheet}" references unknown stall_id "${externalId}".`,
      );
    }
    return stall;
  };

  const importedStalls = readSheet('Stalls');
  requireUniqueIds(importedStalls, 'stall_id', 'Stalls');
  for (const row of importedStalls) findStall(row, 'Stalls');

  const productRows = readSheet('Products');
  requireUniqueIds(productRows, 'product_id', 'Products');
  const products = productRows.map(row => {
    const stall = findStall(row, 'Products');
    return {
      id: requireText(row, 'product_id', 'Products'),
      stallId: stall.id,
      name: requireText(row, 'product_name', 'Products'),
      category: text(row.category).trim(),
      price: number(row, 'price', 'Products'),
      costPrice: number(row, 'cost_price', 'Products'),
      isActive:
        !['inactive', 'disabled', 'archived'].includes(
          normalize(text(row.status)),
        ) &&
        !['out of stock', 'out-of-stock', 'unavailable'].includes(
          normalize(text(row.stock_status)),
        ),
    };
  });
  const productById = new Map(products.map(product => [product.id, product]));
  const itemRows = readSheet('Order Items');
  requireUniqueIds(itemRows, 'order_item_id', 'Order Items');
  const itemsByOrderId = new Map<string, WorkbookOrder['items']>();
  for (const row of itemRows) {
    const orderId = requireText(row, 'order_id', 'Order Items');
    const stall = findStall(row, 'Order Items');
    const productId = requireText(row, 'product_id', 'Order Items');
    const product = productById.get(productId);
    if (!product)
      throw new Error(
        `Order item references unknown product_id "${productId}".`,
      );
    if (product.stallId !== stall.id) {
      throw new Error(
        `Product "${productId}" and its order item belong to different stalls.`,
      );
    }
    const quantity = number(row, 'quantity', 'Order Items');
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(
        'Order item quantities must be whole numbers greater than zero.',
      );
    }
    const items = itemsByOrderId.get(orderId) ?? [];
    items.push({
      productId,
      name: product.name,
      quantity,
      unitPrice: number(row, 'unit_price', 'Order Items'),
      costPrice: number(row, 'cost_price', 'Order Items'),
      lineTotal: number(row, 'line_total', 'Order Items'),
    });
    itemsByOrderId.set(orderId, items);
  }

  const orderRows = readSheet('Orders');
  requireUniqueIds(orderRows, 'order_id', 'Orders');
  const orders = orderRows.map(row => {
    const id = requireText(row, 'order_id', 'Orders');
    const items = itemsByOrderId.get(id);
    if (!items?.length)
      throw new Error(`Order "${id}" has no matching rows in "Order Items".`);
    const status = normalize(text(row.order_status));
    return {
      id,
      stallId: findStall(row, 'Orders').id,
      customerName: text(row.customer_name).trim(),
      phone: text(row.customer_phone).trim(),
      createdAt: date(
        { value: row.order_date || row.created_at },
        'value',
        'Orders',
      ),
      status: ['done', 'complete', 'completed'].includes(status)
        ? ('Done' as const)
        : ('Pending' as const),
      subtotal: number(row, 'subtotal', 'Orders'),
      discount: number(row, 'discount', 'Orders'),
      totalAmount: number(row, 'total_amount', 'Orders'),
      paymentStatus: ['paid', 'complete', 'completed', 'success'].includes(
        normalize(text(row.payment_status)),
      )
        ? 'Paid'
        : 'Pending',
      notes: text(row.notes).trim(),
      completedAt: text(row.completed_at).trim()
        ? date({ value: row.completed_at }, 'value', 'Orders')
        : undefined,
      items,
    };
  });
  const orderIds = new Set(orders.map(order => order.id));
  for (const orderId of itemsByOrderId.keys()) {
    if (!orderIds.has(orderId)) {
      throw new Error(
        `Order Items contains rows for unknown order_id "${orderId}".`,
      );
    }
  }
  const expenseRows = readSheet('Expenses');
  requireUniqueIds(expenseRows, 'expense_id', 'Expenses');
  const expenses = expenseRows.map(row => ({
    id: requireText(row, 'expense_id', 'Expenses'),
    stallId: findStall(row, 'Expenses').id,
    description: requireText(row, 'description', 'Expenses'),
    category: text(row.expense_category).trim(),
    amount: number(row, 'amount', 'Expenses'),
    createdAt: date(
      { value: row.expense_date || row.created_at },
      'value',
      'Expenses',
    ),
  }));
  const sales = readSheet('Sales');
  const profitLoss = readSheet('Profit & Loss');

  return {
    products,
    orders,
    expenses,
    ignoredSalesRows: sales.length,
    ignoredProfitLossRows: profitLoss.length,
  };
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
