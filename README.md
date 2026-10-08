# BerryBiz Strawberry Shop Manager

BerryBiz is an offline-first React Native app for managing orders, products, expenses, and
performance across Cherry Bliss, Bites & Bowls, Cherry Brownie, and Sugary Spot. App data is stored
on the device; there is no backend service or live Excel connection.

## Features

- Create customer orders with optional name and phone, item quantities, and calculated totals.
- Move orders between Pending and Done.
- Browse the Cherry & Bliss flyer menu by category, add/remove items, and create/share itemized
  bills.
- Create UPI payment QR codes for the exact bill amount using the selected stall's UPI ID. Payments
  are verified manually in the stall's UPI app; there is no payment gateway or automatic payment
  confirmation.
- Manage product selling and cost prices and record stall expenses.
- View daily, weekly, and monthly sales, product costs, expenses, profit/loss, and product/stall
  performance.
- Filter the dashboard and insights by day, week, or month, select a calendar date, and view sales
  in a bar chart (4-hour blocks for a day, days for a week, and weekly groups for a month).
- Select one stall or the combined owner view.
- Refresh data manually from an Excel workbook. Rows merge by ID: workbook rows update matching
  records, new rows are added, and records that only exist in the app are kept.
- Add removable sample orders and expenses from **Manage → Try sample data** to test dashboards,
  charts, orders, and reports across all four stalls. The sample dataset includes the last 28 days
  and the full upcoming calendar month for trying future chart views. Sample records are added
  without replacing existing data.
- In development builds, sample data loads automatically when the device has no orders or expenses.
  A demo banner identifies these records; removing them marks the empty state as intentional so
  they do not load automatically again.

The combined owner view is not password-protected; access is controlled by whoever can unlock the
device.

Profit is calculated as order sales minus recorded item costs and expenses. Pending orders are
not counted in sales totals until payment is marked as received. Menu prices are transcribed from
the Cherry & Bliss menu images; item cost prices were not shown, so enter those in Manage for an
accurate profit report. Product-level profit is gross profit (sales less item costs); stall
expenses are not allocated to individual products. Cash is marked paid when the bill is created.
UPI bills stay pending until a person checks the payment and marks it paid.

## Excel workbook format

Use these exact worksheet names and include the listed column headers in each sheet:

| Worksheet     | Required column headers                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stalls        | `stall_id`, `stall_name`, `owner_name`, `phone_number`, `status`, `created_at`                                                                                                           |
| Products      | `product_id`, `stall_id`, `product_name`, `category`, `price`, `cost_price`, `stock_status`, `status`, `created_at`                                                                      |
| Orders        | `order_id`, `stall_id`, `customer_name`, `customer_phone`, `order_date`, `order_status`, `subtotal`, `discount`, `total_amount`, `payment_status`, `notes`, `created_at`, `completed_at` |
| Order Items   | `order_item_id`, `order_id`, `product_id`, `stall_id`, `quantity`, `unit_price`, `cost_price`, `line_total`, `created_at`                                                                |
| Expenses      | `expense_id`, `stall_id`, `expense_date`, `expense_category`, `description`, `amount`, `created_at`                                                                                      |
| Sales         | `sale_id`, `order_id`, `stall_id`, `sale_date`, `total_amount`, `payment_method`, `created_at`                                                                                           |
| Profit & Loss | `profit_loss_id`, `stall_id`, `period_type`, `period_start`, `period_end`, `total_sales`, `total_expenses`, `total_cost`, `profit`, `loss`, `created_at`                                 |

Stall IDs must refer to the four named stalls above. Product, order, and expense IDs should be unique
within their worksheet; Order Items link to Orders and Products through their IDs. Refresh the
workbook from **Manage → Refresh from Excel** after changing the file on the device. The refresh is
manual, not automatic. Sales and Profit & Loss worksheets are validated, then recalculated in the
app from Orders, Order Items, Products, and Expenses to avoid double-counting report rows.

## Run the app

```sh
npm install
cd ios && pod install && cd ..
npm start
```

In another terminal, run `npm run ios` or `npm run android`.

## Verify

```sh
npm test -- --runInBand
npx tsc --noEmit
npx eslint App.tsx src __tests__/App.test.tsx __tests__/cherryBlissMenu.test.ts __tests__/excelImport.test.ts
```
