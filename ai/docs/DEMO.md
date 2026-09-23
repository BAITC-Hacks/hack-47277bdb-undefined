# Demo scenarios

Run the service in mock mode before the demo:

```bash
cp .env.example .env
npm run dev
```

## 1. SKU search

`GET /api/products/search?query=EKT-MCB-3P-50A&city=Алматы`

Expected: catalog-backed result with SKU, image, technical specs and city-aware stock/price data. No generated product facts.

## 2. Stock check

`GET /api/products/:id/stock?city=Алматы&requestedQuantity=3`

Expected: `availableQuantity`, warehouses, status, and `canFulfillRequestedQuantity`. Omit city and receive `CITY_REQUIRED`.

## 3. Missing product → explainable analog

`GET /api/products/:id/analogs?city=Алматы&quantity=3`

Expected: hard-incompatible candidates excluded; each remaining option describes matching critical characteristics, availability, and meaningful differences.

## 4. Russian and Kazakh

Send `Нужен автомат 3P 50A` and `Маған 3P 50A автомат керек` through `POST /api/chat`.

Expected: language is detected and reply uses the same primary language. SKU and technical notation remain unchanged.

## 5. Photo → product candidate

Upload a JPEG/PNG with `POST /api/files` and use the resulting `fileId` in chat context.

Expected: the service returns a candidate flow or asks for readable marking; it never claims 100% recognition without verified catalog data.

## 6. Specification → mass matching

Upload a CSV/XLSX/PDF specification and call `/api/specifications/analyze` with `city`.

Expected: at most 50 lines are analyzed in batches, each receives a matching status, current stock, and an analog where appropriate. Nothing is added to a cart.

## 7. No confirmation, no cart change

1. Find a product.
2. Say `Нормально` or click a product card.
3. Check `GET /api/cart?sessionId=...`.

Expected: no cart mutation.

## 8. Explicit confirmation and direct cart URL

1. `POST /api/cart/proposal` for two items.
2. Confirm with the proposal's token and a new idempotency key.
3. Repeat the request with the same idempotency key.

Expected: price and stock are revalidated; cart mutation happens once; both responses return the same cart URL.
