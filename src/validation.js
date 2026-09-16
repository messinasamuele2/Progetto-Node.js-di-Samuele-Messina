const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;
const MAX_PAGE_SIZE = 100;

function requiredObject(value, field = 'body') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} deve essere un oggetto JSON`);
  }
  return value;
}

function requiredString(value, field, maxLength = 255) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new ValidationError(`${field} deve essere una stringa non vuota di massimo ${maxLength} caratteri`);
  }
  return value.trim();
}

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${field} deve essere un intero positivo`);
  }
  return parsed;
}

function idFromParams(params) {
  return positiveInteger(params.id, 'id');
}

function validateProduct(body, partial = false) {
  requiredObject(body);
  if (!partial || body.name !== undefined) return { name: requiredString(body.name, 'name', 150) };
  throw new ValidationError('specificare almeno un campo da aggiornare');
}

function validateUser(body, partial = false) {
  requiredObject(body);
  const result = {};
  if (!partial || body.firstName !== undefined) result.firstName = requiredString(body.firstName, 'firstName', 80);
  if (!partial || body.lastName !== undefined) result.lastName = requiredString(body.lastName, 'lastName', 80);
  if (!partial || body.email !== undefined) {
    result.email = requiredString(body.email, 'email', 254).toLowerCase();
    if (!emailPattern.test(result.email)) throw new ValidationError('email non valida');
  }
  if (partial && Object.keys(result).length === 0) throw new ValidationError('specificare almeno un campo da aggiornare');
  return result;
}

function validateRelationIds(value, field) {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationError(`${field} deve contenere almeno un id`);
  const ids = value.map((item) => positiveInteger(item, `${field}[]`));
  if (new Set(ids).size !== ids.length) throw new ValidationError(`${field} non può contenere id duplicati`);
  return ids;
}

function validateOrder(body) {
  requiredObject(body);
  return {
    productIds: validateRelationIds(body.productIds, 'productIds'),
    userIds: validateRelationIds(body.userIds, 'userIds')
  };
}

function positiveQueryInteger(value, field) {
  if (Array.isArray(value) || value === '') throw new ValidationError(`${field} non valido`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new ValidationError(`${field} deve essere un intero non negativo`);
  return parsed;
}

function validateListQuery(query = {}) {
  const limit = query.limit === undefined ? 100 : positiveQueryInteger(query.limit, 'limit');
  const offset = query.offset === undefined ? 0 : positiveQueryInteger(query.offset, 'offset');
  if (limit > MAX_PAGE_SIZE) throw new ValidationError(`limit non può superare ${MAX_PAGE_SIZE}`);
  return { limit, offset };
}

function validateDateFilter(value, field) {
  if (Array.isArray(value) || typeof value !== 'string' || !datePattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${field} deve essere una data ISO 8601 valida`);
  }
  return value;
}

function validateOrderQuery(query = {}) {
  const pagination = validateListQuery(query);
  const result = { ...pagination };
  if (query.createdFrom !== undefined) result.createdFrom = validateDateFilter(query.createdFrom, 'createdFrom');
  if (query.createdTo !== undefined) result.createdTo = validateDateFilter(query.createdTo, 'createdTo');
  if (result.createdFrom && result.createdTo && Date.parse(result.createdFrom) > Date.parse(result.createdTo)) {
    throw new ValidationError('createdFrom non può essere successivo a createdTo');
  }
  if (query.productId !== undefined) result.productId = positiveQueryInteger(query.productId, 'productId');
  return result;
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 422;
  }
}

module.exports = {
  ValidationError,
  idFromParams,
  validateProduct,
  validateUser,
  validateOrder,
  validateListQuery,
  validateOrderQuery,
  positiveInteger
};
