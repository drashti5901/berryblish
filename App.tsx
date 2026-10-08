import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { cherryBlissMenu } from './src/cherryBlissMenu';
import { parseShopWorkbook } from './src/excelImport';
import type { MenuProduct } from './src/shopTypes';

const STORAGE_KEY = '@berrybiz/shop-data-v1';
const COLORS = {
  background: '#FFF9F5',
  card: '#FFFFFF',
  ink: '#35252A',
  muted: '#8C7B80',
  berry: '#B72F52',
  berryLight: '#FBE9EE',
  green: '#32775B',
  greenLight: '#E8F4EC',
  border: '#F0E5E2',
  amber: '#A56925',
};

type Stall = { id: string; name: string; color: string };
type Product = MenuProduct;
type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  lineTotal?: number;
};
type Order = {
  id: string;
  stallId: string;
  customerName: string;
  phone: string;
  items: OrderItem[];
  createdAt: string;
  status: 'Pending' | 'Done';
  subtotal?: number;
  discount?: number;
  totalAmount?: number;
  paymentStatus?: string;
  paidAt?: string;
  notes?: string;
  completedAt?: string;
  paymentMethod?: 'Cash' | 'UPI QR';
};
type Expense = {
  id: string;
  stallId: string;
  description: string;
  amount: number;
  createdAt: string;
  category?: string;
};
type ShopData = {
  products: Product[];
  orders: Order[];
  expenses: Expense[];
  demoDataDismissed?: boolean;
  upiId?: string;
  upiIds?: Record<string, string>;
};
type Period = 'Day' | 'Week' | 'Month';
type Tab = 'Overview' | 'Menu' | 'Orders' | 'Insights' | 'Manage';

const stalls: Stall[] = [
  { id: 'cherry-bliss', name: 'Cherry Bliss', color: '#CE5570' },
  { id: 'bites-bowls', name: 'Bites & Bowls', color: '#CB8742' },
  { id: 'cherry-brownie', name: 'Cherry Brownie', color: '#835A55' },
  { id: 'sugary-spot', name: 'Sugary Spot', color: '#8A69B3' },
];

const initialData: ShopData = {
  products: [...cherryBlissMenu],
  orders: [],
  expenses: [],
};

const DEMO_PREFIX = 'demo-';

function createDemoData(now = new Date()): ShopData {
  const sourceProducts = [
    cherryBlissMenu[0],
    cherryBlissMenu[8],
    cherryBlissMenu[16],
  ];
  const demoProducts = stalls.flatMap(stall =>
    stall.id === 'cherry-bliss'
      ? []
      : sourceProducts.map(product => ({
          ...product,
          id: `${DEMO_PREFIX}product-${stall.id}-${product.id}`,
          stallId: stall.id,
          costPrice: Math.round(product.price * 0.35),
        })),
  );
  const orders: Order[] = [];
  const expenses: Expense[] = [];
  const expenseAmounts = [360, 520, 440, 300];

  for (let daysAgo = 27; daysAgo >= 0; daysAgo -= 1) {
    stalls.forEach((stall, stallIndex) => {
      const created = new Date(now);
      created.setDate(created.getDate() - daysAgo);
      if (daysAgo === 0) {
        created.setHours(
          Math.max(0, now.getHours() - stallIndex * 4 - 1),
          15 + stallIndex,
          0,
          0,
        );
      } else {
        created.setHours(10 + ((daysAgo + stallIndex * 3) % 10), 15, 0, 0);
      }
      const source =
        sourceProducts[(daysAgo + stallIndex) % sourceProducts.length];
      const productId =
        stall.id === 'cherry-bliss'
          ? source.id
          : `${DEMO_PREFIX}product-${stall.id}-${source.id}`;
      const quantity = 1 + ((daysAgo + stallIndex) % 3);
      const orderTotal = source.price * quantity;
      const unpaid = daysAgo === 1 && stallIndex === 0;
      orders.push({
        id: `${DEMO_PREFIX}order-${dateKey(created)}-${stall.id}`,
        stallId: stall.id,
        customerName: `Sample Customer ${stallIndex + 1}`,
        phone: '',
        items: [
          {
            productId,
            name: source.name,
            quantity,
            unitPrice: source.price,
            costPrice: Math.round(source.price * 0.35),
            lineTotal: orderTotal,
          },
        ],
        createdAt: created.toISOString(),
        status: daysAgo % 6 === 0 ? 'Pending' : 'Done',
        subtotal: orderTotal,
        discount: 0,
        totalAmount: orderTotal,
        paymentStatus: unpaid ? 'Pending' : 'Paid',
        paidAt: unpaid ? undefined : created.toISOString(),
        paymentMethod: daysAgo % 2 === 0 ? 'Cash' : 'UPI QR',
        notes: 'DEMO DATA — sample order',
      });
    });

    if (daysAgo % 7 === 0) {
      stalls.forEach((stall, stallIndex) => {
        const created = new Date(now);
        created.setDate(created.getDate() - daysAgo);
        created.setHours(9, 0, 0, 0);
        expenses.push({
          id: `${DEMO_PREFIX}expense-${dateKey(created)}-${stall.id}`,
          stallId: stall.id,
          description: 'Sample packaging and supplies',
          amount: expenseAmounts[stallIndex],
          createdAt: created.toISOString(),
          category: 'Supplies',
        });
      });
    }
  }

  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysInNextMonth = new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth() + 1,
    0,
  ).getDate();
  for (let day = 0; day < daysInNextMonth; day += 1) {
    stalls.forEach((stall, stallIndex) => {
      const created = new Date(
        nextMonth.getFullYear(),
        nextMonth.getMonth(),
        day + 1,
        11 + ((day + stallIndex * 2) % 9),
        20 + stallIndex,
      );
      const source = sourceProducts[(day + stallIndex) % sourceProducts.length];
      const productId =
        stall.id === 'cherry-bliss'
          ? source.id
          : `${DEMO_PREFIX}product-${stall.id}-${source.id}`;
      const quantity = 1 + ((day + stallIndex) % 3);
      const orderTotal = source.price * quantity;
      orders.push({
        id: `${DEMO_PREFIX}order-${dateKey(created)}-${stall.id}`,
        stallId: stall.id,
        customerName: `Future Sample ${stallIndex + 1}`,
        phone: '',
        items: [
          {
            productId,
            name: source.name,
            quantity,
            unitPrice: source.price,
            costPrice: Math.round(source.price * 0.35),
            lineTotal: orderTotal,
          },
        ],
        createdAt: created.toISOString(),
        status: 'Done',
        subtotal: orderTotal,
        discount: 0,
        totalAmount: orderTotal,
        paymentStatus: 'Paid',
        paidAt: created.toISOString(),
        paymentMethod: day % 2 === 0 ? 'Cash' : 'UPI QR',
        notes: 'DEMO DATA — future sample order',
      });
    });
  }

  return { products: demoProducts, orders, expenses };
}

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const merged = new Map(existing.map(item => [item.id, item]));
  incoming.forEach(item => merged.set(item.id, item));
  return Array.from(merged.values());
}

function productsForStall(products: Product[], stallId: string): Product[] {
  const stallProducts = products.filter(product => product.stallId === stallId);
  const stallProductNames = new Set(
    stallProducts.map(product => product.name.trim().toLocaleLowerCase()),
  );
  return [
    ...stallProducts,
    ...products.filter(
      product =>
        !product.stallId &&
        !stallProductNames.has(product.name.trim().toLocaleLowerCase()),
    ),
  ];
}

async function readSavedShopData(): Promise<ShopData> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (!saved) return initialData;
  const parsed: unknown = JSON.parse(saved);
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'products' in parsed &&
    'orders' in parsed &&
    'expenses' in parsed &&
    Array.isArray(parsed.products) &&
    Array.isArray(parsed.orders) &&
    Array.isArray(parsed.expenses)
  ) {
    const savedData = parsed as ShopData;
    return {
      ...savedData,
      products: mergeById(cherryBlissMenu, savedData.products),
    };
  }
  throw new Error('Saved shop data has an unexpected format.');
}

