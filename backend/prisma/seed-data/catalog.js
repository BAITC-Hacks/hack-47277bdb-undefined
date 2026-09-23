'use strict';

// Synthetic fixtures only: model names illustrate a catalog, not a live inventory
// or verified manufacturer specifications. Prices are illustrative KZT amounts.
const cities = [
  ['almaty', 'Алматы', 'Алматы'],
  ['astana', 'Астана', 'Астана'],
  ['shymkent', 'Шымкент', 'Шымкент'],
  ['taraz', 'Тараз', 'Тараз'],
  ['atyrau', 'Атырау', 'Атырау'],
  ['aktau', 'Ақтау', 'Актау'],
  ['karaganda', 'Қарағанды', 'Караганда'],
  ['taldykorgan', 'Талдықорған', 'Талдыкорган'],
  ['oskemen', 'Өскемен', 'Усть-Каменогорск'],
].map(([slug, nameKk, nameRu], index) => ({ slug, nameKk, nameRu, pricePercent: [0, 2, -1, 1, 4, 5, 1, 2, 3][index] }));

const brands = [
  ['ekt', 'EKT'], ['iek', 'IEK'], ['schneider-electric', 'Schneider Electric'],
  ['legrand', 'Legrand'], ['chint', 'CHINT'], ['dekraft', 'DEKraft'], ['unit', 'UNIT'],
].map(([slug, name]) => ({ slug, name }));

const categoryGroups = [
  ['cables', 'Кабель / Сым', 'Кабель / Провод', [
    ['power-cables', 'Күштік кабельдер', 'Силовые кабели'],
    ['flexible-wires', 'Иілгіш сымдар', 'Гибкие провода'],
  ]],
  ['lighting', 'Шамдар / Жарықтандыру', 'Светильники / Лампы', [
    ['led-lamps', 'Жарықдиодты шамдар', 'Светодиодные лампы'],
    ['led-fixtures', 'Жарықдиодты жарықшамдар', 'Светодиодные светильники'],
  ]],
  ['low-voltage', 'Төмен вольтты аппаратура', 'Низковольтная аппаратура', [
    ['circuit-breakers', 'Модульдік автоматты ажыратқыштар', 'Модульные автоматические выключатели'],
    ['power-breakers', 'Күштік автоматты ажыратқыштар', 'Силовые автоматические выключатели'],
    ['rcd', 'УЗО', 'УЗО'],
    ['rcbo', 'Дифференциалды автоматтар', 'Дифференциальные автоматы'],
    ['contactors', 'Контакторлар', 'Контакторы'],
    ['relays', 'Релелер', 'Реле'],
  ]],
  ['cable-management', 'Кабель жүргізу жүйелері', 'Кабеленесущие системы', [
    ['cable-ducts', 'Кабель арналары', 'Кабель-каналы'],
    ['corrugated-conduits', 'Гофрланған құбырлар', 'Гофрированные трубы'],
    ['cable-trays', 'Кабель науалары', 'Кабельные лотки'],
  ]],
  ['mounting', 'Монтаж бұйымдары және құралдар', 'Изделия для монтажа и инструмент', [
    ['terminals', 'Клеммалар', 'Клеммы'],
    ['mounting-accessories', 'Монтаж керек-жарақтары', 'Монтажные аксессуары'],
  ]],
  ['other-equipment', 'Басқа жабдықтар', 'Прочее оборудование', [
    ['extension-leads', 'Ұзартқыштар', 'Удлинители'],
  ]],
  ['panels', 'Шкафтар / Қалқандар', 'Шкафы / Щиты', [
    ['modular-panels', 'Модульдік қалқандар', 'Модульные щиты'],
    ['metal-enclosures', 'Металл шкафтар', 'Металлические шкафы'],
  ]],
  ['sockets-switches', 'Розеткалар / Ажыратқыштар / Қораптар', 'Розетки / Выключатели / Коробки', [
    ['sockets', 'Розеткалар', 'Розетки'],
    ['switches', 'Ажыратқыштар', 'Выключатели'],
    ['junction-boxes', 'Тарату қораптары', 'Распределительные коробки'],
  ]],
  ['automation', 'Автоматтандыру', 'Автоматизация', [
    ['power-supplies', 'Қуат көздері', 'Блоки питания'],
    ['control-devices', 'Басқару құрылғылары', 'Устройства управления'],
  ]],
  ['security', 'Бейнебақылау / СКУД / Дабыл жүйелері', 'Видеонаблюдение / СКУД / Сигнализация', [
    ['video-surveillance', 'Бейнебақылау', 'Видеонаблюдение'],
    ['alarm-sensors', 'Дабыл датчиктері', 'Датчики сигнализации'],
  ]],
  ['tools', 'Құралдар / БӨА', 'Инструмент / КИП', [
    ['measurement-tools', 'Өлшеу құралдары', 'Измерительные приборы'],
  ]],
  ['electrician-basket', 'Электрик себеті', 'Корзина Электрика', [
    ['electrician-kits', 'Электрик жинақтары', 'Наборы электрика'],
  ]],
];

