import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { EMPTY_COUPON, type Coupon, type CouponForm } from '../components/settings/types';
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from '../services/settings';
import { getApiErrorMessage } from '../utils/errors';

/** Quanto tempo o cupom recém-criado fica em destaque na lista. */
export const NEW_HIGHLIGHT_MS = 8000;

/** O formulário ao editar: tudo vira texto, como os campos entregam. */
function formOf(coupon: Coupon): CouponForm {
  return {
    code: coupon.code,
    type: coupon.type,
    value: String(coupon.value),
    minimumTotal: coupon.minimumTotal === null ? '' : String(coupon.minimumTotal),
    expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '',
    maxUses: coupon.maxUses === null ? '' : String(coupon.maxUses),
  };
}

/**
 * Os cupons e tudo o que se faz com eles na tela de Ajustes: listar, criar,
 * editar, ligar/desligar e apagar.
 *
 * O formulário está sempre aberto: em branco cria; ao escolher um cupom
 * (`startEdit`), traz os dados dele para editar. O cupom recém-criado sobe para
 * o topo da lista e ganha um destaque por alguns segundos.
 */
export function useCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_COUPON);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [newId, setNewId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listCoupons();
      setCoupons(res.data || []);
    } catch (err) {
      console.error('Erro ao carregar cupons:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // O destaque do cupom novo some sozinho.
  useEffect(() => {
    if (newId === null) return;
    const timer = window.setTimeout(() => setNewId(null), NEW_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [newId]);

  // Do mais novo para o mais antigo: o cupom que acabou de ser criado fica no topo.
  const sorted = [...coupons].sort((a, b) => b.id - a.id);
  const editing = coupons.find(c => c.id === editingId) ?? null;
  const activeCount = coupons.filter(c => c.status === 'active').length;

  const resetForm = () => { setEditingId(null); setForm(EMPTY_COUPON); setFormError(''); };

  const startEdit = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setForm(formOf(coupon));
    setFormError('');
    setMessage('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSaving(true);

    const body = {
      code: form.code,
      type: form.type,
      value: Number(form.value),
      minimumTotal: form.minimumTotal === '' ? null : Number(form.minimumTotal),
      expiresAt: form.expiresAt || null,
      maxUses: form.maxUses === '' ? null : Number(form.maxUses),
    };

    try {
      if (editing) {
        await updateCoupon(editing.id, body);
        setMessage('Cupom atualizado.');
      } else {
        const res = await createCoupon(body);
        setNewId(res.data?.id ?? null);
        setMessage('Cupom criado.');
      }
      resetForm();
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Não foi possível salvar o cupom.'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = async (coupon: Coupon) => {
    setListError('');
    try {
      await updateCoupon(coupon.id, {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minimumTotal: coupon.minimumTotal,
        expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : null,
        maxUses: coupon.maxUses,
        active: !coupon.active,
      });
      await load();
    } catch (err) {
      setListError(getApiErrorMessage(err, 'Não foi possível alterar o cupom.'));
    }
  };

  const remove = async (coupon: Coupon) => {
    setListError('');
    try {
      const res = await deleteCoupon(coupon.id);
      // Cupom já usado é desativado em vez de apagado — a API explica por quê.
      if (res.data?.message) setListError(res.data.message);
      if (editingId === coupon.id) resetForm();
      await load();
    } catch (err) {
      setListError(getApiErrorMessage(err, 'Não foi possível apagar o cupom.'));
    }
  };

  return {
    coupons, sorted, loading, activeCount,
    editing, editingId, newId,
    form, setForm, formError, listError, message, isSaving,
    startEdit, resetForm, submit, toggle, remove,
  };
}
