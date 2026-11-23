import { useCoupons } from '../../hooks/useCoupons';
import { CouponFormPanel } from './CouponFormPanel';
import { CouponTable } from './CouponTable';

/**
 * Cupons com a estrutura de Clientes: a lista de linhas emolduradas à
 * esquerda e, à direita, o formulário — sempre aberto, sem botão para abri-lo
 * nem para fechá-lo. A lógica está em `useCoupons`.
 */
export function Coupons() {
  const {
    coupons, sorted, loading, activeCount, editing, editingId, newId,
    form, setForm, formError, listError, message, isSaving,
    startEdit, resetForm, submit, toggle, remove,
  } = useCoupons();

  return (
    <section id="cupons" className="st-coupons" aria-labelledby="cup-titulo">
      <div className="st-coupons-head">
        <h2 id="cup-titulo" className="st-h2"><span id="cupons-slot" className="st-slot">Cupons</span> <em>de desconto</em></h2>
        <span className="st-count">
          {coupons.length === 0
            ? 'Nenhum cupom ainda'
            : `${activeCount} valendo · ${coupons.length - activeCount} encerrados ou desligados`}
        </span>
      </div>
      <p className="st-coupons-text">
        O cliente digita o código no carrinho e vê o desconto na hora. O uso só é contado
        quando a venda é registrada de fato — pedido pendente não gasta cupom, e pedido
        recusado devolve.
      </p>

      {message && <div className="settings-success" role="status">{message}</div>}
      {listError && <div className="settings-error">{listError}</div>}

      <div className="cp-body has-panel">
        <CouponTable
          coupons={sorted}
          loading={loading}
          editingId={editingId}
          newId={newId}
          onEdit={startEdit}
          onToggle={toggle}
          onRemove={remove}
        />

        <CouponFormPanel
          form={form}
          onChange={setForm}
          editing={editing !== null}
          error={formError}
          isSaving={isSaving}
          onSubmit={submit}
          onCancel={resetForm}
        />
      </div>
    </section>
  );
}