const currency = (amount: number) =>
  `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function dayStart(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function periodRange(period: Period, selectedDate: string) {
  const selected = dayStart(parseDateKey(selectedDate));
  let start = selected;
  let end: Date;
  if (period === 'Day') {
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (period === 'Week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else {
    start = new Date(selected.getFullYear(), selected.getMonth(), 1);
    end = new Date(selected.getFullYear(), selected.getMonth() + 1, 1);
  }
  return { start, end };
}

function isInPeriod(isoDate: string, period: Period, selectedDate: string) {
  const date = new Date(isoDate);
  const range = periodRange(period, selectedDate);
  return date >= range.start && date < range.end;
}

function App() {
  const [data, setData] = useState<ShopData>(initialData);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [activeStall, setActiveStall] = useState('all');
  const [period, setPeriod] = useState<Period>('Day');
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [orderModal, setOrderModal] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI QR'>('Cash');
  const [expenseModal, setExpenseModal] = useState(false);
  const [productModal, setProductModal] = useState<Product | 'new' | null>(
    null,
  );
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>(
    {},
  );
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productCostPrice, setProductCostPrice] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    readSavedShopData()
      .then(savedData => {
        if (mounted) {
          let loadedData = savedData;
          if (__DEV__ && !savedData.demoDataDismissed) {
            const hasDemoOrders = savedData.orders.some(order =>
              order.id.startsWith(`${DEMO_PREFIX}order-`),
            );
            const hasFutureDemoOrders = savedData.orders.some(
              order => order.notes === 'DEMO DATA — future sample order',
            );
            if (hasDemoOrders && !hasFutureDemoOrders) {
              const futureOrders = createDemoData().orders.filter(
                order => order.notes === 'DEMO DATA — future sample order',
              );
              loadedData = {
                ...savedData,
                orders: mergeById(savedData.orders, futureOrders),
              };
            } else if (
              !hasDemoOrders &&
              savedData.orders.length === 0 &&
              savedData.expenses.length === 0
            ) {
              const demoData = createDemoData();
              loadedData = {
                ...savedData,
                products: mergeById(savedData.products, demoData.products),
                orders: demoData.orders,
                expenses: demoData.expenses,
              };
            }
          }
          setData(loadedData);
          setStorageError(null);
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setStorageError(
            error instanceof Error
              ? error.message
              : 'Please restart the app and try again.',
          );
        }
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!loaded || storageError) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(
      (error: unknown) => {
        setStorageError(
          error instanceof Error
            ? error.message
            : 'Check available storage on your device.',
        );
      },
    );
  }, [data, loaded, storageError]);

  const scopeOrders = useMemo(
    () =>
      data.orders.filter(
        order => activeStall === 'all' || order.stallId === activeStall,
      ),
    [activeStall, data.orders],
  );
  const scopeExpenses = useMemo(
    () =>
      data.expenses.filter(
        expense => activeStall === 'all' || expense.stallId === activeStall,
      ),
    [activeStall, data.expenses],
  );
  const periodOrders = scopeOrders.filter(order =>
    isInPeriod(order.createdAt, period, selectedDate),
  );
  const periodExpenses = scopeExpenses.filter(expense =>
    isInPeriod(expense.createdAt, period, selectedDate),
  );
  const paidOrders = periodOrders.filter(
    order => order.paymentStatus !== 'Pending',
  );
  const orderTotal = (order: Order) =>
    order.totalAmount ??
    order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const revenue = paidOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const expenses = periodExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const costOfGoods = paidOrders.reduce(
    (sum, order) =>
      sum +
      order.items.reduce(
        (itemSum, item) => itemSum + item.quantity * (item.costPrice ?? 0),
        0,
      ),
    0,
  );
  const itemsWithoutCost = paidOrders.reduce(
    (sum, order) =>
      sum +
      order.items.reduce(
        (itemSum, item) =>
          itemSum + (item.costPrice === undefined ? item.quantity : 0),
        0,
      ),
    0,
  );
  const net = revenue - expenses - costOfGoods;
  const scopedProducts =
    activeStall === 'all'
      ? data.products
      : productsForStall(data.products, activeStall);
  const orderProducts = scopedProducts.filter(
    product => product.isActive !== false,
  );
  const currentStallName =
    activeStall === 'all'
      ? 'All stalls'
      : stalls.find(stall => stall.id === activeStall)?.name ?? 'All stalls';
  const currentUpiId =
    data.upiIds?.[activeStall] ??
    (activeStall === 'cherry-bliss' ? data.upiId : undefined);
  const cartItems = orderProducts
    .filter(product => (selectedItems[product.id] ?? 0) > 0)
    .map(product => ({
      product,
      quantity: selectedItems[product.id],
      lineTotal: (selectedItems[product.id] ?? 0) * product.price,
    }));
  const cartTotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  function openMenu() {
    if (activeStall === 'all') setActiveStall('cherry-bliss');
    setActiveTab('Menu');
  }

  function adjustCart(productId: string, change: number) {
    setSelectedItems(current => {
      const next = Math.max(0, (current[productId] ?? 0) + change);
      return { ...current, [productId]: next };
    });
  }

  function resetOrderForm() {
    setCustomerName('');
    setPhone('');
    setSelectedItems({});
  }

  function saveOrder() {
    if (!stalls.some(stall => stall.id === activeStall)) {
      Alert.alert(
        'Choose a stall',
        'Select one of the four stalls before adding an order.',
      );
      return;
    }
    if (paymentMethod === 'UPI QR' && !currentUpiId) {
      Alert.alert(
        'Add your UPI ID',
        'Set the stall UPI ID in Manage before creating a UPI QR bill.',
      );
      return;
    }
    const items = cartItems.map(({ product, quantity, lineTotal }) => ({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      costPrice: product.costPrice,
      lineTotal,
    }));
    if (!items.length) {
      Alert.alert('Add an item', 'Choose at least one product for this order.');
      return;
    }
    const unpriced = items.find(item => item.unitPrice <= 0);
    if (unpriced) {
      Alert.alert(
        'Set a product price',
        `Add a price for ${unpriced.name} in Manage first.`,
      );
      return;
    }
    const now = new Date().toISOString();
    const order: Order = {
      id: `BB-${Date.now()}`,
      stallId: activeStall,
      customerName: customerName.trim(),
      phone: phone.trim(),
      items,
      createdAt: now,
      status: 'Pending',
      subtotal: cartTotal,
      discount: 0,
      totalAmount: cartTotal,
      paymentStatus: paymentMethod === 'Cash' ? 'Paid' : 'Pending',
      paymentMethod,
    };
    setData(current => ({
      ...current,
      orders: [order, ...current.orders],
    }));
    setOrderModal(false);
    setReceiptOrder(order);
    resetOrderForm();
    setPaymentMethod('Cash');
  }

  function saveExpense() {
    if (!stalls.some(stall => stall.id === activeStall)) {
      Alert.alert('Choose a stall', 'Select a stall before adding an expense.');
      return;
    }
    const amount = Number(expenseAmount);
    if (!expenseName.trim() || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert(
        'Check expense details',
        'Enter a description and an amount greater than zero.',
      );
      return;
    }
    setData(current => ({
      ...current,
      expenses: [
        {
          id: `${Date.now()}`,
          stallId: activeStall,
          description: expenseName.trim(),
          amount,
          createdAt: new Date().toISOString(),
          category: expenseCategory.trim(),
        },
        ...current.expenses,
      ],
    }));
    setExpenseModal(false);
    setExpenseName('');
    setExpenseAmount('');
    setExpenseCategory('');
  }

  function openProduct(product: Product | 'new') {
    let selectedProduct = product;
    if (product !== 'new' && activeStall !== 'all' && !product.stallId) {
      const stallProduct: Product = {
        ...product,
        id: `${product.id}-${activeStall}`,
        stallId: activeStall,
      };
      selectedProduct = stallProduct;
      setData(current => ({
        ...current,
        products: [...current.products, stallProduct],
      }));
    }
    setProductModal(selectedProduct);
    setProductName(selectedProduct === 'new' ? '' : selectedProduct.name);
    setProductPrice(
      selectedProduct === 'new' ? '' : `${selectedProduct.price || ''}`,
    );
    setProductCostPrice(
      selectedProduct === 'new' ? '' : `${selectedProduct.costPrice || ''}`,
    );
  }

  function markPaid(orderId: string) {
    setData(current => ({
      ...current,
      orders: current.orders.map(order =>
        order.id === orderId
          ? {
              ...order,
              paymentStatus: 'Paid',
              paidAt: new Date().toISOString(),
            }
          : order,
      ),
    }));
    setReceiptOrder(current =>
      current?.id === orderId ? { ...current, paymentStatus: 'Paid' } : current,
    );
  }

  async function shareBill(order: Order) {
    const stallName =
      stalls.find(stall => stall.id === order.stallId)?.name ?? 'BerryBiz';
    const lines = order.items.map(
      item =>
        `${item.name} x ${item.quantity}  ${currency(
          item.lineTotal ?? item.quantity * item.unitPrice,
        )}`,
    );
    try {
      await Share.share({
        title: `Bill ${order.id}`,
        message: [
          stallName,
          `Bill ${order.id}`,
          `Date: ${formatDate(order.createdAt)}`,
          order.customerName ? `Customer: ${order.customerName}` : '',
          ...lines,
          `Total: ${currency(orderTotal(order))}`,
          `Payment: ${order.paymentStatus ?? 'Pending'}`,
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch (error) {
      Alert.alert(
        'Could not share bill',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }

  function saveProduct() {
    const amount = Number(productPrice);
    const cost = productCostPrice.trim() ? Number(productCostPrice) : undefined;
    if (
      !productName.trim() ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      (cost !== undefined && (!Number.isFinite(cost) || cost < 0))
    ) {
      Alert.alert(
        'Check product details',
        'Enter a product name and valid selling and cost prices.',
      );
      return;
    }
    if (productModal === 'new') {
      if (activeStall === 'all') {
        Alert.alert(
          'Choose a stall',
          'Select a stall before adding a product.',
        );
        return;
      }
      setData(current => ({
        ...current,
        products: [
          ...current.products,
          {
            id: `product-${Date.now()}`,
            name: productName.trim(),
            price: amount,
            costPrice: cost,
            stallId: activeStall,
          },
        ],
      }));
    } else if (productModal) {
      setData(current => ({
        ...current,
        products: current.products.map(product =>
          product.id === productModal.id
            ? {
                ...product,
                name: productName.trim(),
                price: amount,
                costPrice: cost,
              }
            : product,
        ),
      }));
    }
    setProductModal(null);
  }

  async function importWorkbook() {
    setImporting(true);
    try {
      const [file] = await pick({
        type: [types.xlsx, types.xls],
        mode: 'import',
      });
      if (!file.hasRequestedType) {
        throw new Error('Choose an Excel .xlsx or .xls workbook.');
      }
      const [copy] = await keepLocalCopy({
        files: [
          {
            uri: file.uri,
            fileName: file.name ?? 'berrybiz-workbook.xlsx',
            ...(file.isVirtual
              ? { convertVirtualFileToType: file.type ?? types.xlsx }
              : {}),
          },
        ],
        destination: 'cachesDirectory',
      });
      if (copy.status === 'error') throw new Error(copy.copyError);
      const path = copy.localUri.startsWith('file://')
        ? decodeURIComponent(copy.localUri.slice('file://'.length))
        : copy.localUri;
      const workbookData = parseShopWorkbook(
        await RNFS.readFile(path, 'base64'),
        stalls,
      );
      setData(current => ({
        ...current,
        products: mergeById(current.products, workbookData.products),
        orders: mergeById(current.orders, workbookData.orders),
        expenses: mergeById(current.expenses, workbookData.expenses),
      }));
      Alert.alert(
        'Excel refresh complete',
        `${workbookData.products.length} products, ${workbookData.orders.length} orders, and ${workbookData.expenses.length} expenses merged by ID. Existing app-only records were kept. Sales and Profit & Loss sheets are recalculated from orders, item costs, and expenses.`,
      );
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      )
        return;
      Alert.alert(
        'Excel refresh failed',
        error instanceof Error
          ? error.message
          : 'The workbook could not be read.',
      );
    } finally {
      setImporting(false);
    }
  }

  function addDemoData() {
    if (
      data.orders.some(order => order.id.startsWith(`${DEMO_PREFIX}order-`))
    ) {
      Alert.alert(
        'Sample data already loaded',
        'Remove the existing sample data before adding it again.',
      );
      return;
    }
    const demoData = createDemoData();
    setData(current => ({
      ...current,
      demoDataDismissed: false,
      products: mergeById(current.products, demoData.products),
      orders: mergeById(current.orders, demoData.orders),
      expenses: mergeById(current.expenses, demoData.expenses),
    }));
    setPeriod('Day');
    setSelectedDate(dateKey(new Date()));
    setActiveStall('all');
    setActiveTab('Overview');
    Alert.alert(
      'Sample data added',
      `${demoData.orders.length} sample orders and ${demoData.expenses.length} sample expenses were added across all four stalls. Your existing records were kept.`,
    );
  }

  function removeDemoData() {
    Alert.alert(
      'Remove sample data?',
      'Only records labeled as demo data will be removed. Your real orders, expenses, and products will stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove sample data',
          style: 'destructive',
          onPress: () =>
            setData(current => ({
              ...current,
              demoDataDismissed: true,
              products: current.products.filter(
                product => !product.id.startsWith(`${DEMO_PREFIX}product-`),
              ),
              orders: current.orders.filter(
                order => !order.id.startsWith(`${DEMO_PREFIX}order-`),
              ),
              expenses: current.expenses.filter(
                expense => !expense.id.startsWith(`${DEMO_PREFIX}expense-`),
              ),
            })),
        },
      ],
    );
  }

  const stallScope = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scopeRow}
    >
      <ScopeChip
        label="All stalls"
        selected={activeStall === 'all'}
        onPress={() => setActiveStall('all')}
      />
      {stalls.map(stall => (
        <ScopeChip
          key={stall.id}
          label={stall.name}
          selected={activeStall === stall.id}
          color={stall.color}
          onPress={() => setActiveStall(stall.id)}
        />
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>berrybiz</Text>
            <Text style={styles.headerSub}>STRAWBERRY SHOP MANAGER</Text>
          </View>
          <View style={styles.ownerBadge}>
            <Text style={styles.ownerBadgeText}>OWNER</Text>
          </View>
        </View>
        {stallScope}
        {!loaded ? (
          <View style={styles.loading}>
            <Text style={styles.muted}>Loading your local shop data…</Text>
          </View>
        ) : storageError ? (
          <View style={styles.contentInner}>
            <EmptyState
              title="Your saved shop data could not be opened"
              body={`${storageError} The app will not overwrite the saved data. Retry after checking device storage.`}
            />
            <PrimaryButton
              label="Retry loading saved data"
              onPress={() => {
                setLoaded(false);
                setStorageError(null);
                setLoadAttempt(attempt => attempt + 1);
              }}
            />
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}
          >
            {data.orders.some(order =>
              order.id.startsWith(`${DEMO_PREFIX}order-`),
            ) && (
              <View style={styles.demoModeBanner}>
                <View style={styles.demoModeCopy}>
                  <Text style={styles.demoModeTitle}>
                    DEMO MODE · SAMPLE DATA
                  </Text>
                  <Text style={styles.demoModeText}>
                    These example sales are not real business records.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={removeDemoData}
                  style={styles.demoModeRemove}
                >
                  <Text style={styles.demoModeRemoveText}>Remove</Text>
                </Pressable>
              </View>
            )}
            {activeTab === 'Overview' && (
              <Overview
                period={period}
                setPeriod={setPeriod}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                revenue={revenue}
                expenses={expenses}
                net={net}
                itemsWithoutCost={itemsWithoutCost}
                currentStallName={currentStallName}
                periodOrders={periodOrders}
                paidOrders={paidOrders}
                allOrders={scopeOrders}
                allExpenses={scopeExpenses}
                products={scopedProducts}
                stalls={stalls}
                orderTotal={orderTotal}
                onNewOrder={openMenu}
              />
            )}
            {activeTab === 'Menu' && (
              <MenuScreen
                stallName={currentStallName}
                stallId={activeStall}
                products={orderProducts}
                quantities={selectedItems}
                onAdd={productId => adjustCart(productId, 1)}
                onRemove={productId => adjustCart(productId, -1)}
              />
            )}
            {activeTab === 'Orders' && (
              <OrdersScreen
                orders={scopeOrders}
                orderTotal={orderTotal}
                onNewOrder={openMenu}
                onToggle={id =>
                  setData(current => ({
                    ...current,
                    orders: current.orders.map(order =>
                      order.id === id
                        ? {
                            ...order,
                            status:
                              order.status === 'Pending' ? 'Done' : 'Pending',
                            completedAt:
                              order.status === 'Pending'
                                ? new Date().toISOString()
                                : undefined,
                          }
                        : order,
                    ),
                  }))
                }
                onMarkPaid={markPaid}
                onShareBill={shareBill}
              />
            )}
            {activeTab === 'Insights' && (
              <Insights
                paidOrders={paidOrders}
                expenses={periodExpenses}
                products={scopedProducts}
                itemsWithoutCost={itemsWithoutCost}
                orderTotal={orderTotal}
                period={period}
                setPeriod={setPeriod}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                activeStall={activeStall}
              />
            )}
            {activeTab === 'Manage' && (
              <Manage
                products={scopedProducts}
                expenses={scopeExpenses}
                demoDataPresent={data.orders.some(order =>
                  order.id.startsWith(`${DEMO_PREFIX}order-`),
                )}
                importing={importing}
                stallName={currentStallName}
                upiId={currentUpiId ?? ''}
                onSaveUpiId={upiId =>
                  setData(current => ({
                    ...current,
                    upiIds: { ...current.upiIds, [activeStall]: upiId },
                  }))
                }
                onImport={importWorkbook}
                onAddDemoData={addDemoData}
                onRemoveDemoData={removeDemoData}
                onAddExpense={() => {
                  if (activeStall === 'all') {
                    Alert.alert(
                      'Choose a stall',
                      'Select a stall before adding an expense.',
                    );
                    return;
                  }
                  setExpenseModal(true);
                }}
                onEditProduct={product => {
                  if (product === 'new' && activeStall === 'all') {
                    Alert.alert(
                      'Choose a stall',
                      'Select a stall before adding a product.',
                    );
                    return;
                  }
                  openProduct(product);
                }}
              />
            )}
          </ScrollView>
        )}
        {activeTab === 'Menu' && cartCount > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setOrderModal(true)}
            style={styles.cartBar}
          >
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{cartCount}</Text>
            </View>
            <View style={styles.cartCopy}>
              <Text style={styles.cartTitle}>View your order</Text>
              <Text style={styles.cartSub}>Review items and create a bill</Text>
            </View>
            <Text style={styles.cartAmount}>{currency(cartTotal)} ›</Text>
          </Pressable>
        )}
        <View style={styles.tabBar}>
          {(['Overview', 'Menu', 'Orders', 'Insights', 'Manage'] as Tab[]).map(
            tab => (
              <Pressable
                accessibilityRole="button"
                key={tab}
                onPress={() =>
                  tab === 'Menu' ? openMenu() : setActiveTab(tab)
                }
                style={styles.tab}
              >
                <Text
                  style={[
                    styles.tabIcon,
                    activeTab === tab && styles.activeTabText,
                  ]}
                >
                  {tab === 'Overview'
                    ? '⌂'
                    : tab === 'Menu'
                    ? '🍓'
                    : tab === 'Orders'
                    ? '▤'
                    : tab === 'Insights'
                    ? '▥'
                    : '⚙'}
                </Text>
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === tab && styles.activeTabText,
                  ]}
                >
                  {tab}
                </Text>
              </Pressable>
            ),
          )}
        </View>
      </SafeAreaView>
      <Modal
        visible={orderModal}
        animationType="slide"
        transparent
        onRequestClose={() => setOrderModal(false)}
      >
        <ModalSheet
          title="Checkout & bill"
          onClose={() => setOrderModal(false)}
        >
          <Text style={styles.modalHint}>
            {currentStallName} · {cartCount} items
          </Text>
          {cartItems.map(({ product, quantity, lineTotal }) => (
            <View key={product.id} style={styles.checkoutItem}>
              <View style={styles.insightProductCopy}>
                <Text style={styles.rowTitle}>{product.name}</Text>
                <Text style={styles.mutedSmall}>{currency(lineTotal)}</Text>
              </View>
              <QuantityControl
                value={quantity}
                onChange={value =>
                  setSelectedItems(current => ({
                    ...current,
                    [product.id]: value,
                  }))
                }
              />
            </View>
          ))}
          <Field
            label="Customer name (optional)"
            value={customerName}
            onChangeText={setCustomerName}
          />
          <Field
            label="Phone number (optional)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <View style={styles.modalTotal}>
            <Text style={styles.modalTotalLabel}>BILL TOTAL</Text>
            <Text style={styles.modalTotalValue}>{currency(cartTotal)}</Text>
          </View>
          <Text style={styles.fieldLabel}>PAYMENT</Text>
          <View style={styles.paymentChoiceRow}>
            {(['Cash', 'UPI QR'] as const).map(method => (
              <Pressable
                key={method}
                onPress={() => setPaymentMethod(method)}
                style={[
                  styles.paymentChoice,
                  paymentMethod === method && styles.paymentChoiceSelected,
                ]}
              >
                <Text
                  style={[
                    styles.paymentChoiceText,
                    paymentMethod === method &&
                      styles.paymentChoiceTextSelected,
                  ]}
                >
                  {method === 'Cash' ? '💵  Cash received' : '▦  UPI QR'}
                </Text>
              </Pressable>
            ))}
          </View>
          {paymentMethod === 'UPI QR' && currentUpiId ? (
            <View style={styles.checkoutQr}>
              <QRCode
                value={`upi://pay?pa=${encodeURIComponent(
                  currentUpiId,
                )}&pn=${encodeURIComponent(
                  currentStallName,
                )}&am=${cartTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
                  `BerryBiz ${Date.now()}`,
                )}`}
                size={170}
              />
              <Text style={styles.qrInstruction}>
                Customer scans with their UPI app
              </Text>
              <Text style={styles.qrUpiId}>{currentUpiId}</Text>
              <Text style={styles.qrWarning}>
                Confirm the payment in your UPI app. Scanning alone does not
                confirm payment.
              </Text>
            </View>
          ) : paymentMethod === 'UPI QR' ? (
            <Text style={styles.upiMissing}>
              Add the stall UPI ID in Manage to show a payment QR.
            </Text>
          ) : (
            <Text style={styles.paymentNote}>
              Cash bills are marked paid when you create them.
            </Text>
          )}
          <PrimaryButton
            label={`Create bill · ${currency(cartTotal)}`}
            onPress={saveOrder}
            disabled={
              cartCount === 0 || (paymentMethod === 'UPI QR' && !currentUpiId)
            }
          />
        </ModalSheet>
      </Modal>
      <Modal
        visible={receiptOrder !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setReceiptOrder(null)}
      >
        {receiptOrder && (
          <BillSheet
            order={receiptOrder}
            stallName={
              stalls.find(stall => stall.id === receiptOrder.stallId)?.name ??
              'BerryBiz'
            }
            upiId={
              data.upiIds?.[receiptOrder.stallId] ??
              (receiptOrder.stallId === 'cherry-bliss' ? data.upiId : undefined)
            }
            total={orderTotal(receiptOrder)}
            onClose={() => setReceiptOrder(null)}
            onMarkPaid={() => markPaid(receiptOrder.id)}
            onShare={() => shareBill(receiptOrder)}
          />
        )}
      </Modal>
      <Modal
        visible={expenseModal}
        animationType="slide"
        transparent
        onRequestClose={() => setExpenseModal(false)}
      >
        <ModalSheet title="Add expense" onClose={() => setExpenseModal(false)}>
          <Text style={styles.modalHint}>{currentStallName}</Text>
          <Field
            label="Expense description"
            value={expenseName}
            onChangeText={setExpenseName}
          />
          <Field
            label="Amount (₹)"
            value={expenseAmount}
            onChangeText={setExpenseAmount}
            keyboardType="decimal-pad"
          />
          <Field
            label="Category (optional)"
            value={expenseCategory}
            onChangeText={setExpenseCategory}
          />
          <PrimaryButton label="Save expense" onPress={saveExpense} />
        </ModalSheet>
      </Modal>
      <Modal
        visible={productModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setProductModal(null)}
      >
        <ModalSheet
          title={productModal === 'new' ? 'Add product' : 'Edit product'}
          onClose={() => setProductModal(null)}
        >
          <Field
            label="Product name"
            value={productName}
            onChangeText={setProductName}
          />
          <Field
            label="Selling price (₹)"
            value={productPrice}
            onChangeText={setProductPrice}
            keyboardType="decimal-pad"
          />
          <Field
            label="Cost price per item (₹)"
            value={productCostPrice}
            onChangeText={setProductCostPrice}
            keyboardType="decimal-pad"
          />
          <PrimaryButton label="Save product" onPress={saveProduct} />
        </ModalSheet>
      </Modal>
    </SafeAreaProvider>
  );
}

function Overview(props: {
  period: Period;
  setPeriod: (period: Period) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  revenue: number;
  expenses: number;
  net: number;
  itemsWithoutCost: number;
  currentStallName: string;
  periodOrders: Order[];
  paidOrders: Order[];
  allOrders: Order[];
  allExpenses: Expense[];
  products: Product[];
  stalls: Stall[];
  orderTotal: (order: Order) => number;
  onNewOrder: () => void;
}) {
  const { period, setPeriod } = props;
  const productSales = props.products
    .map(product => ({
      ...product,
      quantity: props.paidOrders.reduce(
        (sum, order) =>
          sum +
          order.items.reduce(
            (itemSum, item) =>
              itemSum + (item.productId === product.id ? item.quantity : 0),
            0,
          ),
        0,
      ),
    }))
    .sort((a, b) => b.quantity - a.quantity);
  const maxProduct = Math.max(1, ...productSales.map(item => item.quantity));
  return (
    <>
      <View style={styles.welcomeRow}>
        <View>
          <Text style={styles.eyebrow}>YOUR BUSINESS AT A GLANCE</Text>
          <Text style={styles.pageTitle}>{props.currentStallName}</Text>
        </View>
        <Text style={styles.strawberry}>🍓</Text>
      </View>
      <PeriodPicker
        period={period}
        onChange={setPeriod}
        selectedDate={props.selectedDate}
        onDateChange={props.setSelectedDate}
      />
      <View style={styles.metricGrid}>
        <MetricCard label="SALES" value={currency(props.revenue)} icon="↗" />
        <MetricCard
          label="EXPENSES"
          value={currency(props.expenses)}
          icon="↘"
        />
        <MetricCard
          label={
            props.itemsWithoutCost > 0
              ? 'NET BEFORE COSTS*'
              : props.net >= 0
              ? 'NET PROFIT'
              : 'NET LOSS'
          }
          value={currency(Math.abs(props.net))}
          icon={props.net >= 0 ? '✦' : '−'}
          accent={props.net >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          label="ORDERS"
          value={`${props.periodOrders.length}`}
          icon="▤"
        />
      </View>
      <View style={styles.netBanner}>
        <View style={styles.netBannerIcon}>
          <Text style={styles.netBannerGlyph}>
            {props.net >= 0 ? '✓' : '!'}
          </Text>
        </View>
        <View style={styles.netBannerCopy}>
          <Text style={styles.netBannerTitle}>
            {props.itemsWithoutCost > 0
              ? 'Product costs still need adding'
              : props.net >= 0
              ? 'You’re in the green'
              : 'Expenses are ahead'}
          </Text>
          <Text style={styles.netBannerSub}>
            {props.itemsWithoutCost > 0
              ? `${props.itemsWithoutCost} sold items have no cost price yet`
              : `Sales less costs and expenses · ${period.toLowerCase()}`}
          </Text>
        </View>
        <Text style={styles.netBannerAmount}>{currency(props.net)}</Text>
      </View>
      <SalesBarChart
        period={period}
        selectedDate={props.selectedDate}
        orders={props.paidOrders}
        orderTotal={props.orderTotal}
      />
      <SectionHeading title="Product performance" subtitle={period} />
      <View style={styles.card}>
        {productSales.map((product, index) => (
          <View
            key={product.id}
            style={index ? styles.dividedRow : styles.performanceRow}
          >
            <View style={styles.performanceName}>
              <Text style={styles.productRank}>0{index + 1}</Text>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {product.name}
              </Text>
            </View>
            <View style={styles.barArea}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(product.quantity / maxProduct) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.unitsLabel}>{product.quantity} sold</Text>
            </View>
          </View>
        ))}
      </View>
      {props.currentStallName === 'All stalls' && (
        <>
          <SectionHeading title="Stall comparison" subtitle={period} />
          <View style={styles.card}>
            {props.stalls.map(stall => {
              const sales = props.paidOrders
                .filter(order => order.stallId === stall.id)
                .reduce((sum, order) => sum + props.orderTotal(order), 0);
              const stallMax = Math.max(
                1,
                ...props.stalls.map(item =>
                  props.paidOrders
                    .filter(order => order.stallId === item.id)
                    .reduce((sum, order) => sum + props.orderTotal(order), 0),
                ),
              );
              return (
                <View key={stall.id} style={styles.stallRow}>
                  <View style={styles.stallHeading}>
                    <View
                      style={[
                        styles.stallDot,
                        { backgroundColor: stall.color },
                      ]}
                    />
                    <Text style={styles.rowTitle}>{stall.name}</Text>
                    <Text style={styles.stallAmount}>{currency(sales)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${(sales / stallMax) * 100}%`,
                          backgroundColor: stall.color,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
      <SectionHeading
        title="Recent orders"
        subtitle={`${props.allOrders.length} total`}
      />
      {props.allOrders.length === 0 ? (
        <EmptyState
          title="Your first sale starts here"
          body="Create an order to see it appear in your dashboard."
        />
      ) : (
        <View style={styles.card}>
          {props.allOrders.slice(0, 3).map(order => (
            <OrderRow
              key={order.id}
              order={order}
              total={props.orderTotal(order)}
            />
          ))}
        </View>
      )}
      <PrimaryButton label="+  Create an order" onPress={props.onNewOrder} />
      <Text style={styles.footnote}>
        {props.allExpenses.length} expenses recorded · Saved on this device
      </Text>
      {props.itemsWithoutCost > 0 && (
        <Text style={styles.costWarning}>
          Profit is before the missing item costs. Add cost prices in Manage for
          a complete profit figure.
        </Text>
      )}
    </>
  );
}

