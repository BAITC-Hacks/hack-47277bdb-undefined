# Frontend integration contract

The widget uses public API DTOs only. It must not call the catalog, cart, model, database, or internal tools directly.

Base URL: `https://<host>/api`

## 1. Start or resume a chat session

Send a message to `POST /chat`. Omit `sessionId` to create a new anonymous session. Send the selected city immediately when it is known; the backend does not guess it for price, stock, analogs, or carts.

```json
{
  "message": "Маған 3P 50A автомат керек",
  "session": {
    "sessionId": "optional-existing-session-id",
    "city": "Алматы",
    "warehouseId": "optional-warehouse",
    "customerType": "retail",
    "currency": "KZT"
  },
  "attachmentFileIds": ["optional-uploaded-file-id"],
  "stream": false
}
```

The response always includes a `session` and a typed payload. Persist `session.sessionId` in the widget's secure first-party state and send it on later calls.

```json
{
  "success": true,
  "requestId": "...",
  "session": { "sessionId": "...", "language": "kk", "city": "Алматы" },
  "response": {
    "type": "products",
    "message": "...",
    "products": [],
    "quickReplies": ["Нақты сипаттамалар", "Қоймадағы қалдық"]
  }
}
```

## 2. Streaming

Set `stream: true` on `POST /chat` and accept `text/event-stream`. Each event has JSON data and a stable `type`:

| Event             | Widget behavior                                         |
| ----------------- | ------------------------------------------------------- |
| `assistant.delta` | Append a safe text fragment.                            |
| `products`        | Render product cards.                                   |
| `comparison`      | Render a comparison table.                              |
| `cart.proposal`   | Show the explicit cart confirmation UI.                 |
| `cart.updated`    | Refresh cart indicator and show the returned `cartUrl`. |
| `handoff`         | Display handoff status; do not expose internal notes.   |
| `error`           | Render a recoverable localized error.                   |
| `done`            | Mark the turn complete.                                 |

Do not infer a cart mutation from chat text. Only `cart.updated` proves a successful mutation.

## 3. Product cards

Use the product object returned by the API as the canonical card. Preserve SKU and technical identifiers verbatim.

```ts
type ProductCard = {
  id: string;
  sku: string;
  supplierSku: string;
  name: string;
  brand: string;
  imageUrls: string[];
  productUrl: string;
  technicalSpecifications: Record<string, string | number | boolean | string[]>;
  price?: { unitPrice: number; currency: string; updatedAt: string };
  stock?: { availableQuantity: number; status: string; city?: string };
  analogReason?: string;
};
```

Use `GET /products/search?query=...&city=Алматы`, `GET /products/:id`, and `GET /products/:id/stock?city=Алматы` for direct widget interactions. When city or warehouse is absent, show the `CITY_REQUIRED` prompt instead of showing stale or cross-city information.

## 4. Cart confirmation (required)

First create a proposal. This action does **not** update the cart:

```json
POST /cart/proposal
{
  "sessionId": "...",
  "items": [{ "productId": "...", "quantity": 3 }]
}
```

Render the returned items, unit prices, subtotal, city, expiry, and the exact confirm button. Keep `confirmationToken` in transient client state only; never put it in a URL or analytics event.

After the user presses a button with unambiguous text such as “Добавить в корзину” / “Себетке қосу”, send:

```json
POST /cart/confirm
{
  "sessionId": "...",
  "proposalId": "...",
  "confirmationToken": "...",
  "idempotencyKey": "a-new-UUID-for-this-click"
}
```

Disable the button while pending, but retry network failures with **the same** `idempotencyKey`. The backend rechecks price, product status, and stock before it calls the cart adapter. If it returns `PROPOSAL_CHANGED`, display the replacement proposal and ask again.

Never treat “ок”, “нормально”, “покажи”, or a product-card click as confirmation.

## 5. Files and specifications

`POST /files` accepts one validated file payload and returns a `fileId`. The baseline JSON transport is:

```json
{
  "filename": "specification.csv",
  "mimeType": "text/csv",
  "contentBase64": "..."
}
```

Then call `POST /specifications/analyze`:

```json
{ "fileId": "...", "city": "Алматы" }
```

Poll `GET /specifications/:id`. Render each line's status (`EXACT_MATCH`, `LIKELY_MATCH`, `OUT_OF_STOCK`, `ANALOG_FOUND`, `NOT_FOUND`) and never add matched rows to a cart automatically.

For a JPEG/PNG, pass its returned `fileId` in `attachmentFileIds` on `/chat` with a photo-search prompt. The service extracts visible markings only, then searches the catalog; it must not claim a product match if markings are unreadable.

## 6. Errors

All errors use this shape:

```json
{
  "success": false,
  "error": {
    "code": "STOCK_UNAVAILABLE",
    "message": "Недостаточно товара на складе",
    "requestId": "..."
  }
}
```

Show the safe `message`; log `requestId` for support. Do not render raw backend stack traces.

Important recoverable codes: `CITY_REQUIRED`, `STOCK_UNAVAILABLE`, `PRICE_UNAVAILABLE`, `PROPOSAL_EXPIRED`, `PROPOSAL_CHANGED`, `CONFIRMATION_REQUIRED`, and `UPSTREAM_UNAVAILABLE`.
