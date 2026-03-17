'use strict';

const Joi = require('joi');

const registrationSchema = Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).max(72).required(),
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

const betSchema = Joi.object({
    type: Joi.string().valid('PLACE_BET').required(),
    betId: Joi.string().min(1).max(100).required(),
    area: Joi.string().valid('dragon', 'tiger', 'tie').required(),
    amount: Joi.number().positive().required(),
    timestamp: Joi.number().integer().required(),
});

const depositSchema = Joi.object({
    amount: Joi.number().positive().max(100000).required(),
});

function validateRegistration(data) {
    return registrationSchema.validate(data);
}

function validateLogin(data) {
    return loginSchema.validate(data);
}

function validateBetMessage(data) {
    return betSchema.validate(data);
}

function validateDeposit(data) {
    return depositSchema.validate(data);
}

module.exports = { validateRegistration, validateLogin, validateBetMessage, validateDeposit };
