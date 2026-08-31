import { useState } from 'react';
import { Wrench, Menu, X, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SidebarLink {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface SidebarSection {
  label: string;
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
  brand = 'FERREGRUP',
  tagline = 'Sistema de Gestión',
  sections,
  activeId,
  onNavigate,
  userLabel,
  onLogout,
  footer = 'v1.1.0 · FERREGRUP © 2026',
}: Props) {
  const [open, setOpen] = useState(false);

  function navigate(id: string) {
    onNavigate(id);
    setOpen(false);
  }

  return (
    <>
      <div className="mobile-topbar">
        <button onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#FFE000', letterSpacing: '0.05em' }}>{brand}</div>
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
        <div style={{ padding: '20px 16px 18px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 34, height: 34, background: '#FFE000', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Wrench size={18} color="#000" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#FFE000', letterSpacing: '0.05em' }}>{brand}</div>
              <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{tagline}</div>
            </div>
          </div>
        </div>

        {/* Nav sections */}
        <nav style={{ padding: '12px 10px', flex: 1 }}>
          {sections.map(section => (
            <div key={section.label} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#3d3d3d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', padding: '6px 8px 4px' }}>
                {section.label}
              </div>
              {section.links.map(({ id, label, icon: Icon }) => {
                const active = activeId === id;
                return (
                  <button
                    key={id}
                    onClick={() => navigate(id)}
                    style={{
                      width: '100%',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '8px 10px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      textAlign: 'left',
                      marginBottom: 1,
                      transition: 'all 0.12s',
                      background: active ? '#FFE000' : 'transparent',
                      color: active ? '#000' : '#777',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#1a1a1a'; (e.currentTarget as HTMLButtonElement).style.color = active ? '#000' : '#ccc'; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = active ? '#000' : '#777'; }}
                  >
                    <Icon size={15} color={active ? '#000' : '#555'} />
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px', borderTop: '1px solid #1a1a1a', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#666' }}>{userLabel}</span>
            <button
              onClick={onLogout}
              aria-label="Cerrar sesión"
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', display: 'flex', padding: 4 }}
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
