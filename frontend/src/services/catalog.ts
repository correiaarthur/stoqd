import { api } from '../api';
import type { Brand, Category, Product } from '../hooks/useProducts';

/** Marcas e categorias têm o mesmo CRUD; o recurso escolhe o endereço. */
export type TaxonomyResource = 'brands' | 'categories';

export const taxonomy = {
  list: <T extends Brand | Category>(resource: TaxonomyResource) => api.get<T[]>(`/${resource}`),
  create: (resource: TaxonomyResource, name: string) => api.post(`/${resource}`, { name }),
  rename: (resource: TaxonomyResource, id: number, name: string) => api.put(`/${resource}/${id}`, { name }),
  remove: (resource: TaxonomyResource, id: number) => api.delete(`/${resource}/${id}`),
};

export const listBrands = () => api.get<Brand[]>('/brands');
export const listCategories = () => api.get<Category[]>('/categories');

/** Estoque do admin (com custo e lucro). A vitrine pública usa `fetchShowcase`. */
export const listProducts = () => api.get<Product[]>('/products');

export const createProduct = (payload: unknown) => api.post('/products', payload);
export const updateProduct = (id: number, payload: unknown) => api.put(`/products/${id}`, payload);
export const deleteProduct = (id: number) => api.delete(`/products/${id}`);

/** `URLSearchParams` porque marca e categoria repetem a chave (`brand=A&brand=B`). */
export const fetchShowcase = <T>(params: URLSearchParams) => api.get<T>('/products/showcase', { params });

export const fetchShowcaseFacets = <T>(cartToken: string) =>
  api.get<T>('/products/showcase/facets', { params: { cartToken } });

/** Pede ao servidor permissão para enviar UMA foto; o arquivo vai direto ao bucket. */
export const requestProductImageUpload = (file: { type: string; size: number }) =>
  api.post<{ path: string; token: string; publicUrl: string }>('/uploads/product-image', {
    contentType: file.type,
    size: file.size,
  });
