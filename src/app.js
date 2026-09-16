const express = require('express');
const {
  idFromParams,
  positiveInteger,
  validateOrder,
  validateListQuery,
  validateOrderQuery,
  validateProduct,
  validateUser,
  ValidationError
} = require('./validation');

function createCrudRouter(repository, resource, validate) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try { res.json(await repository.list(resource, validateListQuery(req.query))); } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try { res.json(await repository.findById(resource, idFromParams(req.params))); } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    try {
      const created = await repository.create(resource, validate(req.body || {}));
      res.status(201).location(`/api/${resource}/${created.id}`).json(created);
    } catch (error) { next(error); }
  });
  router.put('/:id', async (req, res, next) => {
    try {
      const updated = await repository.update(resource, idFromParams(req.params), validate(req.body || {}));
      res.json(updated);
    } catch (error) { next(error); }
  });
  router.patch('/:id', async (req, res, next) => {
    try {
      const updated = await repository.update(resource, idFromParams(req.params), validate(req.body || {}, true));
      res.json(updated);
    } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try { await repository.remove(resource, idFromParams(req.params)); res.status(204).send(); } catch (error) { next(error); }
  });
  return router;
}

function createApp(repository) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'pof-gas-api' }));
  app.use('/api/products', createCrudRouter(repository, 'products', validateProduct));
  app.use('/api/users', createCrudRouter(repository, 'users', validateUser));

  const orders = express.Router();
  orders.get('/', async (req, res, next) => {
    try { res.json(await repository.listOrders(validateOrderQuery(req.query))); } catch (error) { next(error); }
  });
  orders.get('/:id', async (req, res, next) => {
    try { res.json(await repository.findOrderById(idFromParams(req.params))); } catch (error) { next(error); }
  });
  orders.post('/', async (req, res, next) => {
    try {
      const created = await repository.createOrder(validateOrder(req.body || {}));
      res.status(201).location(`/api/orders/${created.id}`).json(created);
    } catch (error) { next(error); }
  });
  orders.put('/:id', async (req, res, next) => {
    try {
      const updated = await repository.updateOrder(idFromParams(req.params), validateOrder(req.body || {}));
      res.json(updated);
    } catch (error) { next(error); }
  });
  orders.delete('/:id', async (req, res, next) => {
    try { await repository.removeOrder(idFromParams(req.params)); res.status(204).send(); } catch (error) { next(error); }
  });
  app.use('/api/orders', orders);

  app.use((req, res) => res.status(404).json({ error: 'Risorsa non trovata' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'JSON non valido' });
    if (error instanceof ValidationError || (Number.isInteger(error.status) && error.status >= 400 && error.status < 500)) {
      return res.status(error.status || 400).json({ error: error.message });
    }
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Risorsa già esistente' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(422).json({ error: 'Una relazione indicata non esiste' });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Errore interno del server' });
  });
  return app;
}

module.exports = { createApp };
