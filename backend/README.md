# EKT-inspired Store Backend — Phase 3

Электр жабдықтары дүкенінің қазақша/орысша REST API сервері. Каталогты қала бойынша іздеу, өңірлік баға, бірнеше қоймадағы қалдық, қонақ/тіркелген пайдаланушы себеті, тапсырыс және қойма резерві іске асырылған. Phase 3 синтетикалық демо каталог, Swagger және PostgreSQL-мен жұмыс істейтін автоматтандырылған тесттер қосады.

Бұл — хакатонның демонстрациялық жобасы. Каталог, бағалар, мекенжайлар, жаңалықтар және жеткізу шарттары нақты EKT деректері емес. Демо техникалық сипаттамалар өндіруші растаған сипаттамалар ретінде қолданылмайды. Сайттан деректер немесе авторлық суреттер жүктелмейді; seed суреттер мен сертификат сілтемелерін `null` күйінде қалдырады.

## Мүмкіндіктер және технологиялар

- JavaScript, CommonJS, Node.js 20+, Express 5, PostgreSQL, Prisma 6.
- JWT, bcrypt, Helmet, CORS, сұрау валидациясы, rate limiting.
- Иерархиялық санаттар, брендтер, динамикалық техникалық атрибуттар, іздеу және сүзгілер.
- Қалаға тән `ProductOffer` бағалары және `ProductStock` қойма қалдығы.
- Favorites, 4 тауарға дейін comparison, guest/authenticated cart.
- Транзакциялық checkout, қойма резерві, тоқтату кезінде резервті босату, аяқтау кезінде қалдықты шегеру.
- Promotions, news, FAQ, content pages, customer requests, ADMIN CRUD.
- ExcelJS арқылы XLSX прайс-парақ; Multer арқылы JPG/PNG/WEBP/PDF жүктеу.
- Swagger UI / OpenAPI 3; Jest 30 және Supertest.

Prisma client/CLI бірдей `6.19.3` patch нұсқасында. `package.json` ішіндегі шектелген overrides `@prisma/config → deepmerge-ts 8.0.0` және `exceljs → uuid 11.1.1` транзитивті тәуелділіктерінің қауіпсіздік жаңартуларын бекітеді; Prisma командалары мен XLSX ағыны осы конфигурациямен тексеріледі.

Осы backend ішінде TypeScript, Docker, Redis, BullMQ, AI, chatbot, frontend немесе төлем провайдерінің интеграциясы жоқ. Репозиторийдің басқа бумалары бұл backend-тің құрамына кірмейді.

## Архитектура және бума құрылымы

HTTP сұрауы `routes → validation/auth middleware → controller → service → Prisma → PostgreSQL` тізбегімен өңделеді. Service қабаты бизнес ережелерін орындайды; controller HTTP жауаптарын қалыптастырады. Баға, қалдық, рөл және тапсырыс иелігі сервер жағында анықталады.

```text
backend/
├── prisma/
│   ├── migrations/
│   ├── seed-data/          # Catalog/content fixtures, kk + ru
│   ├── schema.prisma
│   └── seed.js
├── scripts/
│   ├── check.js
│   ├── verify-demo.js
│   └── integration-check.js
├── src/
│   ├── config/            # env, Prisma, uploads
│   ├── docs/              # OpenAPI schemas, paths, Swagger router
│   ├── middleware/        # Auth, ADMIN, language, validation, errors
│   ├── modules/
│   │   ├── auth/ users/ cities/ branches/ warehouses/
│   │   ├── categories/ brands/ products/ catalog/
│   │   ├── favorites/ comparison/ cart/
│   │   ├── orders/ one-click-orders/ delivery/
│   │   ├── promotions/ news/ faqs/ pages/ requests/
│   │   └── admin/ uploads/ health/
│   ├── utils/
│   ├── app.js
│   └── server.js
├── tests/
│   ├── helpers/fixture.js
│   ├── setup.js
│   ├── api.test.js
│   └── seed.test.js
├── uploads/               # Runtime файлдары, Git-ке кірмейді
├── jest.config.js
├── .env.example
└── package.json
```

## PostgreSQL орнату және `ekt_store` базасын дайындау