const categories = categoryGroups.flatMap(([slug, nameKk, nameRu, children], index) => [
  { slug, nameKk, nameRu, parentSlug: null, sortOrder: index },
  ...children.map(([childSlug, childKk, childRu], sortOrder) => ({
    slug: childSlug, nameKk: childKk, nameRu: childRu, parentSlug: slug, sortOrder,
  })),
]);

const definition = (type, nameKk, nameRu, unit = null) => ({ type, nameKk, nameRu, unit });
const attributeDefinitions = {
  rated_current: definition('NUMBER', 'Номиналды ток', 'Номинальный ток', 'A'),
  poles: definition('NUMBER', 'Полюстер саны', 'Количество полюсов'),
  rated_voltage: definition('NUMBER', 'Номиналды кернеу', 'Номинальное напряжение', 'V'),
  breaking_capacity: definition('NUMBER', 'Ажырату қабілеті', 'Отключающая способность', 'kA'),
  characteristic_curve: definition('SELECT', 'Іске қосылу сипаттамасы', 'Характеристика срабатывания'),
  ip_protection: definition('SELECT', 'Қорғаныс дәрежесі', 'Степень защиты'),
  residual_current: definition('NUMBER', 'Ағып кету тогы', 'Ток утечки', 'mA'),
  coil_voltage: definition('NUMBER', 'Катушка кернеуі', 'Напряжение катушки', 'V'),
  cores: definition('NUMBER', 'Талсымдар саны', 'Количество жил'),
  cross_section: definition('NUMBER', 'Талсым қимасы', 'Сечение жилы', 'mm²'),
  conductor_material: definition('SELECT', 'Өткізгіш материалы', 'Материал проводника'),
  insulation_material: definition('SELECT', 'Оқшаулау материалы', 'Материал изоляции'),
  flexibility: definition('SELECT', 'Иілгіштік класы', 'Класс гибкости'),
  halogen_free: definition('BOOLEAN', 'Галогенсіз', 'Без галогенов'),
  modules: definition('NUMBER', 'Модульдер саны', 'Количество модулей'),
  rows: definition('NUMBER', 'Қатарлар саны', 'Количество рядов'),
  installation_type: definition('SELECT', 'Монтаж түрі', 'Тип монтажа'),
  dimensions: definition('TEXT', 'Өлшемдері', 'Размеры', 'mm'),
  color: definition('SELECT', 'Түсі', 'Цвет'),
  power: definition('NUMBER', 'Қуат', 'Мощность', 'W'),
  voltage: definition('NUMBER', 'Жұмыс кернеуі', 'Рабочее напряжение', 'V'),
  color_temperature: definition('NUMBER', 'Түс температурасы', 'Цветовая температура', 'K'),
  base_type: definition('SELECT', 'Цоколь түрі', 'Тип цоколя'),
  dimmable: definition('BOOLEAN', 'Жарықтылықты реттеу', 'Диммирование'),
  material: definition('SELECT', 'Материал', 'Материал'),
  length: definition('NUMBER', 'Ұзындығы', 'Длина', 'm'),
  diameter: definition('NUMBER', 'Диаметрі', 'Диаметр', 'mm'),
  width: definition('NUMBER', 'Ені', 'Ширина', 'mm'),
  pack_quantity: definition('NUMBER', 'Қаптамадағы саны', 'Количество в упаковке'),
  output_voltage: definition('NUMBER', 'Шығыс кернеуі', 'Выходное напряжение', 'V'),
  resolution: definition('NUMBER', 'Ажыратымдылығы', 'Разрешение', 'MP'),
  wireless: definition('BOOLEAN', 'Сымсыз байланыс', 'Беспроводная связь'),
  measurement_range: definition('TEXT', 'Өлшеу диапазоны', 'Диапазон измерения'),
};

