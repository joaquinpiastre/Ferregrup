// Agrega los ítems de una venta/cotización como JSON; el alias de la tabla de ítems debe ser `i`.
export const itemsJsonAgg = `
  coalesce(
    json_agg(
      json_build_object(
        'code', i.code,
        'description', i.description,
        'quantity', i.quantity,
        'unitPrice', i.unit_price,
        'subtotal', i.subtotal
      )
    ) filter (where i.id is not null),
    '[]'::json
  ) as items
`;
