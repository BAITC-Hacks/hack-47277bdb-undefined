const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { apiRateLimiter } = require('./middleware/rateLimit.middleware');
const languageMiddleware = require('./middleware/language.middleware');
const notFoundMiddleware = require('./middleware/notFound.middleware');
const errorMiddleware = require('./middleware/error.middleware');
const queryMiddleware = require('./middleware/query.middleware');
const { swaggerSpec, swaggerRouter } = require('./docs/swagger');

const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const cityRoutes = require('./modules/cities/city.routes');
const branchRoutes = require('./modules/branches/branch.routes');
const categoryRoutes = require('./modules/categories/category.routes');
const brandRoutes = require('./modules/brands/brand.routes');
const productRoutes = require('./modules/products/product.routes');
const catalogRoutes = require('./modules/catalog/catalog.routes');
const favoriteRoutes = require('./modules/favorites/favorite.routes');
const comparisonRoutes = require('./modules/comparison/comparison.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const orderRoutes = require('./modules/orders/order.routes');
const oneClickOrderRoutes = require('./modules/one-click-orders/oneClickOrder.routes');
const promotionRoutes = require('./modules/promotions/promotion.routes');
const newsRoutes = require('./modules/news/news.routes');
const faqRoutes = require('./modules/faqs/faq.routes');
const pageRoutes = require('./modules/pages/page.routes');
const requestRoutes = require('./modules/requests/request.routes');
const uploadRoutes = require('./modules/uploads/upload.routes');
const uploadAdminRoutes = require('./modules/uploads/upload.admin.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const assistantRoutes = require('./modules/assistant/assistant.routes');

const app = express();
const allowedOrigins = new Set([
  env.clientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}
app.use(queryMiddleware);
app.use(languageMiddleware);
app.use('/api', apiRateLimiter);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/products', productRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/comparison', comparisonRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/one-click-orders', oneClickOrderRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin/uploads', uploadAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/assistant', assistantRoutes);

app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
app.use('/api-docs', swaggerRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
