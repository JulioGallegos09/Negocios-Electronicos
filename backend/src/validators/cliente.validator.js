function validateCliente(body) {
  const errors = [];

  if (!body.nombre || body.nombre.trim().length < 2) errors.push("nombre inválido");
  if (!body.correo || !body.correo.includes("@")) errors.push("correo inválido");

  if (body.telefono && body.telefono.length < 7) errors.push("telefono inválido");

  return errors;
}

module.exports = { validateCliente };