function OrdersScreen(props: {
  orders: Order[];
  orderTotal: (order: Order) => number;
  onNewOrder: () => void;
  onToggle: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onShareBill: (order: Order) => void;
}) {
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Done'>('All');
  const orders = props.orders.filter(
    order => filter === 'All' || order.status === filter,
  );
  return (
    <>
      <Text style={styles.eyebrow}>KEEP EVERY ORDER ON TRACK</Text>
      <Text style={styles.pageTitle}>Orders</Text>
      <View style={styles.filterRow}>
        {(['All', 'Pending', 'Done'] as const).map(item => (
          <ScopeChip
            key={item}
            label={item}
            selected={filter === item}
            onPress={() => setFilter(item)}
          />
        ))}
      </View>
      {orders.length ? (
        orders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            total={props.orderTotal(order)}
            onToggle={() => props.onToggle(order.id)}
            onMarkPaid={() => props.onMarkPaid(order.id)}
            onShareBill={() => props.onShareBill(order)}
          />
        ))
      ) : (
        <EmptyState
          title={
            filter === 'All'
              ? 'No orders yet'
              : `No ${filter.toLowerCase()} orders`
          }
          body="New orders for this stall will show up here."
        />
      )}
      <PrimaryButton label="+  New order" onPress={props.onNewOrder} />
    </>
  );
}

