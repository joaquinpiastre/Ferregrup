// Agrega los ítems de una venta/cotización como JSON, en el orden en que se cargaron
// (json_agg sin order by no garantiza ningún orden); el alias de la tabla de ítems debe ser `i`.
export const itemsJsonAgg = `
  coalesce(
    json_agg(
      json_build_object(
        'code', i.code,
        'description', i.description,
        'quantity', i.quantity,
        'unitPrice', i.unit_price,
        'subtotal', i.subtotal
      ) order by i.position
    ) filter (where i.id is not null),
    '[]'::json
  ) as items
`;

// Agrega las cuotas de una venta como JSON (subconsulta correlacionada, no depende
// de join/group by); el alias de la tabla `sales` en la consulta externa debe ser `s`.
export const installmentsJsonAgg = `
  coalesce(
    (select json_agg(
       json_build_object(
         'id', si.id,
         'number', si.number,
         'amount', si.amount,
         'dueDate', si.due_date,
         'paid', coalesce((select sum(pay.amount) from payments pay where pay.installment_id = si.id), 0)
       ) order by si.number
     )
     from sale_installments si where si.sale_id = s.id),
    '[]'::json
  ) as installments
`;
