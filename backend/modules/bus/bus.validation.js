const Joi = require("joi");

const objectId = Joi.string().trim().regex(/^[a-f\d]{24}$/i);

const createBusSchema = Joi.object({
  name: Joi.string().trim().required(),
  vehicleNumber: Joi.string().trim().allow("", null),
  phone: Joi.string().trim().allow("", null),
  busTypes: Joi.array().items(Joi.string().trim()).min(1),
  busCategory: Joi.string().trim(),
  type: Joi.string().trim(),
  totalSeats: Joi.number().integer().min(1),
  decks: Joi.array().items(Joi.object()),
  operator: objectId,
  operatorEmail: Joi.string().email(),
}).unknown(true);

const updateBusSchema = Joi.object({
  name: Joi.string().trim(),
  vehicleNumber: Joi.string().trim().allow("", null),
  phone: Joi.string().trim().allow("", null),
  busTypes: Joi.array().items(Joi.string().trim()).min(1),
  busCategory: Joi.string().trim(),
  type: Joi.string().trim(),
  totalSeats: Joi.number().integer().min(1),
  decks: Joi.array().items(Joi.object()),
  operator: objectId.allow("", null),
  operatorEmail: Joi.string().email().allow("", null),
}).unknown(true);

const assignOperatorSchema = Joi.object({
  operator: objectId.allow("", null),
  operatorEmail: Joi.string().email().allow("", null),
}).unknown(true);

const operatorUpdateSchema = Joi.object({
  name: Joi.string().trim(),
  type: Joi.string().trim(),
  busTypes: Joi.array().items(Joi.string().trim()).min(1),
  phone: Joi.string().trim().allow("", null),
}).unknown(true);

module.exports = {
  createBusSchema,
  updateBusSchema,
  assignOperatorSchema,
  operatorUpdateSchema,
};
