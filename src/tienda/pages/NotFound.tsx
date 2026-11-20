import { useEffect } from 'react';
import { Link } from '../router';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Página no encontrada · El Maná Distribuidora';
  }, []);
  return (
    <div className="tn-wrap tn-page">
      <div className="tn-empty">
        <h1>No encontramos lo que buscabas</h1>
        <p>Puede que el producto ya no esté publicado. Probá buscarlo o mirá las categorías.</p>
        <Link to="/productos" className="tn-btn primary">
          Ver todos los productos
        </Link>
      </div>
    </div>
  );
}