const product = (code, category, brand, nameKk, nameRu, basePrice, attributes, unit = 'pcs') => ({
  sku: `DEMO-${code.toUpperCase()}`, slug: `demo-${code.toLowerCase()}`, category, brand,
  nameKk, nameRu, basePrice, attributes, unit,
});

const breakers = [
  ['se-easy9-c10-1p', 'schneider-electric', 'Schneider Easy9', 10, 1, 4.5, 3800],
  ['se-easy9-c16-1p', 'schneider-electric', 'Schneider Easy9', 16, 1, 4.5, 4200],
  ['se-easy9-c25-2p', 'schneider-electric', 'Schneider Easy9', 25, 2, 4.5, 7800],
  ['se-acti9-c16-1p', 'schneider-electric', 'Schneider Acti9', 16, 1, 6, 6900],
  ['legrand-tx3-c16-1p', 'legrand', 'Legrand TX3', 16, 1, 6, 4500],
  ['legrand-tx3-c32-3p', 'legrand', 'Legrand TX3', 32, 3, 6, 13400],
  ['iek-ba47-c16-1p', 'iek', 'IEK ВА47-29', 16, 1, 4.5, 1600],
  ['iek-ba47-c25-2p', 'iek', 'IEK ВА47-29', 25, 2, 4.5, 3300],
  ['chint-nxb-c20-1p', 'chint', 'CHINT NXB', 20, 1, 6, 2100],
  ['chint-nxb-c40-3p', 'chint', 'CHINT NXB', 40, 3, 6, 7400],
  ['dekraft-ba101-c32-1p', 'dekraft', 'DEKraft ВА-101', 32, 1, 4.5, 1950],
  ['se-acti9-c63-4p', 'schneider-electric', 'Schneider Acti9', 63, 4, 10, 29900],
].map(([code, brand, model, current, poles, capacity, price]) => product(
  code, 'circuit-breakers', brand, `${model} C${current} ${poles}P автоматы (демо)`,
  `Автомат ${model} C${current} ${poles}P (демо)`, price,
  { rated_current: current, poles, rated_voltage: poles > 1 ? 400 : 230, breaking_capacity: capacity, characteristic_curve: 'C', ip_protection: 'IP20' },
));

const protectiveDevices = [
  product('chint-nm1-100-3p', 'power-breakers', 'chint', 'CHINT NM1 100 A 3P күштік автоматы (демо)', 'Силовой автомат CHINT NM1 100 A 3P (демо)', 32500,
    { rated_current: 100, poles: 3, rated_voltage: 400, breaking_capacity: 25, ip_protection: 'IP20' }),
  product('dekraft-va301-160-3p', 'power-breakers', 'dekraft', 'DEKraft ВА-301 160 A 3P күштік автоматы (демо)', 'Силовой автомат DEKraft ВА-301 160 A 3P (демо)', 48900,
    { rated_current: 160, poles: 3, rated_voltage: 400, breaking_capacity: 35, ip_protection: 'IP20' }),
  ...[
    ['iek-vd1-40-2p', 'rcd', 'iek', 'IEK ВД1', 40, 2, 30, 5900],
    ['legrand-rx3-63-4p', 'rcd', 'legrand', 'Legrand RX3', 63, 4, 100, 26500],
    ['chint-nxble-c16-2p', 'rcbo', 'chint', 'CHINT NXBLE', 16, 2, 30, 9800],
    ['se-easy9-c25-rcbo', 'rcbo', 'schneider-electric', 'Schneider Easy9', 25, 2, 30, 15700],
  ].map(([code, category, brand, model, current, poles, leakage, price]) => product(
    code, category, brand, `${model} ${current} A ${poles}P қорғаныс құрылғысы (демо)`,
    `${category === 'rcd' ? 'УЗО' : 'Дифавтомат'} ${model} ${current} A ${poles}P (демо)`, price,
    { rated_current: current, poles, rated_voltage: poles > 2 ? 400 : 230, residual_current: leakage, ip_protection: 'IP20', ...(category === 'rcbo' ? { breaking_capacity: 6, characteristic_curve: 'C' } : {}) },
  )),
];

