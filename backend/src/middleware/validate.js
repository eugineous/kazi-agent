'use strict';
const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json({ error: `Validation failed: ${errors}` });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
