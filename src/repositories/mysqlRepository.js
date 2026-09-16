const mysql = require('mysql2/promise');
const RESOURCE_META = Object.freeze({
  products: { table: 'products', columns: 'id, name, created_at AS createdAt, updated_at AS updatedAt' },
  users: { table: 'users', columns: 'id, first_name AS firstName, last_name AS lastName, email, created_at AS createdAt, updated_at AS updatedAt' }
});

const ORDER_SELECT = `o.id, o.created_at AS createdAt, o.updated_at AS updatedAt,
  COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id', p.id, 'name', p.name))
    FROM order_products op JOIN products p ON p.id = op.product_id WHERE op.order_id = o.id), JSON_ARRAY()) AS products,
  COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'firstName', u.first_name, 'lastName', u.last_name, 'email', u.email))
    FROM order_users ou JOIN users u ON u.id = ou.user_id WHERE ou.order_id = o.id), JSON_ARRAY()) AS users`;

class NotFoundError extends Error {
  constructor(resource, id) { super(`${resource} con id ${id} non trovato`); this.code = 'NOT_FOUND'; this.status = 404; }
}

function placeholders(values) { return values.map(() => '?').join(', '); }

class MysqlRepository {
  constructor(config) {
    this.pool = mysql.createPool({ ...config, connectionLimit: config.connectionLimit || 10, waitForConnections: true, multipleStatements: false });
  }

  async list(resource, { limit = 100, offset = 0 } = {}) {
    const meta = this.resourceMeta(resource);
    const [rows] = await this.pool.execute(`SELECT ${meta.columns} FROM ${meta.table} ORDER BY id LIMIT ? OFFSET ?`, [limit, offset]);
    return rows;
  }

  async findById(resource, id) {
    const meta = this.resourceMeta(resource);
    const [rows] = await this.pool.execute(`SELECT ${meta.columns} FROM ${meta.table} WHERE id = ?`, [id]);
    if (!rows[0]) throw new NotFoundError(resource, id);
    return rows[0];
  }

  async create(resource, data) {
    const meta = this.resourceMeta(resource);
    const columns = resource === 'products' ? ['name'] : ['first_name', 'last_name', 'email'];
    const values = resource === 'products' ? [data.name] : [data.firstName, data.lastName, data.email];
    const [result] = await this.pool.execute(`INSERT INTO ${meta.table} (${columns.join(', ')}) VALUES (${placeholders(values)})`, values);
    return this.findById(resource, result.insertId);
  }

  async update(resource, id, data) {
    const meta = this.resourceMeta(resource);
    const found = await this.findById(resource, id);
    const fields = resource === 'products' ? { name: data.name ?? found.name } : {
      first_name: data.firstName ?? found.firstName, last_name: data.lastName ?? found.lastName, email: data.email ?? found.email
    };
    const values = Object.values(fields);
    await this.pool.execute(`UPDATE ${meta.table} SET ${Object.keys(fields).map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, [...values, id]);
    return this.findById(resource, id);
  }

  async remove(resource, id) {
    const meta = this.resourceMeta(resource);
    await this.findById(resource, id);
    await this.pool.execute(`DELETE FROM ${meta.table} WHERE id = ?`, [id]);
  }

  resourceMeta(resource) {
    const meta = RESOURCE_META[resource];
    if (!meta) throw new Error('Risorsa non supportata');
    return meta;
  }

  async listOrders({ limit = 100, offset = 0, createdFrom, createdTo, productId } = {}) {
    const where = [];
    const params = [];
    if (createdFrom) { where.push('o.created_at >= ?'); params.push(createdFrom); }
    if (createdTo) { where.push('o.created_at <= ?'); params.push(createdTo); }
    if (productId) { where.push('EXISTS (SELECT 1 FROM order_products fp WHERE fp.order_id = o.id AND fp.product_id = ?)'); params.push(productId); }
    const sql = `SELECT ${ORDER_SELECT} FROM orders o ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`;
    const [rows] = await this.pool.execute(sql, [...params, limit, offset]);
    return rows.map(parseOrder);
  }

  async findOrderById(id) {
    const [rows] = await this.pool.execute(`SELECT ${ORDER_SELECT} FROM orders o WHERE o.id = ?`, [id]);
    if (!rows[0]) throw new NotFoundError('orders', id);
    return parseOrder(rows[0]);
  }

  async createOrder(data) { return this.saveOrder(null, data); }

  async updateOrder(id, data) { await this.findOrderById(id); return this.saveOrder(id, data); }

  async saveOrder(id, data) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      let orderId = id;
      if (id) await connection.execute('UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      else { const [result] = await connection.execute('INSERT INTO orders () VALUES ()'); orderId = result.insertId; }
      if (id) {
        await connection.execute('DELETE FROM order_products WHERE order_id = ?', [orderId]);
        await connection.execute('DELETE FROM order_users WHERE order_id = ?', [orderId]);
      }
      await connection.query(`INSERT INTO order_products (order_id, product_id) VALUES ${data.productIds.map(() => '(?, ?)').join(', ')}`, data.productIds.flatMap((productId) => [orderId, productId]));
      await connection.query(`INSERT INTO order_users (order_id, user_id) VALUES ${data.userIds.map(() => '(?, ?)').join(', ')}`, data.userIds.flatMap((userId) => [orderId, userId]));
      await connection.commit();
      return this.findOrderById(orderId);
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }

  async removeOrder(id) { await this.findOrderById(id); await this.pool.execute('DELETE FROM orders WHERE id = ?', [id]); }
  async close() { await this.pool.end(); }
}

function parseOrder(order) {
  try {
    return {
      ...order,
      products: typeof order.products === 'string' ? JSON.parse(order.products) : order.products,
      users: typeof order.users === 'string' ? JSON.parse(order.users) : order.users
    };
  } catch (error) {
    throw new Error('Risposta JSON non valida dal database', { cause: error });
  }
}

module.exports = { MysqlRepository };