function MenuScreen(props: {
  stallName: string;
  stallId: string;
  products: Product[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onRemove: (productId: string) => void;
}) {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const categories = [
    'All',
    ...Array.from(
      new Set(props.products.map(product => product.category ?? 'Menu')),
    ),
  ];
  const matchingProducts = props.products.filter(product => {
    const matchesCategory =
      category === 'All' || (product.category ?? 'Menu') === category;
    const matchesSearch = product.name
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (props.stallId === 'all') {
    return (
      <EmptyState
        title="Choose a stall to open its menu"
        body="Select Cherry Bliss above to add the menu from your flyer to a customer’s bill."
      />
    );
  }

  if (!props.products.length) {
    return (
      <EmptyState
        title={`The ${props.stallName} menu is empty`}
        body="Add products for this stall in Manage to start taking orders."
      />
    );
  }

  const shownCategories = category === 'All' ? categories.slice(1) : [category];

  return (
    <>
      <View style={styles.menuHero}>
        <View style={styles.menuHeroText}>
          <Text style={styles.menuEyebrow}>FRESHLY MADE • MADE WITH LOVE</Text>
          <Text style={styles.menuBrand}>Cherry & Bliss</Text>
          <Text style={styles.menuSubtitle}>
            Chocolate desserts & strawberry treats
          </Text>
        </View>
        <Text style={styles.menuHeroBerry}>🍓</Text>
      </View>
      <View style={styles.menuHeading}>
        <View>
          <Text style={styles.eyebrow}>ORDER FROM</Text>
          <Text style={styles.menuPageTitle}>{props.stallName}</Text>
        </View>
        <View style={styles.openBadge}>
          <View style={styles.openDot} />
          <Text style={styles.openBadgeText}>OPEN</Text>
        </View>
      </View>
      <TextInput
        accessibilityLabel="Search menu"
        onChangeText={setSearch}
        placeholder="Search brownies, bowls, cheesecake…"
        placeholderTextColor="#A9959A"
        style={styles.menuSearch}
        value={search}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
      >
        {categories.map(item => (
          <ScopeChip
            key={item}
            label={item}
            selected={category === item}
            onPress={() => setCategory(item)}
          />
        ))}
      </ScrollView>
      <View style={styles.menuDeliveryNote}>
        <Text style={styles.menuDeliveryIcon}>✦</Text>
        <Text style={styles.menuDeliveryText}>
          Choose your favourites — your bill updates as you add
        </Text>
      </View>
      {matchingProducts.length ? (
        shownCategories.map(group => {
          const groupItems = matchingProducts.filter(
            product => (product.category ?? 'Menu') === group,
          );
          if (!groupItems.length) return null;
          return (
            <View key={group}>
              <View style={styles.menuCategoryHeading}>
                <Text style={styles.menuCategoryTitle}>{group}</Text>
                <Text style={styles.menuCategoryCount}>
                  {groupItems.length} items
                </Text>
              </View>
              {groupItems.map(product => (
                <MenuItemCard
                  key={product.id}
                  product={product}
                  quantity={props.quantities[product.id] ?? 0}
                  onAdd={() => props.onAdd(product.id)}
                  onRemove={() => props.onRemove(product.id)}
                />
              ))}
            </View>
          );
        })
      ) : (
        <EmptyState
          title="No items found"
          body="Try another search or choose a different menu category."
        />
      )}
      <Text style={styles.menuDisclaimer}>
        Prices are in Indian rupees. Product cost prices can be entered in
        Manage for profit reports.
      </Text>
    </>
  );
}

function MenuItemCard(props: {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.menuItemCard}>
      <View style={styles.menuItemCopy}>
        <View style={styles.menuVegMark}>
          <View style={styles.menuVegDot} />
        </View>
        <Text style={styles.menuItemName}>{props.product.name}</Text>
        <Text style={styles.menuItemPrice}>
          {currency(props.product.price)}
        </Text>
        <Text style={styles.menuItemMeta}>Made fresh to order</Text>
      </View>
      <View style={styles.menuItemArt}>
        <Text style={styles.menuItemEmoji}>{props.product.icon ?? '🍰'}</Text>
        {props.quantity === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${props.product.name} to bill`}
            onPress={props.onAdd}
            style={styles.addItemButton}
          >
            <Text style={styles.addItemText}>ADD</Text>
            <Text style={styles.addItemPlus}>+</Text>
          </Pressable>
        ) : (
          <View style={styles.itemQuantity}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove one ${props.product.name}`}
              onPress={props.onRemove}
              style={styles.itemQuantityButton}
            >
              <Text style={styles.itemQuantityAction}>−</Text>
            </Pressable>
            <Text style={styles.itemQuantityValue}>{props.quantity}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add one ${props.product.name}`}
              onPress={props.onAdd}
              style={styles.itemQuantityButton}
            >
              <Text style={styles.itemQuantityAction}>+</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function Insights(props: {
  paidOrders: Order[];
  expenses: Expense[];
  products: Product[];
  itemsWithoutCost: number;
  orderTotal: (order: Order) => number;
  period: Period;
  setPeriod: (period: Period) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  activeStall: string;
}) {
  const revenue = props.paidOrders.reduce(
    (sum, order) => sum + props.orderTotal(order),
    0,
  );
  const expenseTotal = props.expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const productCosts = props.paidOrders.reduce(
    (sum, order) =>
      sum +
      order.items.reduce(
        (itemSum, item) => itemSum + item.quantity * (item.costPrice ?? 0),
        0,
      ),
    0,
  );
  const net = revenue - expenseTotal - productCosts;
  const products = props.products
    .map(product => ({
      ...product,
      quantity: props.paidOrders.reduce(
        (sum, order) =>
          sum +
          order.items.reduce(
            (itemSum, item) =>
              itemSum + (item.productId === product.id ? item.quantity : 0),
            0,
          ),
        0,
      ),
      sales: props.paidOrders.reduce(
        (sum, order) =>
          sum +
          order.items.reduce(
            (itemSum, item) =>
              itemSum +
              (item.productId === product.id ? itemSales(order, item) : 0),
            0,
          ),
        0,
      ),
      costs: props.paidOrders.reduce(
        (sum, order) =>
          sum +
          order.items.reduce(
            (itemSum, item) =>
              itemSum +
              (item.productId === product.id
                ? item.quantity * (item.costPrice ?? 0)
                : 0),
            0,
          ),
        0,
      ),
    }))
    .sort((a, b) => b.quantity - a.quantity);
  const performing = products.some(product => product.quantity > 0)
    ? products
    : [];
  return (
    <>
      <Text style={styles.eyebrow}>KNOW YOUR NUMBERS</Text>
      <Text style={styles.pageTitle}>Insights</Text>
      <PeriodPicker
        period={props.period}
        onChange={props.setPeriod}
        selectedDate={props.selectedDate}
        onDateChange={props.setSelectedDate}
      />
      <SalesBarChart
        period={props.period}
        selectedDate={props.selectedDate}
        orders={props.paidOrders}
        orderTotal={props.orderTotal}
      />
      <View style={styles.card}>
        <SummaryLine label="Total sales" value={currency(revenue)} />
        <SummaryLine label="Product costs" value={currency(productCosts)} />
        <SummaryLine label="Total expenses" value={currency(expenseTotal)} />
        <SummaryLine
          label="Total profit"
          value={currency(Math.max(net, 0))}
          strong
        />
        <SummaryLine
          label="Total loss"
          value={currency(Math.max(-net, 0))}
          strong
        />
        <Text style={styles.insightNote}>
          {props.itemsWithoutCost > 0
            ? `${props.itemsWithoutCost} sold items have no recorded cost price; profit is overstated until costs are added. `
            : 'Profit is sales less item cost prices and recorded expenses. '}
          Product profit is gross, before allocating stall expenses.
        </Text>
      </View>
      <SectionHeading title="Item-wise sales" subtitle="Ranked by units sold" />
      {performing.length ? (
        <View style={styles.card}>
          {performing.map((product, index) => (
            <View
              key={product.id}
              style={index ? styles.dividedRow : styles.performanceRow}
            >
              <View style={styles.insightProductCopy}>
                <Text style={styles.rowTitle}>{product.name}</Text>
                <Text style={styles.mutedSmall}>
                  {product.quantity} units · {currency(product.sales)} sales ·{' '}
                  {currency(product.sales - product.costs)} gross profit
                </Text>
              </View>
              <Text style={styles.rankBadge}>
                {index === 0
                  ? 'TOP'
                  : index === performing.length - 1
                  ? 'LOW'
                  : 'MID'}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          title="No product sales yet"
          body="Sales performance appears after orders are added."
        />
      )}
      <SectionHeading
        title={
          props.activeStall === 'all'
            ? 'Stall-wise profit / loss'
            : 'Stall profit / loss'
        }
        subtitle="Sales minus recorded expenses"
      />
      {stalls.map(stall => {
        const stallOrders =
          props.activeStall === 'all'
            ? props.paidOrders.filter(order => order.stallId === stall.id)
            : props.paidOrders;
        const stallExpenses =
          props.activeStall === 'all'
            ? props.expenses.filter(expense => expense.stallId === stall.id)
            : props.expenses;
        const sales = stallOrders.reduce(
          (sum, order) => sum + props.orderTotal(order),
          0,
        );
        const spent = stallExpenses.reduce(
          (sum, expense) => sum + expense.amount,
          0,
        );
        const cost = stallOrders.reduce(
          (sum, order) =>
            sum +
            order.items.reduce(
              (itemSum, item) =>
                itemSum + item.quantity * (item.costPrice ?? 0),
              0,
            ),
          0,
        );
        const profitLoss = sales - spent - cost;
        return props.activeStall !== 'all' &&
          props.activeStall !== stall.id ? null : (
          <View key={stall.id} style={styles.stallFinanceCard}>
            <View style={styles.stallHeading}>
              <View
                style={[styles.stallDot, { backgroundColor: stall.color }]}
              />
              <Text style={styles.rowTitle}>{stall.name}</Text>
              <Text
                style={[
                  styles.financeNet,
                  profitLoss >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {currency(profitLoss)}
              </Text>
            </View>
            <Text style={styles.mutedSmall}>
              Sales {currency(sales)} · Cost {currency(cost)} · Expenses{' '}
              {currency(spent)}
            </Text>
          </View>
        );
      })}
    </>
  );
}

function Manage(props: {
  products: Product[];
  expenses: Expense[];
  demoDataPresent: boolean;
  importing: boolean;
  stallName: string;
  upiId: string;
  onSaveUpiId: (upiId: string) => void;
  onImport: () => void;
  onAddDemoData: () => void;
  onRemoveDemoData: () => void;
  onAddExpense: () => void;
  onEditProduct: (product: Product | 'new') => void;
}) {
  const [upiId, setUpiId] = useState(props.upiId);
  useEffect(() => setUpiId(props.upiId), [props.upiId]);

  return (
    <>
      <Text style={styles.eyebrow}>YOUR SHOP, YOUR WAY</Text>
      <Text style={styles.pageTitle}>Manage</Text>
      <SectionHeading
        title="Products & prices"
        subtitle="Prices are used to calculate order totals"
      />
      <View style={styles.card}>
        {props.products.map((product, index) => (
          <Pressable
            accessibilityRole="button"
            key={product.id}
            onPress={() => props.onEditProduct(product)}
            style={index ? styles.dividedRow : styles.manageRow}
          >
            <View style={styles.insightProductCopy}>
              <Text style={styles.rowTitle}>{product.name}</Text>
              <Text style={styles.mutedSmall}>
                {product.price ? currency(product.price) : 'Price not set'}
                {product.costPrice === undefined ? ' · Cost not entered' : ''}
              </Text>
            </View>
            <Text style={styles.editAction}>EDIT ›</Text>
          </Pressable>
        ))}
      </View>
      <SecondaryButton
        label="+  Add product"
        onPress={() => props.onEditProduct('new')}
      />
      <PrimaryButton
        label={
          props.importing ? 'Refreshing workbook…' : '↻  Refresh from Excel'
        }
        onPress={props.onImport}
        disabled={props.importing}
      />
      <SectionHeading
        title="Try sample data"
        subtitle="For testing only · saved on this device"
      />
      <Text style={styles.demoDataHint}>
        Adds example orders and expenses for all four stalls across the last 28
        days, plus sample orders throughout next month for trying future chart
        views. Your existing records are kept.
      </Text>
      {props.demoDataPresent ? (
        <SecondaryButton
          label="Remove sample data"
          onPress={props.onRemoveDemoData}
        />
      ) : (
        <PrimaryButton
          label="＋  Add sample data"
          onPress={props.onAddDemoData}
        />
      )}
      <SectionHeading
        title="UPI bill QR"
        subtitle={
          props.stallName === 'All stalls'
            ? 'Choose one stall first'
            : props.stallName
        }
      />
      {props.stallName === 'All stalls' ? (
        <Text style={styles.upiMissing}>
          Select a stall at the top to save its own UPI ID.
        </Text>
      ) : (
        <View style={styles.upiSettingsCard}>
          <Text style={styles.upiSettingsHint}>
            Add this stall’s UPI ID. Checkout creates an amount-specific QR
            which the customer scans in their UPI app.
          </Text>
          <Field
            label="STALL UPI ID"
            value={upiId}
            onChangeText={setUpiId}
            placeholder="yourname@bank"
          />
          <PrimaryButton
            label="Save UPI ID"
            onPress={() => {
              const normalized = upiId.trim();
              if (normalized && !/^[\w.-]+@[\w.-]+$/.test(normalized)) {
                Alert.alert(
                  'Check the UPI ID',
                  'Enter a valid UPI ID, for example name@bank.',
                );
                return;
              }
              props.onSaveUpiId(normalized);
              Alert.alert(
                'UPI ID saved',
                'Customers can scan the bill QR and pay in their UPI app. Verify the payment there before marking the bill paid.',
              );
            }}
          />
        </View>
      )}
      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionTitle}>Expenses</Text>
          <Text style={styles.sectionSubtitle}>
            Latest {props.expenses.length} recorded
          </Text>
        </View>
        <Pressable onPress={props.onAddExpense} style={styles.smallAddButton}>
          <Text style={styles.smallAddText}>+ Add</Text>
        </Pressable>
      </View>
      {props.expenses.length ? (
        <View style={styles.card}>
          {props.expenses.slice(0, 10).map((expense, index) => (
            <View
              key={expense.id}
              style={index ? styles.dividedRow : styles.expenseRow}
            >
              <View style={styles.insightProductCopy}>
                <Text style={styles.rowTitle}>{expense.description}</Text>
                <Text style={styles.mutedSmall}>
                  {formatDate(expense.createdAt)}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>
                − {currency(expense.amount)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          title="No expenses recorded"
          body="Add rent, supplies, or other stall expenses."
        />
      )}
      <View style={styles.localNotice}>
        <Text style={styles.localNoticeTitle}>
          Offline-first · Excel refresh is manual
        </Text>
        <Text style={styles.localNoticeText}>
          App data stays on this device. Refresh imports the seven BerryBiz
          worksheets by ID and merges them without deleting app-only records.
          Sales and Profit & Loss are recalculated.
        </Text>
      </View>
    </>
  );
}

function ScopeChip(props: {
  label: string;
  selected: boolean;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={[
        styles.scopeChip,
        props.selected && {
          backgroundColor: props.color ?? COLORS.berry,
          borderColor: props.color ?? COLORS.berry,
        },
      ]}
    >
      <Text
        style={[styles.scopeText, props.selected && styles.scopeSelectedText]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function PeriodPicker(props: {
  period: Period;
  onChange: (period: Period) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
}) {
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    parseDateKey(props.selectedDate),
  );
  const selected = parseDateKey(props.selectedDate);
  const monthStart = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  );
  const monthDays = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const calendarCells = Array.from(
    { length: Math.ceil((monthStart.getDay() + monthDays) / 7) * 7 },
    (_, index) => index - monthStart.getDay() + 1,
  );

  return (
    <View style={styles.periodPickerWrap}>
      <Text style={styles.periodCaption}>REPORT PERIOD</Text>
      <View style={styles.periodPicker}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Period: ${props.period}`}
          onPress={() => setPeriodMenuOpen(open => !open)}
          style={styles.periodDropdown}
        >
          <Text style={styles.periodDropdownLabel}>VIEW BY</Text>
          <Text style={styles.periodDropdownValue}>
            {props.period} <Text style={styles.dropdownChevron}>⌄</Text>
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose report date"
          onPress={() => {
            setVisibleMonth(parseDateKey(props.selectedDate));
            setCalendarOpen(true);
          }}
          style={styles.dateDropdown}
        >
          <Text style={styles.periodDropdownLabel}>CHOOSE DATE</Text>
          <Text style={styles.dateDropdownValue}>
            {selected.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            <Text style={styles.dropdownChevron}>▦</Text>
          </Text>
        </Pressable>
      </View>
      {periodMenuOpen && (
        <View style={styles.periodMenu}>
          {(['Day', 'Week', 'Month'] as Period[]).map(period => (
            <Pressable
              accessibilityRole="button"
              key={period}
              onPress={() => {
                props.onChange(period);
                setPeriodMenuOpen(false);
              }}
              style={[
                styles.periodMenuOption,
                props.period === period && styles.periodMenuOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.periodMenuText,
                  props.period === period && styles.periodMenuTextSelected,
                ]}
              >
                {period}
              </Text>
              {props.period === period && (
                <Text style={styles.periodMenuCheck}>✓</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
      <Modal
        animationType="fade"
        onRequestClose={() => setCalendarOpen(false)}
        transparent
        visible={calendarOpen}
      >
        <View style={styles.calendarOverlay}>
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <View>
                <Text style={styles.calendarEyebrow}>CHOOSE A DATE</Text>
                <Text style={styles.calendarTitle}>
                  {visibleMonth.toLocaleDateString('en-IN', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                onPress={() => setCalendarOpen(false)}
                style={styles.calendarClose}
              >
                <Text style={styles.calendarCloseText}>×</Text>
              </Pressable>
            </View>
            <View style={styles.calendarNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() =>
                  setVisibleMonth(
                    new Date(
                      visibleMonth.getFullYear(),
                      visibleMonth.getMonth() - 1,
                      1,
                    ),
                  )
                }
                style={styles.calendarNavButton}
              >
                <Text style={styles.calendarNavText}>‹</Text>
              </Pressable>
              <Text style={styles.calendarMonthLabel}>
                {visibleMonth.toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                onPress={() =>
                  setVisibleMonth(
                    new Date(
                      visibleMonth.getFullYear(),
                      visibleMonth.getMonth() + 1,
                      1,
                    ),
                  )
                }
                style={styles.calendarNavButton}
              >
                <Text style={styles.calendarNavText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <Text key={day} style={styles.calendarWeekday}>
                  {day}
                </Text>
              ))}
              {calendarCells.map((day, index) => {
                const isCurrentMonth = day > 0 && day <= monthDays;
                const isSelected =
                  isCurrentMonth &&
                  dateKey(
                    new Date(
                      visibleMonth.getFullYear(),
                      visibleMonth.getMonth(),
                      day,
                    ),
                  ) === props.selectedDate;
                return isCurrentMonth ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${new Date(
                      visibleMonth.getFullYear(),
                      visibleMonth.getMonth(),
                      day,
                    ).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}`}
                    key={`day-${day}`}
                    onPress={() => {
                      props.onDateChange(
                        dateKey(
                          new Date(
                            visibleMonth.getFullYear(),
                            visibleMonth.getMonth(),
                            day,
                          ),
                        ),
                      );
                      setCalendarOpen(false);
                    }}
                    style={[
                      styles.calendarDay,
                      isSelected && styles.calendarDaySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        isSelected && styles.calendarDaySelectedText,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ) : (
                  <View key={`empty-${index}`} style={styles.calendarDay} />
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                props.onDateChange(dateKey(new Date()));
                setVisibleMonth(new Date());
                setCalendarOpen(false);
              }}
              style={styles.calendarTodayButton}
            >
              <Text style={styles.calendarTodayText}>Go to today</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type SalesBar = { label: string; sales: number };

function getSalesBars(
  period: Period,
  selectedDate: string,
  orders: Order[],
  orderTotal: (order: Order) => number,
): SalesBar[] {
  const range = periodRange(period, selectedDate);
  const bars: SalesBar[] =
    period === 'Day'
      ? ['12a', '4a', '8a', '12p', '4p', '8p'].map(label => ({
          label,
          sales: 0,
        }))
      : period === 'Week'
      ? Array.from({ length: 7 }, (_, index) => {
          const day = new Date(range.start);
          day.setDate(day.getDate() + index);
          return {
            label: day.toLocaleDateString('en-IN', { weekday: 'short' }),
            sales: 0,
          };
        })
      : Array.from({ length: 5 }, (_, index) => ({
          label: `${index * 7 + 1}–${Math.min(
            index * 7 + 7,
            new Date(
              range.start.getFullYear(),
              range.start.getMonth() + 1,
              0,
            ).getDate(),
          )}`,
          sales: 0,
        }));

  orders.forEach(order => {
    const orderDate = new Date(order.createdAt);
    let index: number;
    if (period === 'Day') {
      index = Math.floor(orderDate.getHours() / 4);
    } else if (period === 'Week') {
      index = Math.floor(
        (dayStart(orderDate).getTime() - range.start.getTime()) / 86400000,
      );
    } else {
      index = Math.floor((orderDate.getDate() - 1) / 7);
    }
    if (index >= 0 && index < bars.length) {
      bars[index].sales += orderTotal(order);
    }
  });
  return bars;
}

function SalesBarChart(props: {
  period: Period;
  selectedDate: string;
  orders: Order[];
  orderTotal: (order: Order) => number;
}) {
  const bars = getSalesBars(
    props.period,
    props.selectedDate,
    props.orders,
    props.orderTotal,
  );
  const highest = Math.max(0, ...bars.map(bar => bar.sales));
  const total = bars.reduce((sum, bar) => sum + bar.sales, 0);
  const date = parseDateKey(props.selectedDate);
  const periodLabel =
    props.period === 'Day'
      ? date.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        })
      : props.period === 'Week'
      ? `Week of ${periodRange(
          'Week',
          props.selectedDate,
        ).start.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        })}`
      : date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.salesChartCard}>
      <View style={styles.salesChartHeader}>
        <View>
          <Text style={styles.salesChartTitle}>Sales overview</Text>
          <Text style={styles.salesChartSubtitle}>{periodLabel}</Text>
        </View>
        <View style={styles.salesChartTotal}>
          <Text style={styles.salesChartTotalLabel}>TOTAL SALES</Text>
          <Text style={styles.salesChartTotalValue}>{currency(total)}</Text>
        </View>
      </View>
      <View style={styles.salesChartPlot}>
        {bars.map(bar => (
          <View
            accessibilityLabel={`${bar.label}: ${currency(bar.sales)} sales`}
            key={bar.label}
            style={styles.salesChartColumn}
          >
            <Text style={styles.salesChartBarValue}>
              {bar.sales > 0 ? currency(bar.sales) : ''}
            </Text>
            <View style={styles.salesChartBarTrack}>
              <View
                style={[
                  styles.salesChartBarFill,
                  {
                    height:
                      bar.sales > 0
                        ? `${Math.max((bar.sales / (highest || 1)) * 100, 5)}%`
                        : '0%',
                  },
                ]}
              />
            </View>
            <Text style={styles.salesChartAxisLabel}>{bar.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.salesChartFooter}>
        <View style={styles.salesChartLegendDot} />
        <Text style={styles.salesChartLegend}>
          {props.period === 'Day'
            ? 'Sales by 4-hour period'
            : props.period === 'Week'
            ? 'Sales by day'
            : 'Sales by week'}
        </Text>
      </View>
    </View>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  icon: string;
  accent?: 'green' | 'red';
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{props.label}</Text>
        <Text
          style={[
            styles.metricIcon,
            props.accent === 'green' && styles.greenText,
            props.accent === 'red' && styles.redText,
          ]}
        >
          {props.icon}
        </Text>
      </View>
      <Text style={styles.metricValue}>{props.value}</Text>
    </View>
  );
}

function SectionHeading(props: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeadingRow}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.subtitle ? (
        <Text style={styles.sectionSubtitle}>{props.subtitle}</Text>
      ) : null}
    </View>
  );
}

function OrderRow(props: { order: Order; total: number }) {
  const stall = stalls.find(item => item.id === props.order.stallId);
  return (
    <View style={styles.orderRow}>
      <View
        style={[
          styles.orderMarker,
          { backgroundColor: `${stall?.color ?? COLORS.berry}18` },
        ]}
      >
        <Text
          style={[
            styles.orderMarkerText,
            { color: stall?.color ?? COLORS.berry },
          ]}
        >
          🍓
        </Text>
      </View>
      <View style={styles.orderCopy}>
        <Text style={styles.rowTitle}>
          {props.order.customerName || `Order #${props.order.id.slice(-4)}`}
        </Text>
        <Text style={styles.mutedSmall}>
          {stall?.name} · {formatDate(props.order.createdAt)}
        </Text>
      </View>
      <View style={styles.orderAmountArea}>
        <Text style={styles.orderAmount}>{currency(props.total)}</Text>
        <StatusPill status={props.order.status} />
      </View>
    </View>
  );
}

function OrderCard(props: {
  order: Order;
  total: number;
  onToggle: () => void;
  onMarkPaid: () => void;
  onShareBill: () => void;
}) {
  return (
    <View style={styles.orderCard}>
      <OrderRow order={props.order} total={props.total} />
      <View style={styles.orderDetails}>
        <Text style={styles.orderItemsText}>
          {props.order.items
            .map(item => `${item.quantity}× ${item.name}`)
            .join('  ·  ')}
        </Text>
        {props.order.phone ? (
          <Text style={styles.mutedSmall}>{props.order.phone}</Text>
        ) : null}
        <Text
          style={[
            styles.orderPaymentStatus,
            props.order.paymentStatus === 'Paid'
              ? styles.positive
              : styles.negative,
          ]}
        >
          {props.order.paymentMethod ?? 'Payment'} ·{' '}
          {props.order.paymentStatus ?? 'Not recorded'}
        </Text>
        <View style={styles.billActionRow}>
          {props.order.paymentStatus !== 'Paid' && (
            <Pressable
              accessibilityRole="button"
              onPress={props.onMarkPaid}
              style={styles.paymentConfirmButton}
            >
              <Text style={styles.paymentConfirmText}>
                ✓ Confirm payment received
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={props.onShareBill}
            style={styles.shareBillButton}
          >
            <Text style={styles.shareBillText}>Share bill</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={props.onToggle}
          style={[
            styles.statusButton,
            props.order.status === 'Done' && styles.statusButtonDone,
          ]}
        >
          <Text
            style={[
              styles.statusButtonText,
              props.order.status === 'Done' && styles.statusButtonDoneText,
            ]}
          >
            {props.order.status === 'Pending'
              ? 'Mark as done  ✓'
              : 'Move back to pending'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatusPill(props: { status: Order['status'] }) {
  const done = props.status === 'Done';
  return (
    <View
      style={[styles.statusPill, done ? styles.donePill : styles.pendingPill]}
    >
      <Text
        style={[styles.statusText, done ? styles.doneText : styles.pendingText]}
      >
        {props.status}
      </Text>
    </View>
  );
}

function SummaryLine(props: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, props.strong && styles.summaryStrong]}>
        {props.label}
      </Text>
      <Text style={[styles.summaryValue, props.strong && styles.summaryStrong]}>
        {props.value}
      </Text>
    </View>
  );
}

function QuantityControl(props: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.quantityControl}>
      <Pressable
        onPress={() => props.onChange(Math.max(0, props.value - 1))}
        style={styles.quantityButton}
      >
        <Text style={styles.quantityButtonText}>−</Text>
      </Pressable>
      <Text style={styles.quantityValue}>{props.value}</Text>
      <Pressable
        onPress={() => props.onChange(props.value + 1)}
        style={styles.quantityButton}
      >
        <Text style={styles.quantityButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'decimal-pad';
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        keyboardType={props.keyboardType}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder ?? props.label}
        placeholderTextColor="#AA9A9E"
        style={styles.input}
        value={props.value}
      />
    </View>
  );
}

function BillSheet(props: {
  order: Order;
  stallName: string;
  upiId?: string;
  total: number;
  onClose: () => void;
  onMarkPaid: () => void;
  onShare: () => void;
}) {
  const upiValue =
    props.order.paymentMethod === 'UPI QR' && props.upiId
      ? `upi://pay?pa=${encodeURIComponent(
          props.upiId,
        )}&pn=${encodeURIComponent(props.stallName)}&am=${props.total.toFixed(
          2,
        )}&cu=INR&tn=${encodeURIComponent(props.order.id)}`
      : null;
  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.billSheet}>
        <View style={styles.billTop}>
          <Text style={styles.billBrand}>🍓 {props.stallName}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={props.onClose}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.billEyebrow}>ORDER BILL</Text>
          <Text style={styles.billNumber}>{props.order.id}</Text>
          <Text style={styles.billDate}>
            {formatDate(props.order.createdAt)}
            {props.order.customerName ? `  ·  ${props.order.customerName}` : ''}
          </Text>
          <View style={styles.billDivider} />
          {props.order.items.map(item => {
            const amount = item.lineTotal ?? item.quantity * item.unitPrice;
            return (
              <View key={item.productId} style={styles.billItemRow}>
                <Text style={styles.billItemName}>
                  {item.name} × {item.quantity}
                </Text>
                <Text style={styles.billItemAmount}>{currency(amount)}</Text>
              </View>
            );
          })}
          <View style={styles.billDivider} />
          <View style={styles.billTotalRow}>
            <Text style={styles.billTotalLabel}>AMOUNT TO PAY</Text>
            <Text style={styles.billTotalAmount}>{currency(props.total)}</Text>
          </View>
          <View style={styles.billPaymentBadge}>
            <Text style={styles.billPaymentText}>
              {props.order.paymentStatus === 'Paid'
                ? '✓  PAID'
                : '◷  PAYMENT PENDING'}
              {props.order.paymentMethod
                ? ` · ${props.order.paymentMethod}`
                : ''}
            </Text>
          </View>
          {upiValue && props.order.paymentStatus !== 'Paid' ? (
            <View style={styles.billQrCard}>
              <Text style={styles.billQrTitle}>SCAN TO PAY WITH UPI</Text>
              <QRCode value={upiValue} size={190} />
              <Text style={styles.qrUpiId}>{props.upiId}</Text>
              <Text style={styles.billQrAmount}>{currency(props.total)}</Text>
              <Text style={styles.qrWarning}>
                Ask the customer to scan with their UPI app. Check your bank or
                UPI app before confirming payment here.
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={props.onShare}
            style={styles.shareBillButton}
          >
            <Text style={styles.shareBillText}>Share bill / receipt</Text>
          </Pressable>
          {props.order.paymentStatus !== 'Paid' && (
            <PrimaryButton
              label="I checked the payment · Mark paid"
              onPress={props.onMarkPaid}
            />
          )}
          {props.order.paymentStatus === 'Paid' && (
            <PrimaryButton label="Close bill" onPress={props.onClose} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function ModalSheet(props: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.modalSheet}>
        <View style={styles.modalHeading}>
          <Text style={styles.modalTitle}>{props.title}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={props.onClose}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {props.children}
        </ScrollView>
      </View>
    </View>
  );
}

function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.primaryButton, props.disabled && styles.disabledButton]}
    >
      <Text style={styles.primaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function SecondaryButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={styles.secondaryButton}
    >
      <Text style={styles.secondaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function EmptyState(props: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyBerry}>🍓</Text>
      <Text style={styles.emptyTitle}>{props.title}</Text>
      <Text style={styles.emptyBody}>{props.body}</Text>
    </View>
  );
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function itemSales(order: Order, item: OrderItem) {
  const lineTotal = item.lineTotal ?? item.quantity * item.unitPrice;
  const subtotal =
    order.subtotal ??
    order.items.reduce(
      (sum, orderItem) =>
        sum + (orderItem.lineTotal ?? orderItem.quantity * orderItem.unitPrice),
      0,
    );
  const discountShare =
    subtotal > 0 ? ((order.discount ?? 0) * lineTotal) / subtotal : 0;
  return Math.max(0, lineTotal - discountShare);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 12,
  },
  brand: {
    color: COLORS.berry,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  headerSub: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginTop: 1,
  },
  ownerBadge: {
    backgroundColor: COLORS.berryLight,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  ownerBadgeText: {
    color: COLORS.berry,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  scopeRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 13 },
  scopeChip: {
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scopeText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  scopeSelectedText: { color: '#FFFFFF' },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 20, paddingBottom: 22 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  muted: { color: COLORS.muted, fontSize: 13 },
  welcomeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  eyebrow: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  pageTitle: {
    color: COLORS.ink,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.7,
    marginTop: 4,
  },
  strawberry: { fontSize: 32 },
  periodPickerWrap: { marginTop: 16, zIndex: 2 },
  periodCaption: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 7,
  },
  periodPicker: { flexDirection: 'row', gap: 9 },
  periodDropdown: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 0.8,
    minHeight: 55,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dateDropdown: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1.2,
    justifyContent: 'center',
    minHeight: 55,
    paddingHorizontal: 12,
  },
  periodDropdownLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  periodDropdownValue: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  dateDropdownValue: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  dropdownChevron: { color: COLORS.berry, fontSize: 13 },
  periodMenu: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 5,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 87,
    width: '42%',
    zIndex: 5,
  },
  periodMenuOption: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  periodMenuOptionSelected: { backgroundColor: COLORS.berryLight },
  periodMenuText: { color: COLORS.ink, fontSize: 12, fontWeight: '700' },
  periodMenuTextSelected: { color: COLORS.berry },
  periodMenuCheck: { color: COLORS.berry, fontSize: 13, fontWeight: '900' },
  calendarOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(40, 20, 27, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  calendarCard: {
    backgroundColor: COLORS.background,
    borderRadius: 21,
    maxWidth: 380,
    padding: 18,
    width: '100%',
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarEyebrow: {
    color: COLORS.berry,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  calendarTitle: {
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 5,
  },
  calendarClose: {
    alignItems: 'center',
    backgroundColor: COLORS.berryLight,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  calendarCloseText: { color: COLORS.berry, fontSize: 23, lineHeight: 26 },
  calendarNav: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 15,
  },
  calendarNavButton: {
    alignItems: 'center',
    backgroundColor: '#F4E9E7',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  calendarNavText: { color: COLORS.berry, fontSize: 22, lineHeight: 25 },
  calendarMonthLabel: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarWeekday: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    paddingVertical: 9,
    textAlign: 'center',
    width: '14.2857%',
  },
  calendarDay: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: '14.2857%',
  },
  calendarDaySelected: { backgroundColor: COLORS.berry, borderRadius: 21 },
  calendarDayText: { color: COLORS.ink, fontSize: 12, fontWeight: '600' },
  calendarDaySelectedText: { color: '#FFFFFF', fontWeight: '900' },
  calendarTodayButton: {
    alignItems: 'center',
    backgroundColor: COLORS.berryLight,
    borderRadius: 11,
    marginTop: 14,
    paddingVertical: 11,
  },
  calendarTodayText: { color: COLORS.berry, fontSize: 11, fontWeight: '800' },
  salesChartCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  salesChartHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  salesChartTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  salesChartSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  salesChartTotal: { alignItems: 'flex-end' },
  salesChartTotalLabel: {
    color: COLORS.muted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  salesChartTotalValue: {
    color: COLORS.berry,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 3,
  },
  salesChartPlot: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 5,
    height: 157,
    marginTop: 12,
  },
  salesChartColumn: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  salesChartBarValue: {
    color: COLORS.muted,
    fontSize: 7,
    height: 15,
    textAlign: 'center',
    width: '100%',
  },
  salesChartBarTrack: {
    alignItems: 'center',
    backgroundColor: '#F7F0EE',
    borderRadius: 6,
    height: 112,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '72%',
  },
  salesChartBarFill: {
    backgroundColor: COLORS.berry,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 0,
    width: '100%',
  },
  salesChartAxisLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '700',
    marginTop: 7,
    textAlign: 'center',
  },
  salesChartFooter: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 11,
    paddingTop: 10,
  },
  salesChartLegendDot: {
    backgroundColor: COLORS.berry,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  salesChartLegend: { color: COLORS.muted, fontSize: 9 },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  metricCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 89,
    padding: 13,
    width: '48%',
  },
  metricTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  metricIcon: { color: COLORS.berry, fontSize: 16, fontWeight: '800' },
  metricValue: {
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 10,
  },
  greenText: { color: COLORS.green },
  redText: { color: COLORS.berry },
  netBanner: {
    alignItems: 'center',
    backgroundColor: '#F3E9DD',
    borderRadius: 16,
    flexDirection: 'row',
    marginTop: 13,
    padding: 13,
  },
  netBannerIcon: {
    alignItems: 'center',
    backgroundColor: '#FFFFFFA8',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  netBannerGlyph: { color: COLORS.green, fontSize: 16, fontWeight: '900' },
  netBannerCopy: { flex: 1, marginLeft: 10 },
  netBannerTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  netBannerSub: { color: COLORS.muted, fontSize: 9, marginTop: 4 },
  netBannerAmount: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  menuHero: {
    alignItems: 'center',
    backgroundColor: '#F9DFE5',
    borderColor: '#F0C9D3',
    borderRadius: 21,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    minHeight: 123,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  menuHeroText: { flex: 1 },
  menuEyebrow: {
    color: COLORS.berry,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  menuBrand: {
    color: '#8F173D',
    fontSize: 24,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 7,
  },
  menuSubtitle: { color: '#865962', fontSize: 10, marginTop: 5 },
  menuHeroBerry: { fontSize: 47, marginLeft: 8 },
  menuHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  menuPageTitle: {
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 4,
  },
  openBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.greenLight,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  openDot: {
    backgroundColor: COLORS.green,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  openBadgeText: {
    color: COLORS.green,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  menuSearch: {
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
    borderRadius: 13,
    borderWidth: 1,
    color: COLORS.ink,
    fontSize: 12,
    marginTop: 15,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  categoryRow: { gap: 8, paddingVertical: 13 },
  menuDeliveryNote: {
    alignItems: 'center',
    backgroundColor: '#F8EEF0',
    borderRadius: 11,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  menuDeliveryIcon: { color: COLORS.berry, fontSize: 12, fontWeight: '900' },
  menuDeliveryText: {
    color: '#795D64',
    flex: 1,
    fontSize: 9,
    fontWeight: '600',
  },
  menuCategoryHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 21,
  },
  menuCategoryTitle: {
    color: COLORS.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  menuCategoryCount: { color: COLORS.muted, fontSize: 9, marginLeft: 8 },
  menuItemCard: {
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9,
    minHeight: 120,
    padding: 12,
  },
  menuItemCopy: { flex: 1, paddingRight: 10 },
  menuVegMark: {
    alignItems: 'center',
    borderColor: COLORS.green,
    borderRadius: 3,
    borderWidth: 1,
    height: 11,
    justifyContent: 'center',
    width: 11,
  },
  menuVegDot: {
    backgroundColor: COLORS.green,
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  menuItemName: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 6,
  },
  menuItemPrice: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 7,
  },
  menuItemMeta: { color: COLORS.muted, fontSize: 9, marginTop: 4 },
  menuItemArt: {
    alignItems: 'center',
    backgroundColor: '#F9E8EC',
    borderRadius: 12,
    justifyContent: 'space-between',
    minHeight: 95,
    padding: 9,
    width: 95,
  },
  menuItemEmoji: { fontSize: 31, marginTop: 3 },
  addItemButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EBC8D1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    height: 28,
    justifyContent: 'center',
    width: '100%',
  },
  addItemText: {
    color: COLORS.berry,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  addItemPlus: {
    color: COLORS.berry,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 5,
  },
  itemQuantity: {
    alignItems: 'center',
    backgroundColor: COLORS.berry,
    borderRadius: 8,
    flexDirection: 'row',
    height: 29,
    justifyContent: 'space-around',
    width: '100%',
  },
  itemQuantityButton: {
    alignItems: 'center',
    height: 27,
    justifyContent: 'center',
    width: 24,
  },
  itemQuantityAction: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  itemQuantityValue: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  menuDisclaimer: {
    color: COLORS.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 13,
    marginBottom: 7,
    textAlign: 'center',
  },
  sectionHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 23,
    marginBottom: 10,
  },
  sectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { color: COLORS.muted, fontSize: 10, marginLeft: 8 },
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
  },
  performanceRow: { paddingVertical: 13 },
  dividedRow: {
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    paddingVertical: 13,
  },
  performanceName: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  productRank: { color: '#C7ADB3', fontSize: 10, fontWeight: '800' },
  rowTitle: {
    color: COLORS.ink,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  barArea: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 9,
  },
  barTrack: {
    backgroundColor: '#F4ECE9',
    borderRadius: 6,
    flex: 1,
    height: 6,
    overflow: 'hidden',
  },
  barFill: { backgroundColor: COLORS.berry, borderRadius: 6, height: 6 },
  unitsLabel: { color: COLORS.muted, fontSize: 9, width: 43 },
  stallRow: { paddingVertical: 12 },
  stallHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 9,
  },
  stallDot: { borderRadius: 5, height: 9, width: 9 },
  stallAmount: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 'auto',
  },
  orderRow: { alignItems: 'center', flexDirection: 'row', paddingVertical: 13 },
  orderMarker: {
    alignItems: 'center',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  orderMarkerText: { fontSize: 17 },
  orderCopy: { flex: 1, marginLeft: 10 },
  mutedSmall: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  orderAmountArea: { alignItems: 'flex-end', gap: 5 },
  orderAmount: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  statusPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  pendingPill: { backgroundColor: '#FFF1DB' },
  donePill: { backgroundColor: COLORS.greenLight },
  statusText: { fontSize: 9, fontWeight: '800' },
  pendingText: { color: COLORS.amber },
  doneText: { color: COLORS.green },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: COLORS.berry,
    borderRadius: 13,
    marginTop: 15,
    paddingVertical: 14,
  },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  footnote: {
    color: COLORS.muted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 5,
  },
  costWarning: {
    color: COLORS.amber,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  demoDataHint: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 2,
  },
  demoModeBanner: {
    alignItems: 'center',
    backgroundColor: '#FFF0D9',
    borderColor: '#F0D6A9',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  demoModeCopy: { flex: 1 },
  demoModeTitle: {
    color: '#8D5B1B',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  demoModeText: { color: '#806B50', fontSize: 9, marginTop: 3 },
  demoModeRemove: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  demoModeRemoveText: { color: '#8D5B1B', fontSize: 9, fontWeight: '800' },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 4,
  },
  tab: { alignItems: 'center', flex: 1, paddingVertical: 3 },
  tabIcon: { color: '#A9959A', fontSize: 19, fontWeight: '700' },
  tabLabel: { color: '#A9959A', fontSize: 9, fontWeight: '700', marginTop: 3 },
  activeTabText: { color: COLORS.berry },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 9 },
  orderCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  orderDetails: {
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    paddingTop: 11,
    paddingBottom: 12,
  },
  orderPaymentStatus: { fontSize: 10, fontWeight: '800', marginTop: 7 },
  billActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  paymentConfirmButton: {
    backgroundColor: COLORS.greenLight,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  paymentConfirmText: { color: COLORS.green, fontSize: 9, fontWeight: '800' },
  shareBillButton: {
    alignItems: 'center',
    backgroundColor: COLORS.berryLight,
    borderRadius: 10,
    marginTop: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  shareBillText: { color: COLORS.berry, fontSize: 10, fontWeight: '900' },
  orderItemsText: { color: COLORS.ink, fontSize: 11, lineHeight: 17 },
  statusButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.berryLight,
    borderRadius: 9,
    marginTop: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  statusButtonDone: { backgroundColor: COLORS.greenLight },
  statusButtonText: { color: COLORS.berry, fontSize: 10, fontWeight: '800' },
  statusButtonDoneText: { color: COLORS.green },
  summaryLine: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  summaryLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  summaryValue: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  summaryStrong: { color: COLORS.berry, fontWeight: '900' },
  insightNote: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    paddingVertical: 12,
  },
  insightProductCopy: { flex: 1 },
  rankBadge: {
    backgroundColor: COLORS.berryLight,
    borderRadius: 7,
    color: COLORS.berry,
    fontSize: 8,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  stallFinanceCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  financeNet: { fontSize: 12, fontWeight: '800', marginLeft: 'auto' },
  positive: { color: COLORS.green },
  negative: { color: COLORS.berry },
  manageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 13,
  },
  editAction: {
    color: COLORS.berry,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: COLORS.berryLight,
    borderRadius: 12,
    marginTop: 9,
    paddingVertical: 12,
  },
  secondaryButtonText: { color: COLORS.berry, fontSize: 12, fontWeight: '800' },
  smallAddButton: {
    backgroundColor: COLORS.berryLight,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallAddText: { color: COLORS.berry, fontSize: 10, fontWeight: '800' },
  expenseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 13,
  },
  expenseAmount: { color: COLORS.berry, fontSize: 11, fontWeight: '800' },
  localNotice: {
    backgroundColor: '#F3E9DD',
    borderRadius: 13,
    marginTop: 18,
    padding: 13,
  },
  localNoticeTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  localNoticeText: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  upiSettingsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 1,
    padding: 13,
  },
  upiSettingsHint: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 13,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyBerry: { fontSize: 25 },
  emptyTitle: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
  },
  emptyBody: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
    textAlign: 'center',
  },
  modalBackdrop: {
    backgroundColor: '#25171C88',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
  },
  cartBar: {
    alignItems: 'center',
    backgroundColor: COLORS.berry,
    borderRadius: 15,
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cartCount: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  cartCountText: { color: COLORS.berry, fontSize: 12, fontWeight: '900' },
  cartCopy: { flex: 1, marginLeft: 10 },
  cartTitle: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  cartSub: { color: '#FBE7ED', fontSize: 8, marginTop: 3 },
  cartAmount: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  checkoutItem: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: 11,
  },
  paymentChoiceRow: { flexDirection: 'row', gap: 9, marginTop: 7 },
  paymentChoice: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 7,
    paddingVertical: 11,
  },
  paymentChoiceSelected: {
    backgroundColor: COLORS.berryLight,
    borderColor: COLORS.berry,
  },
  paymentChoiceText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  paymentChoiceTextSelected: { color: COLORS.berry, fontWeight: '900' },
  checkoutQr: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 13,
    padding: 14,
  },
  qrInstruction: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 10,
  },
  qrUpiId: {
    color: COLORS.berry,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 5,
  },
  qrWarning: {
    color: COLORS.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  upiMissing: {
    color: COLORS.amber,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 10,
  },
  paymentNote: { color: COLORS.muted, fontSize: 9, marginTop: 10 },
  billSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
  },
  billTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  billBrand: {
    color: '#8F173D',
    fontSize: 18,
    fontStyle: 'italic',
    fontWeight: '900',
  },
  billEyebrow: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  billNumber: {
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  billDate: { color: COLORS.muted, fontSize: 10, marginTop: 5 },
  billDivider: {
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    marginVertical: 14,
  },
  billItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  billItemName: {
    color: COLORS.ink,
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    paddingRight: 10,
  },
  billItemAmount: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  billTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billTotalLabel: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  billTotalAmount: { color: COLORS.berry, fontSize: 22, fontWeight: '900' },
  billPaymentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.berryLight,
    borderRadius: 8,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  billPaymentText: { color: COLORS.berry, fontSize: 9, fontWeight: '900' },
  billQrCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 17,
    padding: 15,
  },
  billQrTitle: {
    color: COLORS.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  billQrAmount: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 8,
  },
  modalHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { color: COLORS.ink, fontSize: 21, fontWeight: '800' },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F1E7E4',
    borderRadius: 16,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  closeButtonText: { color: COLORS.ink, fontSize: 21, lineHeight: 24 },
  modalHint: {
    color: COLORS.berry,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 12,
  },
  fieldWrap: { marginBottom: 13 },
  fieldLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.border,
    borderRadius: 11,
    borderWidth: 1,
    color: COLORS.ink,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  quantityRow: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: 11,
  },
  quantityProduct: { flex: 1 },
  quantityControl: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  quantityButton: {
    alignItems: 'center',
    backgroundColor: COLORS.berryLight,
    borderRadius: 9,
    height: 29,
    justifyContent: 'center',
    width: 29,
  },
  quantityButtonText: {
    color: COLORS.berry,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 21,
  },
  quantityValue: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 15,
    textAlign: 'center',
  },
  modalTotal: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 13,
  },
  modalTotalLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  modalTotalValue: { color: COLORS.berry, fontSize: 18, fontWeight: '900' },
});

export default App;