PostgreSQL серверін және `psql` құралын орнатып, қызметін іске қосыңыз. Жергілікті сервердің стандартты порты — `5432`. Windows орнатуындағы `postgres` паролі PostgreSQL орнату кезінде беріледі. `.env` айнымалысы серверде пайдаланушыны автоматты түрде құрмайды.

Орнатылған нұсқаңызға сай жолды қолданыңыз; мысалы PostgreSQL 18:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d postgres
```

Алдымен `\du` және `\l` арқылы рөл мен базаның бар-жоғын тексеріңіз. Тек жаңа орнату үшін:

```sql
CREATE ROLE ekt_app WITH LOGIN PASSWORD 'REPLACE_WITH_YOUR_OWN_PASSWORD';
CREATE DATABASE ekt_store OWNER ekt_app;
\q
```

Бар пайдаланушы мен база дұрыс жұмыс істеп тұрса, оларды қайта құру қажет емес. `prisma migrate deploy` бар migration файлдарын қолданады, shadow database құрмайды. Жаңа migration жасауға арналған `prisma migrate dev` бөлек shadow database құру құқығын талап етуі мүмкін; тек жергілікті development рөліне қажет болса PostgreSQL әкімшісі `ALTER ROLE ekt_app CREATEDB;` орындай алады.

## `.env` конфигурациясы

Барлық келесі командаларды `backend` бумасынан іске қосыңыз:

```powershell
cd C:\ENT\hackalem\hack-47277bdb-undefined\backend
```

`.env` жоқ болғанда ғана үлгіні көшіріңіз. Бар файлдағы жұмыс істейтін баптауларды үстінен жазбаңыз:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://ekt_app:URL_ENCODED_PASSWORD@localhost:5432/ekt_store?schema=public"
JWT_SECRET="REPLACE_WITH_A_LONG_RANDOM_SECRET"
JWT_EXPIRES_IN="7d"
CLIENT_URL="http://localhost:5173"
BCRYPT_ROUNDS=10

# Екеуі де толтырылса ғана demo administrator жасалады.
SEED_ADMIN_EMAIL=""
SEED_ADMIN_PASSWORD=""

# Optional: migration қолданылған жеке PostgreSQL тест базасы.
# TEST_DATABASE_URL="postgresql://ekt_app:URL_ENCODED_PASSWORD@localhost:5432/ekt_store_test?schema=public"
```

`DATABASE_URL` ішіндегі пароль URL-encoded болуы керек: `/` → `%2F`, `@` → `%40`, `#` → `%23`, `%` → `%25`. PostgreSQL рөлінің нақты паролі өзгермейді: кодтау тек connection URL үшін. JWT secret генерациялау:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Шыққан мәнді `.env` ішіне жазыңыз; бұл команда файлды өзі өзгертпейді. `.env`, парольдер және runtime uploads Git-ке кірмеуі керек. `CLIENT_URL` — рұқсат етілген клиент origin-і; жергілікті `localhost:5173` және `127.0.0.1:5173` де қолданылады.

## Орнату, migration және іске қосу

```powershell
npm install
npx prisma format
npm run prisma:generate
npx prisma migrate deploy
npm run prisma:seed
npm run dev
```

`migrate deploy` тек репозиторийдегі pending migration-дарды орындайды. Базаны тазарту қажет емес. `prisma migrate reset` деректерді жояды; бұл жобаны іске қосу рәсіміне кірмейді. Жаңа schema өзгерісіне migration жасау қажет болғанда ғана development режимінде:

```powershell
npm run prisma:migrate -- --name your_change
```

PowerShell/npm аргументі жоғалса: `npx prisma migrate dev --name your_change` командасын тікелей орындаңыз. Prisma 6 `package.json#prisma.seed` конфигурациясын қолданады.

Қалыпты іске қосу және құралдар:

```powershell
npm start
npm run prisma:studio
```