const controlDevices = [
  ...[
    ['iek-kmi-25', 'iek', 'IEK КМИ', 25, 8900],
    ['chint-nxc-40', 'chint', 'CHINT NXC', 40, 15800],
    ['se-tesys-50', 'schneider-electric', 'Schneider TeSys', 50, 45900],
  ].map(([code, brand, model, current, price]) => product(
    code, 'contactors', brand, `${model} ${current} A контакторы (демо)`, `Контактор ${model} ${current} A (демо)`, price,
    { rated_current: current, poles: 3, rated_voltage: 400, coil_voltage: 230, ip_protection: 'IP20' },
  )),
  product('iek-voltage-relay-63', 'relays', 'iek', 'IEK 63 A кернеу релесі (демо)', 'Реле напряжения IEK 63 A (демо)', 14200,
    { rated_current: 63, rated_voltage: 230, modules: 2, ip_protection: 'IP20' }),
  product('chint-time-relay', 'relays', 'chint', 'CHINT уақыт релесі 16 A (демо)', 'Реле времени CHINT 16 A (демо)', 11900,
    { rated_current: 16, rated_voltage: 230, modules: 1, ip_protection: 'IP20' }),
  product('iek-thermal-relay-18', 'relays', 'iek', 'IEK 12–18 A жылулық релесі (демо)', 'Тепловое реле IEK 12–18 A (демо)', 6700,
    { rated_current: 18, poles: 3, rated_voltage: 400, measurement_range: '12–18 A', ip_protection: 'IP20' }),
];

const cables = [
  ['vvg-ls-3x1-5', 'ВВГнг-LS', 3, 1.5, 390, 'power-cables', '1'],
  ['vvg-ls-3x2-5', 'ВВГнг-LS', 3, 2.5, 610, 'power-cables', '1'],
  ['vvg-ls-3x4', 'ВВГнг-LS', 3, 4, 950, 'power-cables', '1'],
  ['vvg-ls-5x2-5', 'ВВГнг-LS', 5, 2.5, 1080, 'power-cables', '1'],
  ['vvg-ls-5x6', 'ВВГнг-LS', 5, 6, 2350, 'power-cables', '1'],
  ['pvs-2x1-5', 'ПВС', 2, 1.5, 295, 'flexible-wires', '5'],
  ['pvs-3x2-5', 'ПВС', 3, 2.5, 645, 'flexible-wires', '5'],
  ['pugv-1x6', 'ПуГВ', 1, 6, 465, 'flexible-wires', '5'],
].map(([code, model, cores, section, price, category, flexibility]) => product(
  code, category, 'ekt', `${model} ${cores}x${section} мыс кабелі (демо)`, `Кабель медный ${model} ${cores}x${section} (демо)`, price,
  { cores, cross_section: section, conductor_material: 'Cu', rated_voltage: category === 'power-cables' ? 660 : 380, insulation_material: 'PVC', flexibility, halogen_free: false }, 'm',
));

const panels = [
  ['ekt-panel-ip31-12', 'ekt', 12, 1, 'IP31', 'surface', '280x250x110', 7800, 'modular-panels'],
  ['ekt-panel-ip54-24', 'ekt', 24, 2, 'IP54', 'surface', '400x300x150', 17900, 'modular-panels'],
  ['ekt-panel-ip54-36', 'ekt', 36, 3, 'IP54', 'surface', '500x300x150', 23500, 'modular-panels'],
  ['iek-panel-ip40-18', 'iek', 18, 1, 'IP40', 'recessed', '410x250x100', 11300, 'modular-panels'],
  ['legrand-panel-ip40-24', 'legrand', 24, 2, 'IP40', 'recessed', '340x340x110', 28500, 'modular-panels'],
  ['ekt-steel-ip65-48', 'ekt', 48, 4, 'IP65', 'surface', '600x400x200', 47500, 'metal-enclosures'],
].map(([code, brand, modules, rows, ip, installation, dimensions, price, category]) => product(
  code, category, brand, `${brand.toUpperCase()} ${ip} ${modules} модульдік қалқан (демо)`,
  `Щит ${brand.toUpperCase()} ${ip} на ${modules} модулей (демо)`, price,
  { modules, rows, ip_protection: ip, installation_type: installation, dimensions },
));

