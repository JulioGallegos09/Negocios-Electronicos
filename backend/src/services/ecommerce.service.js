const ESTADOS_PROMO_ACTIVOS = new Set(["activa", "activo", "vigente", "1"]);

function normalizeComparableText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/s$/, "");
}

function nowIso() {
  return new Date().toISOString();
}

function getStock(producto) {
  return Number(producto?.stock_actual ?? producto?.stock ?? 0);
}

function getClienteByUser(db, user) {
  if (!user?.email) return null;

  return db.prepare(`
    SELECT *
    FROM clientes
    WHERE lower(correo) = lower(?)
  `).get(user.email);
}

function ensureClienteForUser(db, user) {
  let cliente = getClienteByUser(db, user);
  if (cliente) return cliente;

  const nombre = String(user?.nombre || user?.email || "Cliente").trim();
  const correo = String(user?.email || "").trim();

  if (!correo) {
    throw new Error("No fue posible asociar un cliente al usuario autenticado");
  }

  const result = db.prepare(`
    INSERT INTO clientes
      (nombre, correo, telefono, direccion, empresa, fecha_registro, estado, etapa_crm)
    VALUES (?, ?, '', '', '', ?, 'activo', 'Activo')
  `).run(nombre, correo, nowIso());

  cliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(result.lastInsertRowid);
  return cliente;
}

function getOrCreateOpenCart(db, clienteId) {
  let carrito = db.prepare(`
    SELECT *
    FROM carritos
    WHERE cliente_id = ? AND estado = 'abierto'
    ORDER BY id DESC
    LIMIT 1
  `).get(clienteId);

  if (carrito) return carrito;

  const createdAt = nowIso();
  const result = db.prepare(`
    INSERT INTO carritos (cliente_id, estado, fecha_creacion, fecha_actualizacion)
    VALUES (?, 'abierto', ?, ?)
  `).run(clienteId, createdAt, createdAt);

  carrito = db.prepare("SELECT * FROM carritos WHERE id = ?").get(result.lastInsertRowid);
  return carrito;
}

function getActiveTaxes(db) {
  return db.prepare(`
    SELECT *
    FROM impuestos
    WHERE estado = 1
    ORDER BY id ASC
  `).all();
}

function getActivePromotions(db, at = new Date()) {
  const iso = at.toISOString();
  return db.prepare(`
    SELECT *
    FROM promociones
    WHERE lower(estado) IN ('activa', 'activo', 'vigente')
      AND fecha_inicio <= ?
      AND fecha_fin >= ?
    ORDER BY valor DESC, id DESC
  `).all(iso, iso);
}

function promotionMatchesProduct(promo, producto) {
  if (!promo || !producto) return false;

  const categoriaPromo = normalizeComparableText(promo.categoria_objetivo);
  const categoriaProducto = normalizeComparableText(producto.categoria);
  const categoriaCatalogo = normalizeComparableText(producto.categoria_nombre);
  const targetProductId = Number(producto.producto_id ?? producto.id ?? 0);
  const isFeaturedOnly = Number(promo.solo_destacados) === 1;
  const isProductMatch = promo.producto_id && Number(promo.producto_id) === targetProductId;
  const isCategoryMatch = categoriaPromo && (categoriaPromo === categoriaProducto || categoriaPromo === categoriaCatalogo);
  const isFeaturedMatch = isFeaturedOnly ? Number(producto.destacado) === 1 : true;

  if (promo.producto_id && !isProductMatch) return false;
  if (categoriaPromo && !isCategoryMatch) return false;
  if (!isFeaturedMatch) return false;

  if (promo.producto_id || categoriaPromo || isFeaturedOnly) {
    return true;
  }

  return true;
}

function computePromotionForProduct(producto, promociones = [], basePrice = null) {
  const precioBase = Number(basePrice ?? producto?.costo_unitario ?? producto?.precio ?? 0);
  if (precioBase <= 0) {
    return {
      precioBase,
      precioFinal: 0,
      descuentoUnitario: 0,
      promocion: null
    };
  }

  let best = null;

  for (const promo of promociones) {
    const estado = String(promo?.estado || "").trim().toLowerCase();
    if (promo && estado && !ESTADOS_PROMO_ACTIVOS.has(estado)) continue;
    if (!promotionMatchesProduct(promo, producto)) continue;

    const tipo = String(promo.tipo_descuento || "porcentaje").trim().toLowerCase();
    const valor = Number(promo.valor || 0);
    let descuento = 0;

    if (tipo === "monto_fijo" || tipo === "monto") {
      descuento = Math.min(precioBase, valor);
    } else {
      descuento = precioBase * (Math.max(0, valor) / 100);
    }

    descuento = Number(descuento.toFixed(2));

    if (!best || descuento > best.descuentoUnitario) {
      best = {
        precioBase,
        precioFinal: Number(Math.max(0, precioBase - descuento).toFixed(2)),
        descuentoUnitario: descuento,
        promocion: {
          id: promo.id,
          nombre: promo.nombre,
          descripcion: promo.descripcion,
          tipo_descuento: promo.tipo_descuento,
          valor: Number(promo.valor || 0)
        }
      };
    }
  }

  return best || {
    precioBase,
    precioFinal: Number(precioBase.toFixed(2)),
    descuentoUnitario: 0,
    promocion: null
  };
}