Health тексеру:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod 'http://localhost:3000/api/products?city=almaty&limit=5'
```

Health жауабы `200`, `data.status: "OK"`, `data.database: "connected"` болуы керек. `/` маршруты жоқ, сондықтан `GET /` үшін `404` қалыпты. `prisma generate` дерекқор байланысын тексермейді. `P1000` — сервер қабылдамаған login/password; `503 DATABASE_UNAVAILABLE` — базаға қосылу мәселесі. `Ctrl+C` кезіндегі `SIGINT` қалыпты тоқтату сигналы.

## Seed және admin аккаунты

`npm run prisma:seed` жасайтын демо жиынтығы:

| Дерек | Саны |
| --- | ---: |
| Өнім | 64 |
| Санат | 39: 12 негізгі + 27 ішкі |
| Қала / бренд | 9 / 7 |
| Филиал / қойма | 9 / 12 |
| Қалалық ұсыныс / қойма қалдығы | 576 / 768 |
| Өнім атрибутының мәні | 343 |
| Promotion / news / FAQ | 4 / 6 / 5 |
| Content page / delivery rule | 7 / 9 |

Қалалар: Алматы, Астана, Шымкент, Тараз, Атырау, Ақтау, Қарағанды, Талдықорған, Өскемен. Алматы, Астана және Қарағандыда екі қоймадан бар. Брендтер: EKT, IEK, Schneider Electric, Legrand, CHINT, DEKraft, UNIT. Құрылғылар, кабельдер, жарықтандыру, қалқандар, розеткалар, автоматика және монтаж жабдықтары қамтылған.

Seed тұрақты UUID/unique lookup және `upsert` қолданады. Қайта іске қосу бар жолдарды көбейтпейді және бар бағаларды, қалдықтарды, резервтерді, парольдерді, рөлдерді не пайдаланушы өңдеген жазбаларды жаңадан жазбайды. Кестедегі сан — демо жиынтық мөлшері; бұрынғы деректер бар базаның жалпы саны көбірек болуы мүмкін. Кейбір бастапқы `reserved=2` мәндері демонстрациялық manual hold ретінде берілген.

Admin керек болса `.env` ішіндегі `SEED_ADMIN_EMAIL` және `SEED_ADMIN_PASSWORD` екеуін де өз мәндеріңізбен толтырып, seed-ті қайталаңыз. Пароль кемінде 12 таңба және ең көбі 72 UTF-8 байт болуы керек; bcrypt арқылы хэштеледі. Қауіпті әдепкі пароль жоқ. Бір мән жетіспесе admin creation өткізіліп, түсінікті хабарлама шығады. Email бұрыннан бар болса оның паролі/рөлі сақталады; бар CUSTOMER автоматты түрде ADMIN болмайды. Жаңа бөлек email пайдаланыңыз немесе бар аккаунттың құқықтарын дерекқор әкімшісі арқылы әдейі басқарыңыз.

## Swagger және API жауаптары

- UI: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- OpenAPI JSON: [http://localhost:3000/api-docs.json](http://localhost:3000/api-docs.json)

Swagger негізгі қолдану ағынын, request/response үлгілерін, query параметрлерін және auth талаптарын көрсетеді. Мысал UUID-лар иллюстрациялық; нақты UUID/slug-тарды каталог жауаптарынан алыңыз. `Authorize → bearerAuth` өрісіне JWT-ді `Bearer` префиксінсіз енгізіңіз. Қонақ үшін `guestSession` өрісіне өзіңіз жасаған UUID енгізіңіз.

```json
{"success":true,"data":[],"pagination":{"page":1,"limit":20,"total":0,"totalPages":0}}
```

Pagination тек тізім маршруты оны қолдағанда қайтады. Әдепкі `page=1`, `limit=20`, ең көбі `100`. Қате жауабы: `{"success":false,"error":{"code":"...","message":"...","details":[]}}`; `details` optional. Prisma ішкі хабарламалары мен stack trace клиентке берілмейді. Жалпы API лимиті — IP үшін 15 минутта 300 сұрау; registration/login лимиті — 20.

## Authentication және тіл

`POST /api/auth/register` үшін `email`, кемінде 8 таңбалы `password`, `firstName` қажет; `lastName`, `phone` optional. Жаңа қолданушы әрқашан CUSTOMER. Клиент өз рөлін бере алмайды. `POST /api/auth/login` үшін `email`, `password`; жауапта `data.token`, `data.user` қайтады. `GET /api/auth/me` ағымдағы аккаунтты қайтарады.

```http
Authorization: Bearer YOUR_TOKEN
```

Backend бар `token` cookie-ін де қабылдайды, бірақ login оны автоматты орнатпайды. Рөл/белсенділік әр сұрауда дерекқордан тексеріледі.

Әдепкі тіл — `kk`. Басымдық: `?lang=kk|ru` → `Accept-Language` → `kk`. Жауаптағы `name`, `description`, `title` сияқты өрістер локализацияланады; admin CRUD бастапқы `nameKk/nameRu` өрістерін қолданады.

## Қала таңдау, іздеу және сүзгілер

| API тобы | Негізгі маршруттар |
| --- | --- |
| Қала, филиал | `GET /api/cities`, `/api/cities/:slug`, `/api/branches?city=almaty` |
| Санат, бренд | `GET /api/categories`, `/api/categories/tree`, `/api/categories/:slug`, `/api/brands` |
| Каталог | `GET /api/products`, `/api/products/:slug` |
| Қалдық, ұқсас тауар | `GET /api/products/:id/availability`, `/api/products/:id/related` |
| Сүзгі, прайс | `GET /api/catalog/categories/:slug/filters`, `/api/catalog/price-list?city=almaty&format=xlsx` |

Каталог query-індегі `city` — slug (`almaty`), себет қала ауыстыруындағы `cityId` — UUID. Product detail жолындағы `:slug` — slug; availability/related/favorites/comparison үшін product UUID қажет.

```text
/api/products?city=almaty&q=C16&lang=ru&page=1&limit=10
/api/products?city=almaty&category=circuit-breakers&brand=schneider-electric
/api/products?city=almaty&category=circuit-breakers&attributes=rated_current:16,poles:1
/api/products?city=astana&inStock=true&minPrice=1000&maxPrice=10000&sort=price_asc
/api/catalog/categories/circuit-breakers/filters?city=almaty
```

Іздеу `q` арқылы SKU, supplier SKU, қазақша/орысша атау және бренд атауын қамтиды. `category` нақты санат slug-ына сәйкес келеді; ата-ананың барлық ұрпағын автоматты қоспайды. `/api/categories/tree` арқылы қажетті ішкі санатты таңдаңыз. Қосымша сүзгілер: `isNew`, `isSpecialOffer`, `inStock`.

Сұрыптау: `default`, `name_asc`, `name_desc`, `price_asc`, `price_desc`, `popularity_asc`, `popularity_desc`, `newest`. `city` жоқ және баға/қалдыққа тәуелді сүзгі жоқ болса карточкадағы `cityOffer`/`availableQuantity`/`availabilityStatus` — `null`. Баға диапазоны, price sorting немесе `inStock` қолданылса қала әдепкіде `almaty`; detail/availability да әдепкі Алматыны қолданады.

## Динамикалық атрибуттар, баға және қойма

`AttributeDefinition` санатқа тиесілі `key`, `type`, `unit`, `filterable` анықтайды. `ProductAttributeValue` мәнді `textValue`, `numberValue` не `booleanValue` өрісінде сақтайды. Мысалдар: `rated_current`, `poles`, `breaking_capacity`, `cross_section`, `modules`, `ip_protection`, `power`. `attributes=key:value,key:value` шарттары AND арқылы қосылады; ең көбі 20. Сан, boolean және регистрге тәуелсіз мәтін теңдігі қолданылады. Қолжетімді key/possibleValues мәндерін category filters маршруты береді.

`ProductOffer` өнім мен қаланың unique жұбына `webPrice`, `storePrice`, `availabilityStatus`, `deliveryEstimateHours` сақтайды. Демо қалалық бағалар сәл өзгеше. Public баға жауаптары сан түрінде, валюта — KZT. Offer мәртебелері: `IN_STOCK`, `ON_ORDER`, `OUT_OF_STOCK`; status қалдық санынан бөлек өріс.

Қоймадағы қолжетімді сан = `quantity - reserved`. Қала саны — сол қаланың белсенді қоймалары бойынша осы айырмалардың қосындысы. `inStock=true` осы санның оң болуын тексереді. `quantity=25, reserved=2` → `available=23`. PostgreSQL CHECK constraints теріс қалдықты және `reserved > quantity` жағдайын қабылдамайды.

## Guest session, себет, favorites және comparison

Қонақ үшін бір рет кездейсоқ UUID жасап, бүкіл қонақ сессиясында сақтаңыз:

```powershell
[guid]::NewGuid().ToString()
```

```http
X-Session-Id: YOUR_RANDOM_UUID
```

Бұл header cart/comparison/checkout үшін JWT орнына қолданылады. Екі header де берілсе, сұрау authenticated user атынан орындалады. JWT жарамсыз болса қонаққа автоматты ауыспайды. Login қонақ себетін немесе comparison-ды аккаунтқа автоматты біріктірмейді.

| Әрекет | Маршрут / body |
| --- | --- |
| Себет | `GET /api/cart` |
| Қосу | `POST /api/cart/items` — `{"productId":"UUID","quantity":2}` |
| Санды ауыстыру | `PATCH /api/cart/items/:itemId` — `{"quantity":3}` |
| Бір жолды өшіру | `DELETE /api/cart/items/:itemId` |
| Себетті тазарту | `DELETE /api/cart` |
| Қала ауыстыру | `PATCH /api/cart/city` — `{"cityId":"UUID"}` |
| Favorites | `GET /api/favorites`, `POST/DELETE /api/favorites/:productId` |
| Comparison | `GET/DELETE /api/comparison`, `POST/DELETE /api/comparison/:productId` |

`POST` бар жолдың санына қосады, `PATCH` жалпы санды ауыстырады. `itemId` — CartItem UUID, product UUID емес. Сан 1–10000 және қолжетімді қалдықтан аспауы керек; әйтпесе `409 INSUFFICIENT_STOCK`. Жаңа себет Алматыға тиесілі болады; қаланы бірінші `PATCH /api/cart/city` арқылы таңдауға болады. Қала ауысқанда жолдар сақталып, баға қайта есептеледі және stock/offer проблемалары `warnings` арқылы беріледі.

Frontend жіберген price/stock/subtotal/total мәндері есепке алынбайды. Себет нақты қалалық ұсынысты оқиды, тауар қосу резерв жасамайды. Favorites JWT талап етеді және duplicate қоспайды. Comparison JWT немесе guest session қабылдайды, duplicate қоспайды, ең көбі 4 өнім; бесіншісіне `409 COMPARISON_LIMIT_REACHED`.

## Checkout және тапсырыстар

Себетті толтырғаннан кейін `POST /api/orders`:

```json
{
  "customerName": "Демо Клиент",
  "phone": "+7 000 000 00 00",
  "email": "customer@example.test",
  "customerType": "PERSON",
  "deliveryMethod": "PICKUP",
  "paymentMethod": "POS_ON_PICKUP"
}
```

`customerType=COMPANY` үшін `companyName` және 12 таңбалы `bin`; `deliveryMethod=DELIVERY` үшін `deliveryAddress` қажет. `comment` optional. Төлем әдістері: `ONLINE_CARD`, `CASH_ON_DELIVERY`, `POS_ON_PICKUP`, `BANK_TRANSFER`. Төлем провайдері қосылмаған: әдіс пен мәртебе тек сақталады, нақты ақша алынбайды.

Checkout қала мен өнімдерді себеттен алады; бағаларды қайта оқып, жеткізу ережесін қолданып, subtotal/deliveryPrice/total есептейді. Serializable транзакция қойма жолдарын құлыптайды, резерв жасап, тауар атауы/SKU/бағасының snapshot-ын сақтайды, себетті тазартады. Жеткіліксіз stock болса операция толық кері қайтарылады. Бәсекелес өзгеріс `409 TRANSACTION_CONFLICT` беруі мүмкін; қайта жібермес бұрын себет/тапсырыс күйін тексеріңіз. Pickup бағасы 0; delivery үшін қалаға тән, кейін жалпы demo rule қолданылады.

`GET /api/orders/me` тек JWT иесінің тапсырыстарын көрсетеді. `GET /api/orders/:id` де owner-only; өзгенің тапсырысына `404`. Қонақ order-і create жауабында қайтады, бірақ кейін оны customer JWT endpoint арқылы оқу мүмкін емес; guest order lookup іске асырылмаған.

`POST /api/one-click-orders` public endpoint-іне `productId`, `cityId`, `quantity`, `customerName`, `phone`, optional `email` беріледі. Ол stock/offer тексеріп callback-style request жасайды; қойма резерві немесе толық checkout order жасамайды.

## Контент және клиент сұраулары

`GET /api/promotions`, `/api/news`, `/api/news/:slug`, `/api/faqs`, `/api/pages/:slug` локализацияланған контент береді. Promotion белсенді уақыт аралығын, news publication мәртебесі мен күнін ескереді. News pagination қолдайды.

Бет slug-тары: `delivery-and-payment`, `returns-and-exchange`, `how-to-order`, `online-payment`, `installment`, `privacy-policy`, `b2b`. Олардың мәтіндері демонстрациялық, нақты компания саясаты емес.

`POST /api/requests`: міндетті `name`, `phone`; optional `email`, `company`, `message`, `type`. Түрлері: `GENERAL`, `CALLBACK`, `B2B`, `CUSTOM_PANEL`, `COOPERATION`. Алғашқы мәртебе серверде `NEW` болып беріледі.

## Admin API және файлдар

Барлық `/api/admin/*` маршруттары белсенді ADMIN JWT талап етеді. CUSTOMER және MANAGER үшін `403 ADMIN_REQUIRED`; авторизациясыз `401 AUTH_REQUIRED`.

```text
GET/POST         /api/admin/:resource
GET/PATCH/DELETE /api/admin/:resource/:id
```

Ресурстар: `cities`, `branches`, `warehouses`, `categories`, `brands`, `products`, `product-images`, `attribute-definitions`, `attribute-values`, `product-offers`, `stock`, `promotions`, `news`, `faqs`, `pages`, `delivery-rules`. Body тек allow-listed өрістерді қабылдайды; nested relation жазылмайды. Product create үшін `sku`, `slug`, `nameKk`, `nameRu`, `categoryId`, `unit` қажет. Баға мен қойма бөлек ресурс арқылы басқарылады. Қолдайтын модельдерде delete `isActive=false`/`isPublished=false` қылады; сурет/атрибут/stock секілді ресурстар физикалық өшірілуі мүмкін.

`GET /api/admin/orders` және `/api/admin/requests` pagination/status сүзгісін қолдайды. `PATCH /api/admin/orders/:id/status` body: `{"status":"CANCELLED"}` немесе `{"status":"COMPLETED","paymentStatus":"PAID"}`. Cancel резервті босатады; complete `quantity` және `reserved` шегереді. Бұл екі мәртебе final, қайталанған сұрау stock-ты екінші рет өзгертпейді. Admin status жауабы raw record болғандықтан decimal сомалар string болуы мүмкін. `PATCH /api/admin/requests/:id/status` үшін `NEW`, `IN_PROGRESS`, `COMPLETED`, `REJECTED` қолданылады.

`POST /api/admin/uploads`: `multipart/form-data`, жалғыз `file`, ең көбі 5 MiB. JPEG, PNG, WEBP, PDF MIME және бастапқы сигнатурасы тексеріледі. Сервер UUID filename жасайды. Жауаптағы `/api/uploads/:filename` URL public арқылы оқылады; файлдар құпия құжаттарға арналмаған. Алынған URL-ді product image/certificate өрісінде пайдаланыңыз.

## Тесттер және тексеру

```powershell
npm test
npm run check
npm run check:demo
npm run check:integration
```

Jest/Supertest жиынтығы PostgreSQL integration тесттері мен жеке seed fixture тесттерінен тұрады; нақты өткен тест саны әр іске қосу соңында көрсетіледі. Health, registration validation, password hashing, login, рөлді енгізуге әрекет, JWT/ADMIN қорғауы, pagination, өңірлік баға/stock, category/brand/dynamic filters, guest/auth cart, quantity rejection, backend totals, duplicate prevention, reservation/cancel/complete, owner-only orders, бәсекелес cart/checkout және rollback тексеріледі. Seed тесттері иерархия, типтелген атрибуттар, детерминдік бағалар/UUID, қор мәртебелері, локализация және admin пароль талаптарын тексереді. `npm run check` syntax/import және жеңіл функционалдық тексерулерді орындайды; `check:demo` бар демо деректерін тек оқып тексереді; бұрынғы `check:integration` Phase 2 ағынын қосымша тексереді.

Тесттер mock database қолданбайды: PostgreSQL жұмыс істеп, migration қолданылған болуы керек. `TEST_DATABASE_URL` берілсе Jest соны, әйтпесе `.env` ішіндегі `DATABASE_URL` қолданады. Тесттер өз UUID/email prefix-імен fixture жасайды және тек өз жазбаларын cleanup кезінде өшіреді; seed пен пайдаланушы деректерін reset қылмайды. Процесс мәжбүрлі тоқтаса cleanup аяқталмауы мүмкін. Жеке тест базасын пайдалану ыңғайлы:

```sql
CREATE DATABASE ekt_store_test OWNER ekt_app;
```

Оған migration қолдану үшін бөлек PowerShell сессиясында connection URL беріп орындаңыз:

```powershell
$env:DATABASE_URL = 'postgresql://ekt_app:URL_ENCODED_PASSWORD@localhost:5432/ekt_store_test?schema=public'
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
```

Содан кейін `.env` файлына `TEST_DATABASE_URL` мәнін қосып, `npm test` орындаңыз. Тест seed-ті қажет етпейді және JWT secret-ті тест процесі ішінде кездейсоқ мәнмен ауыстырады. PostgreSQL қолжетімсіз болса тесттер жалған successful нәтиже бермей, байланыс қатесін көрсетеді.

## Болашақ AI consultant үшін service шекарасы

AI consultant бұл phase-де іске асырылмаған. Болашақ интеграция үшін HTTP-ден тәуелсіз қолданыстағы каталог функциялары бар:

| Файл | Экспорт және signature |
| --- | --- |
| `src/modules/products/product-query.service.js` | `searchProducts({ query, language })` |
| Сол файл | `getProductBySku(sku)` |
| Сол файл | `getProductSpecifications(productId, language, db = prisma)` |
| Сол файл | `getCityStock(productId, cityId, db = prisma)` |
| Сол файл | `getCityPrice(productId, cityId, db = prisma)` |
| Сол файл | `findRelatedProducts({ productId, citySlug, language, limit = 8 })` |
| `src/modules/products/product.service.js` | `getProductBySlug({ slug, citySlug, language })` |
| Сол файл | `getProductAvailability({ productId, citySlug, language })` |

`cityId` — UUID, `citySlug` — slug. `searchProducts` service-іне HTTP-ден тыс тікелей бергенде boolean/number параметрлерін тиісті JS типінде беріңіз. `getCityPrice` raw Prisma offer не `null`, `getCityStock` stock breakdown қайтарады; сыртқы интерфейс қажет болса DTO-ға түрлендіру caller міндеті. Осы service-терді қайта қолдану үшін AI SDK, chatbot модулі немесе vector database қосылған жоқ.

## Белгілі шектеулер

Бұл production readiness кепілдігі емес. Бірқатар каталог сұрыптауы мен stock сүзгісі жадыда орындалады; үлкен каталог үшін SQL-side pagination және өнімділік өлшемдері қажет. Резервтердің автоматты expiry-і жоқ: admin тапсырысты аяқтау/тоқтату арқылы басқарады. Қонақ сессия UUID-і себетке кіру кілті сияқты, оны бөліспеңіз. Тест пен demo seed-ті production базаға іске қоспаңыз; `check:integration` тек `DATABASE_URL` қолданады.

Prisma 6-дағы `package.json#prisma` туралы deprecation warning қате емес; осы phase үшін major Prisma жаңартуы қажет емес. Демо бизнес шарттарын нақтылау, төлем/email интеграциясы, HTTPS deployment, backup/monitoring және нақты суреттер кейінгі бөлек жұмыс болып қалады.
