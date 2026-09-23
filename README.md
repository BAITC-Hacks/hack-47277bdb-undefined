# hack-47277bdb-undefined
Hackathon team repository for Undefined

Backend setup, demo seed, Swagger және тесттер: [backend/README.md](backend/README.md).

## Frontend + backend іске қосу

Node.js 20+ және жұмыс істеп тұрған PostgreSQL қажет. Екі бөлек терминал пайдаланыңыз.

Backend:

```powershell
cd C:\ENT\hackalem\hack-47277bdb-undefined\backend
npm start
```

Frontend:

```powershell
cd C:\ENT\hackalem\hack-47277bdb-undefined\frontend
npm run dev
```

Қолданба: http://localhost:5173. API: http://localhost:3000/api. Денсаулық тексеруі: http://localhost:3000/api/health. Swagger: http://localhost:3000/api-docs.

Жаңа checkout үшін екі бумада да `npm ci` орындаңыз. Backend ортасын [backend/README.md](backend/README.md) бойынша баптаңыз; frontend `.env.example` файлын `.env` ретінде көшіріңіз. Осы компьютерде frontend `.env` дайын:

```dotenv
VITE_API_URL=http://localhost:3000/api
VITE_USE_MOCKS=false
```

Құпиялар тек backend `.env` ішінде қалады; екі `.env` те Git-ке кірмейді. Frontend ортасы браузерге ашық болғандықтан оған пароль/API secret жазбаңыз. Vite конфигурациясын өзгерткен соң dev серверді қайта іске қосыңыз. 5173 бос болмаса, сол порттағы ескі dev серверді тоқтатыңыз; басқа портқа автоматты ауысу өшірілген.

## Интеграцияны тексеру

Backend бумасында: `npm run check`, `npm test`, `npm run check:demo`.

Frontend бумасында:

```powershell
npm run build
npm run check:contexts
npm run check:pages
npm run check:integration
```

Соңғы команда үшін backend 3000 портында іске қосылып, сол PostgreSQL базасына қосылуы керек. Ол нақты frontend API сервистерін тексеріп, тек өз UUID-тест деректерін құрып/тазартады; seed деректерін өшірмейді. Context/page тесттері нақты React компоненттерін jsdom ішінде, оқшауланған HTTP адаптерімен тексереді; оларға сервер қажет емес. Prisma Client қайта генерациялағанда Windows DLL lock болмас үшін backend серверін алдымен тоқтатыңыз.

Маршруттар, сәйкессіздіктер, түзетулер, тесттер және шектеулер: [INTEGRATION_REPORT.md](INTEGRATION_REPORT.md). Қосымша backend контракт: [INTEGRATION_API_CONTRACT.md](INTEGRATION_API_CONTRACT.md).

AI/image search және төлем провайдері қосылмаған. Қонақ себеті аккаунт себетімен автоматты біріктірілмейді. Толық визуалды smoke test-ті браузерде қолмен өткізіңіз.