const wiringDevices = [
  ['legrand-socket-white', 'sockets', 'legrand', 'Legrand 16 A ақ розетка', 'Розетка Legrand 16 A белая', 2950, 16, 'IP20', 'white', 'recessed'],
  ['se-socket-beige', 'sockets', 'schneider-electric', 'Schneider 16 A сарғыш розетка', 'Розетка Schneider 16 A бежевая', 3400, 16, 'IP20', 'beige', 'recessed'],
  ['iek-socket-ip44', 'sockets', 'iek', 'IEK IP44 қақпақты розетка', 'Розетка IEK IP44 с крышкой', 2600, 16, 'IP44', 'white', 'surface'],
  ['legrand-switch-1', 'switches', 'legrand', 'Legrand бір пернелі ажыратқыш', 'Выключатель Legrand одноклавишный', 2450, 10, 'IP20', 'white', 'recessed'],
  ['se-switch-2', 'switches', 'schneider-electric', 'Schneider екі пернелі ажыратқыш', 'Выключатель Schneider двухклавишный', 3650, 10, 'IP20', 'graphite', 'recessed'],
  ['iek-junction-ip54', 'junction-boxes', 'iek', 'IEK 100x100 тарату қорабы', 'Коробка распределительная IEK 100x100', 990, null, 'IP54', 'gray', 'surface'],
].map(([code, category, brand, kk, ru, price, current, ip, color, installation]) => product(
  code, category, brand, `${kk} (демо)`, `${ru} (демо)`, price,
  { ...(current ? { rated_current: current, rated_voltage: 230 } : { dimensions: '100x100x50' }), installation_type: installation, ip_protection: ip, color },
));

const lighting = [
  ['unit-led-e27-9w', 'led-lamps', 'UNIT', 9, 3000, 'E27', 650],
  ['unit-led-e27-12w', 'led-lamps', 'UNIT', 12, 4000, 'E27', 850],
  ['iek-led-e14-7w', 'led-lamps', 'IEK', 7, 2700, 'E14', 720],
  ['iek-panel-36w', 'led-fixtures', 'IEK', 36, 4000, 'integrated', 6900],
  ['unit-batten-18w', 'led-fixtures', 'UNIT', 18, 6500, 'integrated', 2950],
  ['iek-floodlight-50w', 'led-fixtures', 'IEK', 50, 4000, 'integrated', 9900],
].map(([code, category, brand, power, temperature, base, price]) => product(
  code, category, brand.toLowerCase(), `${brand} LED ${power} W ${temperature} K шамы (демо)`,
  `${category === 'led-lamps' ? 'Лампа' : 'Светильник'} ${brand} LED ${power} W ${temperature} K (демо)`, price,
  { power, voltage: 230, color_temperature: temperature, base_type: base, dimmable: false, ip_protection: code.includes('floodlight') ? 'IP65' : 'IP20' },
));

