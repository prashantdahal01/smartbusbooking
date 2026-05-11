const Joi = require("joi");

const objectId = Joi.string().trim().regex(/^[a-f\d]{24}$/i);

const busTypesSchema = Joi.alternatives().try(
  Joi.array().items(Joi.string().trim()).min(1),
  Joi.string().trim().min(1)
);

const decksSchema = Joi.alternatives().try(
  Joi.array().items(Joi.object()).min(1),
  Joi.string().trim().min(1)
);

const createBusSchema = Joi.object({
  name: Joi.string().trim().required(),
  vehicleNumber: Joi.string().trim().allow("", null),
  phone: Joi.string().trim().allow("", null),
  busTypes: busTypesSchema,
  busCategory: Joi.string().trim(),
  type: Joi.string().trim(),
  totalSeats: Joi.number().integer().min(1),
  decks: decksSchema,
  operator: objectId,
  operatorEmail: Joi.string().email(),
}).unknown(true);

const updateBusSchema = Joi.object({
  name: Joi.string().trim(),
  vehicleNumber: Joi.string().trim().allow("", null),
  phone: Joi.string().trim().allow("", null),
  busTypes: busTypesSchema,
  busCategory: Joi.string().trim(),
  type: Joi.string().trim(),
  totalSeats: Joi.number().integer().min(1),
  decks: decksSchema,
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
  busTypes: busTypesSchema,
  phone: Joi.string().trim().allow("", null),
}).unknown(true);

module.exports = {
  createBusSchema,
  updateBusSchema,
  assignOperatorSchema,
  operatorUpdateSchema,
};