function getCartItemsDetailed(db, carritoId, promociones = []) {
  const rows = db.prepare(`
    SELECT
      cd.id,
      cd.carrito_id,
      cd.producto_id,
      cd.cantidad,
      cd.precio_unitario,
      p.nombre,
      p.descripcion,
      p.categoria,
      cat.nombre AS categoria_nombre,
      p.costo_unitario,
      p.stock_actual,
      p.stock,
      p.stock_minimo,
      p.sku,
      p.imagen_url,
      p.estado,
      p.destacado
    FROM carrito_detalle cd
    JOIN productos p ON p.id = cd.producto_id
    LEFT JOIN categorias cat ON cat.id = p.categoria_id
    WHERE cd.carrito_id = ?
    ORDER BY cd.id DESC
  `).all(carritoId);

  return rows.map(row => {
    const promo = computePromotionForProduct(row, promociones, row.precio_unitario || row.costo_unitario);
    const cantidad = Number(row.cantidad || 0);
    const subtotalBase = Number((promo.precioBase * cantidad).toFixed(2));
    const descuentoTotal = Number((promo.descuentoUnitario * cantidad).toFixed(2));
    const subtotalFinal = Number((promo.precioFinal * cantidad).toFixed(2));

    return {
      id: row.id,
      carrito_id: row.carrito_id,
      producto_id: row.producto_id,
      cantidad,
      nombre: row.nombre,
      descripcion: row.descripcion,
      categoria: row.categoria,
      categoria_nombre: row.categoria_nombre || row.categoria,
      sku: row.sku,
      imagen_url: row.imagen_url,
      estado: row.estado,
      destacado: Number(row.destacado || 0),
      stock_actual: getStock(row),
      stock_minimo: Number(row.stock_minimo || 0),
      precio_lista: promo.precioBase,
      descuento_unitario: promo.descuentoUnitario,
      precio_final: promo.precioFinal,
      subtotal_base: subtotalBase,
      descuento_total: descuentoTotal,
      subtotal_final: subtotalFinal,
      promocion: promo.promocion
    };
  });
}

function summarizeCartForCliente(db, clienteId) {
  const carrito = getOrCreateOpenCart(db, clienteId);
  const promociones = getActivePromotions(db);
  const impuestos = getActiveTaxes(db);
  const items = getCartItemsDetailed(db, carrito.id, promociones);

  const subtotal = Number(items.reduce((acc, item) => acc + item.subtotal_base, 0).toFixed(2));
  const descuento_total = Number(items.reduce((acc, item) => acc + item.descuento_total, 0).toFixed(2));
  const subtotal_con_descuento = Number((subtotal - descuento_total).toFixed(2));

  const impuestosAplicados = impuestos.map(impuesto => {
    const porcentaje = Number(impuesto.porcentaje || 0);
    const monto = Number((subtotal_con_descuento * (porcentaje / 100)).toFixed(2));
    return {
      id: impuesto.id,
      nombre: impuesto.nombre,
      porcentaje,
      monto
    };
  });

  const impuesto_total = Number(impuestosAplicados.reduce((acc, impuesto) => acc + impuesto.monto, 0).toFixed(2));
  const total = Number((subtotal_con_descuento + impuesto_total).toFixed(2));
  const items_count = items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
  const promociones_aplicadas = Array.from(new Map(
    items
      .filter(item => item.promocion)
      .map(item => [item.promocion.id, {
        ...item.promocion,
        ahorro_total: Number(items
          .filter(candidate => candidate.promocion?.id === item.promocion.id)
          .reduce((acc, candidate) => acc + Number(candidate.descuento_total || 0), 0)
          .toFixed(2))
      }])
  ).values());

  return {
    carrito: {
      id: carrito.id,
      cliente_id: carrito.cliente_id,
      estado: carrito.estado,
      fecha_creacion: carrito.fecha_creacion,
      fecha_actualizacion: carrito.fecha_actualizacion
    },
    items,
    promociones: promociones.map(promo => ({
      id: promo.id,
      nombre: promo.nombre,
      descripcion: promo.descripcion,
      tipo_descuento: promo.tipo_descuento,
      valor: Number(promo.valor || 0),
      fecha_inicio: promo.fecha_inicio,
      fecha_fin: promo.fecha_fin,
      categoria_objetivo: promo.categoria_objetivo || "",
      producto_id: promo.producto_id ?? null,
      solo_destacados: Number(promo.solo_destacados || 0)
    })),
    promociones_aplicadas,
    impuestos: impuestosAplicados,
    resumen: {
      items_count,
      subtotal,
      descuento_total,
      subtotal_con_descuento,
      impuesto_total,
      total
    }
  };
}

module.exports = {
  computePromotionForProduct,
  ensureClienteForUser,
  getActivePromotions,
  getActiveTaxes,
  getCartItemsDetailed,
  getClienteByUser,
  getOrCreateOpenCart,
  getStock,
  nowIso,
  summarizeCartForCliente
};