const accessories = [
  product('iek-psu-24v-60w', 'power-supplies', 'iek', 'IEK DIN 24 V 60 W қуат көзі (демо)', 'Блок питания IEK DIN 24 V 60 W (демо)', 12900,
    { power: 60, rated_voltage: 230, output_voltage: 24, installation_type: 'DIN', ip_protection: 'IP20' }),
  product('chint-psu-24v-120w', 'power-supplies', 'chint', 'CHINT DIN 24 V 120 W қуат көзі (демо)', 'Блок питания CHINT DIN 24 V 120 W (демо)', 19800,
    { power: 120, rated_voltage: 230, output_voltage: 24, installation_type: 'DIN', ip_protection: 'IP20' }),
  product('iek-button-green-22', 'control-devices', 'iek', 'IEK жасыл іске қосу түймесі 22 mm (демо)', 'Кнопка пуск IEK зеленая 22 mm (демо)', 1550,
    { rated_current: 10, rated_voltage: 230, diameter: 22, color: 'green', ip_protection: 'IP54' }),
  product('iek-duct-25x16', 'cable-ducts', 'iek', 'IEK 25x16 кабель арнасы 2 m (демо)', 'Кабель-канал IEK 25x16 2 m (демо)', 680,
    { dimensions: '25x16', length: 2, material: 'PVC', color: 'white' }),
  product('ekt-conduit-20', 'corrugated-conduits', 'ekt', 'EKT 20 mm гофрланған құбыр (демо)', 'Труба гофрированная EKT 20 mm (демо)', 120,
    { diameter: 20, material: 'PVC', color: 'gray', halogen_free: false }, 'm'),
  product('ekt-tray-100x50', 'cable-trays', 'ekt', 'EKT 100x50 мырышталған науа 3 m (демо)', 'Лоток EKT 100x50 оцинкованный 3 m (демо)', 5900,
    { dimensions: '100x50', width: 100, length: 3, material: 'galvanized-steel' }),
  product('iek-terminal-4', 'terminals', 'iek', 'IEK DIN 4 mm² клеммасы (демо)', 'Клемма IEK DIN 4 mm² (демо)', 290,
    { cross_section: 4, rated_current: 32, rated_voltage: 800, installation_type: 'DIN', color: 'gray' }),
  product('unit-cable-ties-200', 'mounting-accessories', 'unit', 'UNIT 200 mm кабель қамыты, 100 дана (демо)', 'Стяжки UNIT 200 mm, 100 шт. (демо)', 950,
    { length: 0.2, width: 3.6, pack_quantity: 100, material: 'nylon', color: 'black' }, 'pack'),
  product('ekt-din-rail-1m', 'mounting-accessories', 'ekt', 'EKT DIN рейкасы 35 mm, 1 m (демо)', 'DIN-рейка EKT 35 mm, 1 m (демо)', 690,
    { width: 35, length: 1, material: 'galvanized-steel' }),
  product('unit-extension-5m', 'extension-leads', 'unit', 'UNIT 5 m үш ұялы ұзартқыш (демо)', 'Удлинитель UNIT 5 m, 3 розетки (демо)', 4900,
    { length: 5, rated_current: 16, rated_voltage: 230, ip_protection: 'IP20', color: 'white' }),
  product('unit-ip-camera-4mp', 'video-surveillance', 'unit', 'UNIT 4 MP желілік камерасы (демо)', 'Камера сетевая UNIT 4 MP (демо)', 24500,
    { resolution: 4, voltage: 12, ip_protection: 'IP67', wireless: false }),
  product('unit-motion-sensor', 'alarm-sensors', 'unit', 'UNIT қозғалыс датчигі (демо)', 'Датчик движения UNIT (демо)', 3900,
    { voltage: 12, ip_protection: 'IP20', wireless: false }),
  product('unit-multimeter-600', 'measurement-tools', 'unit', 'UNIT 600 V сандық мультиметрі (демо)', 'Мультиметр цифровой UNIT 600 V (демо)', 8900,
    { rated_voltage: 600, measurement_range: '0–600 V AC/DC', ip_protection: 'IP20' }),
  product('unit-electrician-kit', 'electrician-kits', 'unit', 'UNIT электрик жинағы, 6 құрал (демо)', 'Набор электрика UNIT, 6 инструментов (демо)', 16900,
    { pack_quantity: 6, material: 'steel', color: 'red' }, 'set'),
];

const products = [...breakers, ...protectiveDevices, ...controlDevices, ...cables, ...panels, ...wiringDevices, ...lighting, ...accessories]
  .map((entry, index) => ({
    ...entry, isNew: index % 7 === 0, isSpecialOffer: index % 6 === 1,
    isPopular: index < 12 || index % 9 === 0, popularity: Math.max(5, 980 - index * 13),
  }));

module.exports = { cities, brands, categories, attributeDefinitions, products };
