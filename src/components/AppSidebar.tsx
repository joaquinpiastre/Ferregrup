import { useState } from 'react';
import { ChevronRight, LogOut, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SidebarLink {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface SidebarSection {
  /** Sin título: los links se muestran siempre, arriba de los grupos plegables. */
  label?: string;
  links: SidebarLink[];
}

interface Props {
  brand?: string;
  tagline?: string;
  sections: SidebarSection[];
  activeId: string;
  onNavigate: (id: string) => void;
  userLabel: string;
  onLogout: () => void;
  footer?: string;
}

export default function AppSidebar({
  brand = 'EL MANÁ',
  tagline = 'Sistema de Gestión',
  sections,
  activeId,
  onNavigate,
  userLabel,
  onLogout,
  footer = 'v1.1.0 · El Maná Distribuidora © 2026',
}: Props) {
  const [open, setOpen] = useState(false);
  const activeGroup = sections.findIndex((s) => s.links.some((l) => l.id === activeId));
  // Grupos plegables: siempre está abierto el de la pantalla actual, más (como mucho) uno
  // que el usuario abra a mano. Así el menú nunca se vuelve una lista larga.
  const [expanded, setExpanded] = useState<number | null>(null);

  function navigate(id: string, groupIndex: number) {
    onNavigate(id);
    setExpanded(groupIndex);
    setOpen(false);
  }

  function toggle(groupIndex: number) {
    if (groupIndex === activeGroup) return;
    setExpanded((prev) => (prev === groupIndex ? null : groupIndex));
  }

  const renderLink = ({ id, label, icon: Icon }: SidebarLink, groupIndex: number) => {
    const active = activeId === id;
    return (
      <button key={id} className={`nav-link${active ? ' active' : ''}`} onClick={() => navigate(id, groupIndex)}>
        <Icon size={15} />
        {label}
      </button>
    );
  };

  return (
    <>
      <div className="mobile-topbar">
        <button onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
        <img src="/mana-logo.png" alt={brand} style={{ height: 26, width: 'auto' }} />
      </div>
      <div className={`sidebar-backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`app-sidebar${open ? ' open' : ''}`} style={{
        background: '#0a0a0a',
        borderRight: '1px solid #1e1e1e',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <button onClick={() => setOpen(false)} className="sidebar-close" aria-label="Cerrar menú"><X size={18} /></button>
        {/* Logo */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
          <img src="/mana-logo.png" alt="El Maná Distribuidora" style={{ display: 'block', width: '100%', maxWidth: 128, height: 'auto' }} />
          <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 7 }}>{tagline}</div>
        </div>

        <nav style={{ padding: '8px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sections.map((section, gi) => {
            if (!section.label) {
              return (
                <div key={`top-${gi}`} style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingBottom: 6, marginBottom: 2, borderBottom: '1px solid #161616' }}>
                  {section.links.map((l) => renderLink(l, gi))}
                </div>
              );
            }
            const isActiveGroup = gi === activeGroup;
            const isOpen = isActiveGroup || gi === expanded;
            return (
              <div key={section.label}>
                <button
                  className={`nav-group${isActiveGroup ? ' current' : ''}`}
                  onClick={() => toggle(gi)}
                  aria-expanded={isOpen}
                >
                  <ChevronRight size={12} className="nav-group-chevron" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                  <span style={{ flex: 1 }}>{section.label}</span>
                  {!isOpen && <span className="nav-group-count">{section.links.length}</span>}
                </button>
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '1px 0 6px' }}>
                    {section.links.map((l) => renderLink(l, gi))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid #1a1a1a', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userLabel}</span>
            <button
              onClick={onLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', display: 'flex', padding: 4 }}
            >
              <LogOut size={14} />
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#333', textAlign: 'center' }}>{footer}</div>
        </div>
      </aside>
    </>
  );
}
