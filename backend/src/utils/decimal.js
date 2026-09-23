const { Prisma } = require('@prisma/client');

const toDecimal = (value) => new Prisma.Decimal(value);
const decimalToNumber = (value) => Number(value);
const addMoney = (left, right) => toDecimal(left).add(toDecimal(right));
const multiplyMoney = (price, quantity) => toDecimal(price).mul(quantity);

module.exports = { toDecimal, decimalToNumber, addMoney, multiplyMoney };
