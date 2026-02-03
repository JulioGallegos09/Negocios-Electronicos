function validateInteraccion(body) {
  const errors = [];
  const tipos = ["llamada","correo","reunion","whatsapp","compra","tiktok"];

  if (!body.cliente_id) errors.push("cliente_id requerido");
  if (!body.tipo || !tipos.includes(body.tipo)) errors.push("tipo inválido");
  if (!body.descripcion || body.descripcion.trim().length < 3) errors.push("descripcion requerida");

  return errors;
}

module.exports = { validateInteraccion };
