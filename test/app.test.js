const assert = require('node:assert/strict');
const test = require('node:test');
const sinon = require('sinon');
const request = require('supertest');
const { createApp } = require('../src/app');

class FakeRepository {
  constructor() {
    this.products = [];
    this.users = [];
    this.orders = [];
    this.next = 1;
  }
  list(resource) { return this[resource]; }
  findById(resource, id) {
    const item = this[resource].find((entry) => entry.id === id);
    if (!item) { const error = new Error('not found'); error.code = 'NOT_FOUND'; throw error; }
    return item;
  }
  create(resource, data) { const item = { id: this.next++, ...data }; this[resource].push(item); return item; }
  update(resource, id, data) { const item = this.findById(resource, id); Object.assign(item, data); return item; }
  remove(resource, id) { this.findById(resource, id); this[resource] = this[resource].filter((entry) => entry.id !== id); }
  listOrders(query) {
    if (query.productId) return this.orders.filter((order) => order.productIds.includes(Number(query.productId)));
    return this.orders;
  }
  findOrderById(id) { return this.orders.find((order) => order.id === id) || (() => { const error = new Error('not found'); error.code = 'NOT_FOUND'; throw error; })(); }
  createOrder(data) { const order = { id: this.next++, createdAt: new Date().toISOString(), ...data }; this.orders.push(order); return order; }
  updateOrder(id, data) { const order = this.findOrderById(id); Object.assign(order, data); return order; }
  removeOrder(id) { this.findOrderById(id); this.orders = this.orders.filter((order) => order.id !== id); }
}

test('crea un prodotto e rispetta il contratto REST', async () => {
  const repository = new FakeRepository();
  const app = createApp(repository);
  const response = await request(app).post('/api/products').send({ name: 'Pasta di legumi' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.location, '/api/products/1');
  assert.equal(response.body.name, 'Pasta di legumi');
});

test('rifiuta dati non validi con 422 senza chiamare il repository', async () => {
  const repository = new FakeRepository();
  const createSpy = sinon.spy(repository, 'create');
  const app = createApp(repository);
  const response = await request(app).post('/api/users').send({ firstName: 'Ada', email: 'non-email' });
  assert.equal(response.status, 422);
  assert.equal(createSpy.called, false);
});

test('crea, filtra e cancella un ordine', async () => {
  const repository = new FakeRepository();
  const app = createApp(repository);
  const created = await request(app).post('/api/orders').send({ productIds: [3, 4], userIds: [7] });
  assert.equal(created.status, 201);
  const filtered = await request(app).get('/api/orders?productId=3');
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.length, 1);
  const deleted = await request(app).delete(`/api/orders/${created.body.id}`);
  assert.equal(deleted.status, 204);
  assert.equal(deleted.text, '');
});

test('impedisce id duplicati nelle relazioni dell’ordine', async () => {
  const repository = new FakeRepository();
  const createOrderStub = sinon.stub(repository, 'createOrder');
  const app = createApp(repository);
  const response = await request(app).post('/api/orders').send({ productIds: [1, 1], userIds: [2] });
  assert.equal(response.status, 422);
  assert.equal(createOrderStub.called, false);
});

test('restituisce 404 per una risorsa inesistente', async () => {
  const app = createApp(new FakeRepository());
  const response = await request(app).get('/api/products/999');
  assert.equal(response.status, 404);
});

test('rifiuta paginazione oltre il limite e filtri ordine non validi', async () => {
  const repository = new FakeRepository();
  const listSpy = sinon.spy(repository, 'listOrders');
  const app = createApp(repository);

  const page = await request(app).get('/api/products?limit=101');
  const filter = await request(app).get('/api/orders?productId=abc');

  assert.equal(page.status, 422);
  assert.equal(filter.status, 422);
  assert.equal(listSpy.called, false);
});

test('rifiuta PATCH vuoti e JSON malformato senza arrivare al repository', async () => {
  const repository = new FakeRepository();
  const updateSpy = sinon.spy(repository, 'update');
  const app = createApp(repository);

  const emptyPatch = await request(app).patch('/api/products/1').send({});
  const malformed = await request(app)
    .post('/api/products')
    .set('content-type', 'application/json')
    .send('{"name":');

  assert.equal(emptyPatch.status, 422);
  assert.equal(malformed.status, 400);
  assert.equal(updateSpy.called, false);
});
