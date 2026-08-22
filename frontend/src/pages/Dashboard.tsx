import { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSalesReport } from '../hooks/useSalesReport';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { formatCurrency } from '../utils/formatters';
import './Dashboard.css';

type TimeRange = '1M' | '3M' | '6M' | '1Y';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_BACK: Record<Exclude<TimeRange, '1M'>, number> = { '3M': 2, '6M': 5, '1Y': 11 };

function getCutoffDate(timeRange: TimeRange) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);

  if (timeRange === '1M') {
    cutoff.setDate(cutoff.getDate() - 29);
    return cutoff;
  }

  // Dia 1 antes de trocar o mês: em 31/12, voltar um mês daria 31/11, que o
  // JavaScript normaliza para 01/12 e joga o corte no mês errado.
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - MONTHS_BACK[timeRange]);
  return cutoff;
}

function SearchableFilter({ label, options, value, onChange }: { label: string, options: string[], value: string, onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="filter-group" ref={ref}>
      <label>{label}</label>
      <div className="custom-select-wrapper">
        <div className="filter-select" onClick={() => { setIsOpen(!isOpen); setSearch(''); }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        </div>
        {isOpen && (
          <div className="filter-dropdown-menu">
            <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
              <input 
                type="text" className="input-standard" style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }} 
                placeholder="Pesquisar..." autoFocus value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="filter-dropdown-list">
              {filtered.map(opt => (
                <div key={opt} className={`filter-dropdown-item ${value === opt ? 'selected' : ''}`} onClick={() => { onChange(opt); setIsOpen(false); }}>
                  {opt}
                </div>
              ))}
              {filtered.length === 0 && <div className="filter-dropdown-item" style={{ color: 'var(--text-dim)', textAlign: 'center' }}>Nenhum encontrado</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="label">{label}</p>
        {payload.map((entry: any, index: number) => {
          const isRevenue = entry.dataKey === 'revenue';
          const name = isRevenue ? 'Receita Gerada' : 'Unidades Vendidas';
          const val = isRevenue ? formatCurrency(entry.value) : `${entry.value} un`;
          return (
            <p key={index} className="item" style={{ color: entry.color }}>
              {name}: {val}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

export function Dashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('1M');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedBrand, setSelectedBrand] = useState<string>('Todas');

  // Memorizado: uma data nova a cada render faria o hook refazer o fetch em loop.
  const cutoffDate = useMemo(() => getCutoffDate(timeRange), [timeRange]);
  const { soldItems, loading } = useSalesReport(cutoffDate);
  const { summary } = useDashboardSummary();

  const categories = useMemo(() => ['Todas', ...Array.from(new Set(soldItems.map(i => i.categoryName)))], [soldItems]);
  const brands = useMemo(() => ['Todas', ...Array.from(new Set(soldItems.map(i => i.brandName)))], [soldItems]);

  const filteredSoldItems = useMemo(() => {
    return soldItems.filter(item => {
      const matchCat = selectedCategory === 'Todas' || item.categoryName === selectedCategory;
      const matchBrand = selectedBrand === 'Todas' || item.brandName === selectedBrand;
      return matchCat && matchBrand;
    });
  }, [soldItems, selectedCategory, selectedBrand]);

  const periodKeyFor = (date: Date) => (
    timeRange === '1M'
      ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
      : `${MONTH_NAMES[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`
  );

  const temporalData = useMemo(() => {
    const groups: Record<string, { period: string, revenue: number, quantity: number, sortKey: string }> = {};

    // Buckets vazios primeiro, para o gráfico mostrar o período inteiro
    // mesmo nos dias/meses sem venda.
    const bucketCount = timeRange === '1M' ? 30 : MONTHS_BACK[timeRange] + 1;

    for (let i = 0; i < bucketCount; i++) {
      const d = new Date(cutoffDate);
      if (timeRange === '1M') d.setDate(d.getDate() + i);
      else d.setMonth(d.getMonth() + i);

      const periodKey = periodKeyFor(d);
      const sortKey = timeRange === '1M'
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;

      groups[periodKey] = { period: periodKey, revenue: 0, quantity: 0, sortKey };
    }

    filteredSoldItems.forEach(item => {
      const periodKey = periodKeyFor(new Date(item.date));
      if (groups[periodKey]) {
        groups[periodKey].revenue += item.revenue;
        groups[periodKey].quantity += item.quantity;
      }
    });

    return Object.values(groups).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredSoldItems, timeRange, cutoffDate]);

  // O relatório já vem limitado ao período, então não há segundo corte de data aqui.
  const topProductsData = useMemo(() => {
    const groups: Record<string, { name: string, quantity: number }> = {};

    filteredSoldItems.forEach(item => {
      if (!groups[item.productName]) groups[item.productName] = { name: item.productName, quantity: 0 };
      groups[item.productName].quantity += item.quantity;
    });

    return Object.values(groups).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  }, [filteredSoldItems]);

  const totalRevenue = temporalData.reduce((acc, curr) => acc + curr.revenue, 0);
  const totalItemsSold = temporalData.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Dashboard</h1>
      </div>

      {loading ? (
        <div className="loading-state" style={{ marginTop: '4rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}>📊</div>
          Analisando inteligência de dados...
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card base-card profit">
              <span className="label">Receita Líquida Gerada</span>
              <h2 className="value">{formatCurrency(totalRevenue)}</h2>
              <span className="stat-note">já descontados os abatimentos</span>
            </div>
            <div className="stat-card base-card">
              <span className="label">Unidades Vendidas</span>
              <h2 className="value">{totalItemsSold}</h2>
            </div>
            <div className="stat-card base-card">
              <span className="label">Ticket Médio (Por Item)</span>
              <h2 className="value">{formatCurrency(totalItemsSold > 0 ? totalRevenue / totalItemsSold : 0)}</h2>
            </div>
          </div>

          {summary && (
            <div className="inventory-panel base-card">
              <div className="inventory-panel-header">
                <h3>Situação do Estoque</h3>
                <span className="text-dim">{summary.inventory.totalProducts} produtos cadastrados</span>
              </div>

              <div className="inventory-metrics">
                <div className="inventory-metric">
                  <span className="label">Valor em estoque</span>
                  <strong>{formatCurrency(summary.inventory.totalStockValue)}</strong>
                </div>
                <div className="inventory-metric">
                  <span className="label">Lucro previsto</span>
                  <strong className="text-success">{formatCurrency(summary.inventory.totalExpectedProfit)}</strong>
                </div>
                <div className={`inventory-metric ${summary.inventory.expiredItems > 0 ? 'is-alert' : ''}`}>
                  <span className="label">Vencidos em estoque</span>
                  <strong>{summary.inventory.expiredItems}</strong>
                </div>
                <div className={`inventory-metric ${summary.inventory.expiringSoonItems > 0 ? 'is-warning' : ''}`}>
                  <span className="label">Vencem em {summary.inventory.expiryWarningDays} dias</span>
                  <strong>{summary.inventory.expiringSoonItems}</strong>
                </div>
                <div className={`inventory-metric ${summary.inventory.outOfStockItems > 0 ? 'is-warning' : ''}`}>
                  <span className="label">Esgotados</span>
                  <strong>{summary.inventory.outOfStockItems}</strong>
                </div>
                <div className="inventory-metric">
                  <span className="label">Vendas do mês</span>
                  <strong>{formatCurrency(summary.sales.currentMonthTotal)} <span className="text-dim">({summary.sales.currentMonthCount})</span></strong>
                </div>
              </div>
            </div>
          )}

          <div className="dashboard-filters" style={{ alignItems: 'flex-end' }}>
            
            <div className="filter-group">
              <label>Período de Análise</label>
              <div className="time-pills">
                <button className={`time-pill ${timeRange === '1M' ? 'active' : ''}`} onClick={() => setTimeRange('1M')}>Mês</button>
                <button className={`time-pill ${timeRange === '3M' ? 'active' : ''}`} onClick={() => setTimeRange('3M')}>3 Meses</button>
                <button className={`time-pill ${timeRange === '6M' ? 'active' : ''}`} onClick={() => setTimeRange('6M')}>6 Meses</button>
                <button className={`time-pill ${timeRange === '1Y' ? 'active' : ''}`} onClick={() => setTimeRange('1Y')}>1 Ano</button>
              </div>
            </div>

            <SearchableFilter label="Filtrar por Categoria" options={categories} value={selectedCategory} onChange={setSelectedCategory} />
            <SearchableFilter label="Filtrar por Marca" options={brands} value={selectedBrand} onChange={setSelectedBrand} />
          </div>

          <div className="charts-grid">
            
            <div className="charts-left-column">
              
              <div className="chart-card base-card">
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0 }}>
                    Fluxo de Caixa 
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginLeft: '8px', fontWeight: 'normal' }}>
                      (R$)
                    </span>
                  </h3>
                </div>
                
                <div className="chart-container" style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={temporalData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="period" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis 
                        stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} 
                        tickFormatter={(v) => `R$${v}`} 
                        domain={[0, (dataMax: number) => Math.max(100, dataMax)]} 
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                      <Line type="monotone" dataKey="revenue" stroke="var(--success-color)" strokeWidth={3} dot={{ r: 3, fill: 'var(--success-color)' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card base-card">
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0 }}>
                    Volume de Vendas 
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginLeft: '8px', fontWeight: 'normal' }}>
                      (Unidades)
                    </span>
                  </h3>
                </div>
                
                <div className="chart-container" style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={temporalData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="period" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis 
                        stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} 
                        domain={[0, (dataMax: number) => Math.max(3, dataMax)]} 
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                      <Bar dataKey="quantity" fill="var(--accent-color)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            <div className="chart-card base-card">
              <h3>Ranking: Top 10 Produtos</h3>
              
              <div className="chart-container" style={{ width: '100%', height: 500, marginTop: '1.5rem' }}>
                {topProductsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={topProductsData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
                      <XAxis type="number" stroke="var(--text-dim)" fontSize={12} hide />
                      <YAxis type="category" dataKey="name" stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} width={120} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="quantity" fill="#00f2ff" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-cart" style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                    Nenhuma venda neste período.
                  </div>
                )}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}